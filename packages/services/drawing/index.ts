import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray, sql } from "@repo/database";
import {
  bankDetailsTable,
  categoriesTable,
  drawingProductsTable,
  drawingsTable,
  godownsTable,
  ledgerEntriesTable,
  productGodownsTable,
  productPricesTable,
  productsTable,
  subCategoriesTable,
  transactionsTable,
} from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel, LedgerSummaryModel, PostingLine } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import StockEngine, { type Tx } from "../stock/engine";
import { productNameSnapshot } from "../stock/index";
import TransactionService from "../transaction";
import { settleLedger } from "../transaction/settle";
import {
  type CreateDrawingInputModel,
  createDrawingInputModel,
  type DrawingIdInputModel,
  type DrawingModel,
  type SavedDrawingModel,
} from "./model";

// what a ledger holds today, debit as plus (cash and bank accounts hold a debit balance)
const held = (b: { amount: number; side: "debit" | "credit" } | undefined) => (b ? (b.side === "debit" ? 1 : -1) * b.amount : 0);

// Drawings (the admin's): what the owner takes out of the business for themselves. Money comes out of cash or one bank
// account (never more than it holds): Drawings up, the cash or account down. Goods leave the godowns at their weighted
// average cost, and the input GST claimed on them is reversed: Drawings up by both, Trading down by the cost and input
// GST down by the reversal (CGST and SGST, half each). Dated as a payment is; saved with the stock and the ledgers or
// not at all
export default class DrawingService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly stock = new StockEngine(),
  ) {}

  async create(rawInput: CreateDrawingInputModel, actor: ActorModel): Promise<SavedDrawingModel> {
    const input = createDrawingInputModel.parse(rawInput);
    const transactionId = await db.transaction(async (tx) => (input.kind === "money" ? this.money(tx, input, actor) : this.goods(tx, input, actor)));
    const [drawing, balances] = await Promise.all([this.get({ transactionId }), this.balances({ transactionId })]);
    return { ...drawing, balances };
  }

  // money: Drawings up, the cash or the bank account down, never more than it holds today
  private async money(tx: Tx, input: CreateDrawingInputModel, actor: ActorModel) {
    const amount = input.amount!;
    const from = await settleLedger(tx, this.accounts, input.bankDetailsId ? "bank" : "cash", input.bankDetailsId);
    const now = await this.accounts.balances([from]);
    const has = toPaise(held(now.get(from)?.today));
    if (toPaise(amount) > has) {
      const where = input.bankDetailsId ? "in that account" : "in cash";
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Only ₹${(has / 100).toLocaleString("en-IN")} is ${where}.` });
    }
    const t = await this.transactions.create(
      tx,
      {
        type: "drawing",
        dateTime: input.dateTime,
        amount: amount,
        remarks: input.remarks,
        lines: [
          { ledgerId: await this.accounts.ledgerId(tx, "drawings"), side: "debit", amount: amount },
          { ledgerId: from, side: "credit", amount: amount },
        ],
      },
      actor,
    );
    await tx.insert(drawingsTable).values({
      transactionId: t.id,
      drawingType: "cash",
      bankDetailsId: input.bankDetailsId,
      total: fromPaise(toPaise(amount)),
      remarks: input.remarks,
    });
    return t.id;
  }

  // goods: each pack size's part from each godown at its weighted average cost, the input GST on that cost reversed
  private async goods(tx: Tx, input: CreateDrawingInputModel, actor: ActorModel) {
    // each pack size: active, with a cost and a GST %, and its name as it reads today
    const ids = input.lines.map((l) => l.productId);
    const rows = await tx
      .select({ p: productsTable, gst: productPricesTable.gstPercent, categoryName: categoriesTable.name, subCategoryName: subCategoriesTable.name })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .innerJoin(subCategoriesTable, eq(subCategoriesTable.id, productsTable.subCategoryId))
      .leftJoin(productPricesTable, eq(productPricesTable.productId, productsTable.id))
      .where(inArray(productsTable.id, ids));
    const byId = new Map(rows.map((r) => [r.p.id, r]));
    const products = input.lines.map((l) => {
      const r = byId.get(l.productId);
      if (!r || r.p.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      const name = productNameSnapshot({ ...r.p, categoryName: r.categoryName, subCategoryName: r.subCategoryName });
      if (r.p.weightedAverageCost == null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${name} has no cost yet.` });
      if (r.gst == null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Set the GST % for ${name} first.` });
      return { name, unitCost: toPaise(Number(r.p.weightedAverageCost)), gstRate: Number(r.gst) };
    });

    // each part: its cost and the GST reversed on it, in paise
    const parts = input.lines.flatMap((l, i) =>
      l.godowns.map((g) => {
        const p = products[i]!;
        const cost = p.unitCost * g.quantity;
        return { productId: l.productId, product: p, godownId: g.godownId, quantity: g.quantity, cost, itc: Math.round((cost * p.gstRate) / 100) };
      }),
    );
    const cost = parts.reduce((a, p) => a + p.cost, 0);
    const itc = parts.reduce((a, p) => a + p.itc, 0);
    const total = cost + itc;
    if (total <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "These goods have no value." });

    // Drawings up by the cost and the GST reversed; Trading down by the cost, input CGST and SGST by half the reversal each
    const cgst = Math.floor(itc / 2);
    const lines: PostingLine[] = [
      { ledgerId: await this.accounts.ledgerId(tx, "drawings"), side: "debit", amount: total / 100 },
      { ledgerId: await this.accounts.ledgerId(tx, "trading"), side: "credit", amount: cost / 100 },
    ];
    if (cgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "inputCgst"), side: "credit", amount: cgst / 100 });
    if (itc - cgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "inputSgst"), side: "credit", amount: (itc - cgst) / 100 });
    const t = await this.transactions.create(tx, { type: "drawing", dateTime: input.dateTime, amount: total / 100, remarks: input.remarks, lines }, actor);

    // the packs leave each godown's free stock
    await this.stock.apply(
      tx,
      parts.map((p) => ({ productId: p.productId, godownId: p.godownId, delta: -p.quantity })),
    );

    // the drawing, then each part with its godown as it was named
    const [drawing] = await tx
      .insert(drawingsTable)
      .values({ transactionId: t.id, drawingType: "product", bankDetailsId: null, total: fromPaise(total), remarks: input.remarks })
      .returning({ id: drawingsTable.id });
    const godowns = await tx
      .select({ id: godownsTable.id, name: godownsTable.godownName })
      .from(godownsTable)
      .where(inArray(godownsTable.id, [...new Set(parts.map((p) => p.godownId))]));
    const holds = await tx
      .select({ id: productGodownsTable.id, productId: productGodownsTable.productId, godownId: productGodownsTable.godownId })
      .from(productGodownsTable)
      .where(inArray(productGodownsTable.productId, ids));
    await tx.insert(drawingProductsTable).values(
      parts.map((p) => {
        const hold = holds.find((h) => h.productId === p.productId && h.godownId === p.godownId);
        if (!hold) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Not enough stock of ${p.product.name}.` });
        return {
          drawingId: drawing!.id,
          productId: p.productId,
          productNameSnapshot: p.product.name.slice(0, 200),
          productGodownId: hold.id,
          godownName: godowns.find((g) => g.id === p.godownId)?.name ?? "",
          quantity: p.quantity,
          unitCost: fromPaise(p.product.unitCost),
          gstRate: Math.round(p.product.gstRate),
          itcReversalAmount: fromPaise(p.itc),
        };
      }),
    );
    return t.id;
  }

  // one's own details: the bank account money came out of (null for cash), or the goods with their cost and GST reversed
  async get(input: DrawingIdInputModel): Promise<DrawingModel> {
    const [row] = await db
      .select({ d: drawingsTable, t: transactionsTable })
      .from(drawingsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, drawingsTable.transactionId))
      .where(eq(drawingsTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
    const { d, t } = row;
    const [bank] = d.bankDetailsId ? await db.select().from(bankDetailsTable).where(eq(bankDetailsTable.id, d.bankDetailsId)) : [];
    const items =
      d.drawingType === "product"
        ? await db.select().from(drawingProductsTable).where(eq(drawingProductsTable.drawingId, d.id)).orderBy(asc(drawingProductsTable.createdAt))
        : [];
    const lines = items.map((l) => ({
      productId: l.productId,
      name: l.productNameSnapshot,
      godownName: l.godownName,
      quantity: l.quantity,
      unitCost: Number(l.unitCost),
      gstRate: l.gstRate,
      itcReversal: Number(l.itcReversalAmount),
    }));
    const itc = lines.reduce((a, l) => a + toPaise(l.itcReversal), 0);
    return {
      transactionId: t.id,
      kind: d.drawingType === "cash" ? "money" : "goods",
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      status: t.status === "cancelled" ? "cancelled" : "active",
      total: Number(d.total),
      bank: bank ? { id: bank.id, name: bank.bankName, last4: bank.accountNumber.slice(-4) } : null,
      lines,
      cost: (toPaise(Number(d.total)) - itc) / 100,
      itcReversal: itc / 100,
      remarks: t.remarks,
      createdByName: t.createdByName ?? "",
    };
  }

  // the ledgers a drawing moved (Drawings first, then what went down), each with its balance now
  async balances(input: DrawingIdInputModel): Promise<LedgerSummaryModel[]> {
    const lines = await db
      .select({ ledgerId: ledgerEntriesTable.ledgerId })
      .from(ledgerEntriesTable)
      .where(and(eq(ledgerEntriesTable.transactionId, input.transactionId)))
      .orderBy(sql`case when ${ledgerEntriesTable.transactionType} = 'debit' then 0 else 1 end`, asc(ledgerEntriesTable.createdAt));
    const ids = [...new Set(lines.map((l) => l.ledgerId))];
    const ledgers = await Promise.all(ids.map((id) => this.accounts.ledger({ id })));
    return ledgers.map(({ openingBalance: _o, hasEntries: _h, ...l }) => l);
  }
}
