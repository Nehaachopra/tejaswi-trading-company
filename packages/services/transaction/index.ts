import { TRPCError } from "@trpc/server";
import { and, asc, db, desc, eq, gte, ilike, inArray, lt, lte, ne, or, sql } from "@repo/database";
import { dueSettlementsTable, duesTable, gstReturnFilingsTable, ledgerEntriesTable, ledgersTable, productGodownsTable, receiptsTable, saleOrderProductsTable, saleOrdersTable, saleProductsTable, saleReturnProductsTable, saleReturnsTable, salesTable, transactionsTable } from "@repo/database/schema";

import LedgerEngine from "../accounts/engine";
import type { ActorModel, PostingLine } from "../accounts/model";
import { fromPaise } from "../accounts/money";
import { LEDGERS } from "../accounts/structure";
import { queueCancelled } from "../document/queue";
import { undoPurchase } from "../purchase/undo";
import { saleOrderDelivered } from "../sale-order/delivered";
import StockEngine, { type Tx } from "../stock/engine";
import AssignedIdCounter, { type Prefix } from "./assigned-id";
import SettingService from "../setting";
import {
  type CancelTransactionInputModel,
  type HistoryMonthModel,
  cancelTransactionInputModel,
  type ListTransactionsInputModel,
  listTransactionsInputModel,
  type TransactionIdInputModel,
  type TransactionModel,
  type TransactionSummaryModel,
  type TransactionType,
} from "./model";

// the number each type's transactions carry: SA26100001
const PREFIX: Record<TransactionType, Prefix> = {
  sale: "SA",
  purchase: "PU",
  sale_return: "SR",
  purchase_return: "PR",
  receipt: "RE",
  payment: "PA",
  deposit: "DE",
  withdrawal: "WD",
  transfer: "TR",
  drawing: "DR",
  other: "OT",
  salary: "SL",
  opening_balance: "OB",
};

// the GST return whose filing locks a type's month: GSTR-1 for sales and sale returns, GSTR-3B for purchases, purchase
// returns and expense bills with GST (a payment carrying GST checks itself)
const LOCKED_BY: Partial<Record<TransactionType, "gstr1" | "gstr3b">> = {
  sale: "gstr1",
  sale_return: "gstr1",
  purchase: "gstr3b",
  purchase_return: "gstr3b",
};

// the ledgers reverse-charge GST is owed in until it's paid
const RCM_PAYABLES = [LEDGERS.rcmCgstPayable.name, LEDGERS.rcmSgstPayable.name, LEDGERS.rcmIgstPayable.name];

// a built-in ledger's key from its stored name, so screens can show it in the reader's language
const LEDGER_KEY = new Map<string, string>(Object.entries(LEDGERS).map(([key, l]) => [l.name, key]));

// who is looking: the admin sees every transaction, staff only their own
type Viewer = { id: string; role: string };

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Transaction not found." });

// the year and month of a date in India
const indiaMonth = (date: Date) => {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(date).split("-");
  return { year: Number(y), month: Number(m) };
};

// what every transaction shares: its number, saving it with its ledger lines in one go, cancelling it (reversing
// entries dated today, the number kept), the GST month lock, and /history. Each type (receipt, payment ...) builds on it
export default class TransactionService {
  constructor(
    private readonly engine = new LedgerEngine(),
    private readonly counter = new AssignedIdCounter(),
    private readonly settings = new SettingService(),
    private readonly stock = new StockEngine(),
  ) {}

  // whether the month a date falls in is locked by a filed return
  async filed(q: Pick<Tx, "select">, returnType: "gstr1" | "gstr3b", date: Date) {
    const { year, month } = indiaMonth(date);
    const [row] = await q
      .select({ year: gstReturnFilingsTable.year })
      .from(gstReturnFilingsTable)
      .where(and(eq(gstReturnFilingsTable.returnType, returnType), eq(gstReturnFilingsTable.year, year), eq(gstReturnFilingsTable.month, month)));
    return !!row;
  }

  // refuses a date in a month whose return is filed
  async assertOpen(q: Pick<Tx, "select">, returnType: "gstr1" | "gstr3b", date: Date) {
    if (await this.filed(q, returnType, date)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `That month's ${returnType === "gstr1" ? "GSTR-1" : "GSTR-3B"} is filed.` });
    }
  }

  // a new transaction, numbered from its own date's month, and its ledger lines; inside the save of its type's details,
  // so everything is saved together or not at all
  async create(
    tx: Tx,
    input: { type: TransactionType; subType?: string; dateTime: Date; amount: number; remarks: string | null; lines: PostingLine[]; isContra?: boolean },
    actor: ActorModel,
  ) {
    const assignedId = await this.counter.next(tx, PREFIX[input.type], input.dateTime);
    const [created] = await tx
      .insert(transactionsTable)
      .values({
        type: input.type,
        subType: input.subType ?? null,
        dateTime: input.dateTime,
        amount: fromPaise(Math.round(input.amount * 100)),
        assignedId,
        remarks: input.remarks,
        createdById: actor.id,
        createdByName: actor.name.slice(0, 30),
        // our details as they are now, so its invoice or voucher reads the same on any later date
        companySnapshot: await this.settings.get("company", tx),
      })
      .returning({ id: transactionsTable.id });
    await this.engine.post(tx, { transactionId: created!.id, dateTime: input.dateTime, lines: input.lines, isContra: input.isContra });
    return { id: created!.id, assignedId };
  }

  // why a transaction can't be cancelled, if it can't
  private async cancelBlockedBy(q: Pick<Tx, "select">, t: { id: string; type: TransactionType; status: string; dateTime: Date }): Promise<TransactionModel["cancelBlockedBy"]> {
    if (t.status === "cancelled") return "cancelled";
    // an opening balance is changed on the Opening balances page, not cancelled
    if (t.type === "opening_balance") return "openingBalance";
    const lockedBy = LOCKED_BY[t.type];
    if (lockedBy && (await this.filed(q, lockedBy, t.dateTime))) return "gstFiled";
    // a scrap sale is a receipt that carries GST: GSTR-1 locks its month too
    if (t.type === "receipt") {
      const [r] = await q.select({ gstRate: receiptsTable.gstRate }).from(receiptsTable).where(eq(receiptsTable.transactionId, t.id));
      if (r?.gstRate != null && (await this.filed(q, "gstr1", t.dateTime))) return "gstFiled";
    }
    // reverse-charge GST it booked (rent from a landlord with no GSTIN) that's since been paid: taking it back would
    // leave more paid than owed, so the Tax paid payment is cancelled first
    if (t.type === "payment") {
      const owed = await q
        .select({ booked: ledgerEntriesTable.amount, left: ledgersTable.balance, side: ledgersTable.balanceType })
        .from(ledgerEntriesTable)
        .innerJoin(ledgersTable, eq(ledgersTable.id, ledgerEntriesTable.ledgerId))
        .where(
          and(
            eq(ledgerEntriesTable.transactionId, t.id),
            eq(ledgerEntriesTable.transactionType, "credit"),
            eq(ledgerEntriesTable.isReversal, false),
            inArray(ledgersTable.name, RCM_PAYABLES),
          ),
        );
      if (owed.some((o) => Number(o.booked) > (o.side === "credit" ? Number(o.left) : 0))) return "rcmPaid";
    }
    // a sale the customer has since paid towards (a receipt settled its due): that receipt is cancelled first. What a
    // cash sale settled itself doesn't count
    if (t.type === "sale") {
      const paid = await q
        .select({ id: dueSettlementsTable.id })
        .from(dueSettlementsTable)
        .innerJoin(duesTable, eq(duesTable.id, dueSettlementsTable.dueId))
        .innerJoin(transactionsTable, eq(transactionsTable.id, dueSettlementsTable.transactionId))
        .where(and(eq(duesTable.transactionId, t.id), ne(dueSettlementsTable.transactionId, t.id), eq(transactionsTable.status, "active")))
        .limit(1);
      if (paid.length > 0) return "salePaid";
      // goods came back on a return still in place: that return is cancelled first
      const [sale] = await q.select({ id: salesTable.id }).from(salesTable).where(eq(salesTable.transactionId, t.id));
      if (sale) {
        const returned = await q
          .select({ id: saleReturnsTable.id })
          .from(saleReturnsTable)
          .innerJoin(transactionsTable, eq(transactionsTable.id, saleReturnsTable.transactionId))
          .where(and(eq(saleReturnsTable.saleId, sale.id), eq(transactionsTable.status, "active")))
          .limit(1);
        if (returned.length > 0) return "saleReturned";
        // an exchange's new sale goes with its return: that return is cancelled instead
        const [exchange] = await q.select({ id: saleReturnsTable.id }).from(saleReturnsTable).where(eq(saleReturnsTable.exchangeSaleId, sale.id));
        if (exchange) return "exchangeSale";
      }
    }
    // a purchase we've since paid towards (a payment settled its due): that payment is cancelled first. What a cash
    // purchase paid itself doesn't count
    if (t.type === "purchase") {
      const paid = await q
        .select({ id: dueSettlementsTable.id })
        .from(dueSettlementsTable)
        .innerJoin(duesTable, eq(duesTable.id, dueSettlementsTable.dueId))
        .innerJoin(transactionsTable, eq(transactionsTable.id, dueSettlementsTable.transactionId))
        .where(and(eq(duesTable.transactionId, t.id), ne(dueSettlementsTable.transactionId, t.id), eq(transactionsTable.status, "active")))
        .limit(1);
      if (paid.length > 0) return "purchasePaid";
    }
    return null;
  }

  // cancels a transaction: its ledger effect is reversed by entries dated today, it keeps its number and is marked
  // cancelled with the reason, never deleted. Blocked in a filed GST month (a return is used instead)
  async cancel(rawInput: CancelTransactionInputModel, actor: ActorModel): Promise<TransactionModel> {
    const input = cancelTransactionInputModel.parse(rawInput);
    await db.transaction(async (tx) => {
      const [t] = await tx.select().from(transactionsTable).where(eq(transactionsTable.id, input.id)).for("update");
      if (!t) throw notFound();
      const blocked = await this.cancelBlockedBy(tx, t);
      if (blocked === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "This transaction is already cancelled." });
      if (blocked === "openingBalance") throw new TRPCError({ code: "BAD_REQUEST", message: "Change opening balances on the Opening balances page." });
      if (blocked === "gstFiled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That month's GST return is filed. Use a return instead." });
      if (blocked === "rcmPaid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Its reverse-charge GST is already paid. Cancel that Tax paid payment first." });
      if (blocked === "purchasePaid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The supplier has been paid towards this purchase. Cancel that payment first." });
      if (blocked === "salePaid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The customer has paid towards this sale. Cancel that receipt first." });
      if (blocked === "saleReturned") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Goods came back on this sale. Cancel that sale return first." });
      if (blocked === "exchangeSale") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This sale was an exchange. Cancel its sale return; the sale is cancelled with it." });
      const now = new Date();
      await this.engine.reverse(tx, { transactionId: t.id, dateTime: now });
      // a sale return: its packs leave the godowns again and what it settled is owed again. An exchange's new sale is
      // cancelled with it, when nothing else holds that sale
      if (t.type === "sale_return") {
        // the exchange's sale first, so its packs are back before the return's leave again
        const exchangeSaleTx = await this.exchangeSaleOf(tx, t.id);
        if (exchangeSaleTx) {
          const [s] = await tx.select().from(transactionsTable).where(eq(transactionsTable.id, exchangeSaleTx)).for("update");
          if (s && s.status === "active") {
            const held = await this.cancelBlockedBy(tx, s);
            if (held && held !== "exchangeSale") {
              const why = held === "salePaid" ? "the customer has paid towards it" : held === "gstFiled" ? "that month's GSTR-1 is filed" : "goods came back on it";
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Its exchange sale ${s.assignedId} can't be cancelled: ${why}.` });
            }
            await this.engine.reverse(tx, { transactionId: s.id, dateTime: now });
            await this.undoSale(tx, s.id);
            await tx
              .update(transactionsTable)
              .set({ status: "cancelled", cancelledAt: now, cancelledById: actor.id, cancelledByName: actor.name.slice(0, 30), cancelReason: input.reason })
              .where(eq(transactionsTable.id, s.id));
            await queueCancelled(tx, s.id);
          }
        }
        await this.undoSaleReturn(tx, t.id);
      }
      // a sale: its packs go back into the godowns they left, and what the customer owed for it goes
      if (t.type === "sale") await this.undoSale(tx, t.id);
      // a purchase: its packs leave the godowns they came into, each pack's cost goes back, its due goes and an order
      // it completed is pending again
      if (t.type === "purchase") await undoPurchase(tx, t.id, this.stock);
      await tx
        .update(transactionsTable)
        .set({ status: "cancelled", cancelledAt: now, cancelledById: actor.id, cancelledByName: actor.name.slice(0, 30), cancelReason: input.reason })
        .where(eq(transactionsTable.id, t.id));
      // anything stored for it gets a cancelled version; the first stays as issued
      await queueCancelled(tx, t.id);
    });
    return this.get({ id: input.id });
  }

  // a sale cancelled: each godown gets back what left it (free stock again), and its due is dropped. An order's
  // dispatch: what the order waits for again is held back for it again (the rest is free), and an order it had
  // completed is pending again
  private async undoSale(tx: Tx, transactionId: string) {
    const [sale] = await tx.select({ id: salesTable.id, orderId: salesTable.orderId }).from(salesTable).where(eq(salesTable.transactionId, transactionId));
    if (!sale) return;
    const lines = await tx
      .select({ productId: saleProductsTable.productId, quantity: saleProductsTable.quantity, godownId: productGodownsTable.godownId })
      .from(saleProductsTable)
      .leftJoin(productGodownsTable, eq(productGodownsTable.id, saleProductsTable.productGodownId))
      .where(eq(saleProductsTable.saleId, sale.id));
    if (lines.some((l) => !l.godownId)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A godown this sale used is gone." });
    // how many of each item go back under the order's hold: what it waits for after this, less what it waited for before
    const holdAgain = new Map<string, number>();
    if (sale.orderId) {
      const [order] = await tx.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, sale.orderId)).for("update");
      if (order && order.status !== "cancelled") {
        const ordered = await tx
          .select({ productId: saleOrderProductsTable.productId, quantity: saleOrderProductsTable.quantityOrdered })
          .from(saleOrderProductsTable)
          .where(eq(saleOrderProductsTable.saleOrderId, order.id));
        // this sale still counts here: it's cancelled just after
        const went = await saleOrderDelivered(tx, order.id);
        for (const o of ordered) {
          const mine = lines.filter((l) => l.productId === o.productId).reduce((a, l) => a + l.quantity, 0);
          const gone = went.get(o.productId) ?? 0;
          holdAgain.set(o.productId, Math.max(0, o.quantity - (gone - mine)) - Math.max(0, o.quantity - gone));
        }
        if (order.status === "completed") await tx.update(saleOrdersTable).set({ status: "pending" }).where(eq(saleOrdersTable.id, order.id));
      }
    }
    await this.stock.apply(
      tx,
      lines.flatMap((l) => {
        const toHold = Math.min(l.quantity, holdAgain.get(l.productId) ?? 0);
        holdAgain.set(l.productId, (holdAgain.get(l.productId) ?? 0) - toHold);
        return [
          { productId: l.productId, godownId: l.godownId!, delta: toHold, reserved: true },
          { productId: l.productId, godownId: l.godownId!, delta: l.quantity - toHold },
        ];
      }),
    );
    // what it settled itself (its own bill, and older dues, which are owed again), then its due
    await tx.delete(dueSettlementsTable).where(eq(dueSettlementsTable.transactionId, transactionId));
    await tx.delete(duesTable).where(eq(duesTable.transactionId, transactionId));
  }

  // a sale return cancelled: each godown gives back what came into it, and what it settled on the customer's dues is
  // owed again
  private async undoSaleReturn(tx: Tx, transactionId: string) {
    const [r] = await tx.select({ id: saleReturnsTable.id }).from(saleReturnsTable).where(eq(saleReturnsTable.transactionId, transactionId));
    if (!r) return;
    const lines = await tx
      .select({ productId: saleProductsTable.productId, quantity: saleReturnProductsTable.quantity, godownId: productGodownsTable.godownId })
      .from(saleReturnProductsTable)
      .innerJoin(saleProductsTable, eq(saleProductsTable.id, saleReturnProductsTable.saleProductId))
      .leftJoin(productGodownsTable, eq(productGodownsTable.id, saleReturnProductsTable.productGodownId))
      .where(eq(saleReturnProductsTable.returnId, r.id));
    if (lines.some((l) => !l.godownId)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A godown this return used is gone." });
    await this.stock.apply(tx, lines.map((l) => ({ productId: l.productId, godownId: l.godownId!, delta: -l.quantity })));
    await tx.delete(dueSettlementsTable).where(eq(dueSettlementsTable.transactionId, transactionId));
  }

  // a sale return's exchange sale (its transaction), if it had one
  private async exchangeSaleOf(tx: Tx, transactionId: string) {
    const [s] = await tx
      .select({ transactionId: salesTable.transactionId })
      .from(saleReturnsTable)
      .innerJoin(salesTable, eq(salesTable.id, saleReturnsTable.exchangeSaleId))
      .where(eq(saleReturnsTable.transactionId, transactionId));
    return s?.transactionId ?? null;
  }

  // /history: newest first, a page at a time. Staff see only what they made; opening balances stay on their own page
  async list(rawInput: ListTransactionsInputModel, viewer: Viewer): Promise<TransactionSummaryModel[]> {
    const input = listTransactionsInputModel.parse(rawInput);
    const search = input.search ? `%${input.search.replace(/[%_\\]/g, "\\$&")}%` : null;
    // the last row shown: its date and id
    const [beforeAt, beforeId] = input.cursor?.split("|") ?? [];
    const before = beforeAt && beforeId && !Number.isNaN(Date.parse(beforeAt)) ? { dateTime: new Date(beforeAt), id: beforeId } : null;
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          ne(transactionsTable.type, "opening_balance"),
          viewer.role === "admin" ? undefined : eq(transactionsTable.createdById, viewer.id),
          input.types.length ? inArray(transactionsTable.type, input.types) : undefined,
          input.status ? eq(transactionsTable.status, input.status) : undefined,
          input.from ? gte(transactionsTable.dateTime, input.from) : undefined,
          input.to ? lte(transactionsTable.dateTime, input.to) : undefined,
          input.minAmount !== null ? gte(transactionsTable.amount, String(input.minAmount)) : undefined,
          input.maxAmount !== null ? lte(transactionsTable.amount, String(input.maxAmount)) : undefined,
          search ? or(ilike(transactionsTable.assignedId, search), ilike(transactionsTable.remarks, search)) : undefined,
          // the page after the last one shown
          before ? or(lt(transactionsTable.dateTime, before.dateTime), and(eq(transactionsTable.dateTime, before.dateTime), lt(transactionsTable.id, before.id))) : undefined,
        ),
      )
      .orderBy(desc(transactionsTable.dateTime), desc(transactionsTable.id))
      .limit(input.limit);
    return rows.map((t) => ({
      id: t.id,
      type: t.type,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      amount: Number(t.amount),
      remarks: t.remarks,
      status: t.status,
      createdByName: t.createdByName,
      createdAt: t.createdAt,
    }));
  }

  // the months holding a transaction the viewer can see (in India), newest first: what /history's Month filter offers
  async months(viewer: Viewer): Promise<HistoryMonthModel[]> {
    const ym = sql<string>`to_char(${transactionsTable.dateTime} at time zone 'Asia/Kolkata', 'YYYY-MM')`;
    const rows = await db
      .selectDistinct({ ym })
      .from(transactionsTable)
      .where(and(ne(transactionsTable.type, "opening_balance"), viewer.role === "admin" ? undefined : eq(transactionsTable.createdById, viewer.id)))
      .orderBy(desc(ym));
    return rows.map((r) => ({ year: Number(r.ym.slice(0, 4)), month: Number(r.ym.slice(5, 7)) }));
  }

  // one transaction in full, with every line it posted; staff only one they made (anyone else's reads as not found)
  async get(input: TransactionIdInputModel, viewer?: Viewer): Promise<TransactionModel> {
    const [t] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, input.id));
    if (!t || (viewer && viewer.role !== "admin" && t.createdById !== viewer.id)) throw notFound();
    const lines = await db
      .select({ entry: ledgerEntriesTable, ledgerName: ledgersTable.name, referenceId: ledgersTable.referenceId })
      .from(ledgerEntriesTable)
      .innerJoin(ledgersTable, eq(ledgersTable.id, ledgerEntriesTable.ledgerId))
      .where(eq(ledgerEntriesTable.transactionId, t.id))
      .orderBy(asc(ledgerEntriesTable.createdAt), sql`${ledgerEntriesTable.transactionType} desc`);
    return {
      id: t.id,
      type: t.type,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      amount: Number(t.amount),
      remarks: t.remarks,
      status: t.status,
      createdByName: t.createdByName,
      createdAt: t.createdAt,
      cancelledAt: t.cancelledAt,
      cancelledByName: t.cancelledByName,
      cancelReason: t.cancelReason,
      lines: lines.map(({ entry: e, ledgerName, referenceId }) => ({
        ledgerId: e.ledgerId,
        ledgerName,
        ledgerKey: referenceId === null ? (LEDGER_KEY.get(ledgerName) ?? null) : null,
        side: e.transactionType,
        amount: Number(e.amount),
        isReversal: e.isReversal,
        dateTime: e.dateTime,
      })),
      cancelBlockedBy: await this.cancelBlockedBy(db, t),
    };
  }
}
