import { TRPCError } from "@trpc/server";
import { and, asc, db, desc, eq, gte, ilike, inArray, lt, lte, ne, or, sql } from "@repo/database";
import { dueSettlementsTable, duesTable, gstReturnFilingsTable, ledgerEntriesTable, ledgersTable, productGodownsTable, receiptsTable, saleOrderProductsTable, saleOrdersTable, purchaseProductsTable, purchaseReturnProductsTable, purchaseReturnsTable, purchasesTable, returnDeliveriesTable, saleProductsTable, saleReturnProductsTable, saleReturnsTable, salesTable, transactionEditLogsTable, transactionsTable } from "@repo/database/schema";

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
    // (a transaction with nothing to post saves without ledger entries)
    if (input.lines.length > 0) await this.engine.post(tx, { transactionId: created!.id, dateTime: input.dateTime, lines: input.lines, isContra: input.isContra });
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
      const [purchase] = await q.select({ id: purchasesTable.id }).from(purchasesTable).where(eq(purchasesTable.transactionId, t.id));
      if (purchase) {
        // goods went back on a return still in place: that return stands, so the purchase does too
        const returned = await q
          .select({ id: purchaseReturnsTable.id })
          .from(purchaseReturnsTable)
          .innerJoin(transactionsTable, eq(transactionsTable.id, purchaseReturnsTable.transactionId))
          .where(and(eq(purchaseReturnsTable.purchaseId, purchase.id), eq(transactionsTable.status, "active")))
          .limit(1);
        if (returned.length > 0) return "purchaseReturned";
        // a return's replaced packs came on it: it goes with that return
        const [delivery] = await q.select({ id: returnDeliveriesTable.id }).from(returnDeliveriesTable).where(eq(returnDeliveriesTable.deliveryTransactionId, t.id)).limit(1);
        if (delivery) return "replacementPurchase";
      }
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
      // a sale return stands: it's never cancelled
      if (t.type === "sale_return") throw new TRPCError({ code: "BAD_REQUEST", message: "A sale return can't be cancelled." });
      if (t.type === "purchase_return") throw new TRPCError({ code: "BAD_REQUEST", message: "A purchase return can't be cancelled." });
      const blocked = await this.cancelBlockedBy(tx, t);
      if (blocked === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "This transaction is already cancelled." });
      if (blocked === "openingBalance") throw new TRPCError({ code: "BAD_REQUEST", message: "Change opening balances on the Opening balances page." });
      if (blocked === "gstFiled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That month's GST return is filed. Use a return instead." });
      if (blocked === "rcmPaid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Its reverse-charge GST is already paid. Cancel that Tax paid payment first." });
      if (blocked === "purchasePaid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The supplier has been paid towards this purchase. Cancel that payment first." });
      if (blocked === "salePaid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The customer has paid towards this sale. Cancel that receipt first." });
      if (blocked === "saleReturned") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Goods came back on this sale, so it can't be cancelled." });
      if (blocked === "exchangeSale") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This sale was an exchange, so it can't be cancelled." });
      if (blocked === "replacementPurchase") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A return's replaced packs came on this purchase, so it can't be cancelled." });
      if (blocked === "purchaseReturned") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Goods went back on this purchase, so it can't be cancelled." });
      const now = new Date();
      await this.engine.reverse(tx, { transactionId: t.id, dateTime: now });
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
          // a sale return shows under its sale (its log), not as a row of its own
          ne(transactionsTable.type, "sale_return"),
          ne(transactionsTable.type, "purchase_return"),
          // a return's replacement sale shows under that return (its sale's Returns log), not as a row of its own
          sql`not exists (select 1 from ${saleReturnsTable} sr inner join ${salesTable} s on s.id = sr.exchange_sale_id inner join ${transactionsTable} rt on rt.id = sr.transaction_id where s.transaction_id = ${transactionsTable.id} and rt.status = 'active')`,
          // a purchase return's replacement purchase shows under that return (its debit note's Replacements), not as a
          // row of its own
          sql`not exists (select 1 from ${returnDeliveriesTable} rd inner join ${transactionsTable} rt on rt.id = rd.return_transaction_id where rd.delivery_transaction_id = ${transactionsTable.id} and rt.status = 'active')`,
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
    const edits = await this.lastEdits(rows.map((t) => t.id));
    const returned = new Map([
      ...(await this.returnedOf(rows.filter((t) => t.type === "sale").map((t) => t.id))),
      ...(await this.purchaseReturnedOf(rows.filter((t) => t.type === "purchase").map((t) => t.id))),
    ]);
    const paidIn = await this.paidInOf(rows);
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
      lastEditedAt: edits.get(t.id)?.at ?? null,
      lastEditedByName: edits.get(t.id)?.by ?? null,
      returned: returned.get(t.id) ?? null,
      transactedIn: paidIn.get(t.id) ?? null,
    }));
  }

  // each sale's and purchase's Cash or Credit, as it was saved (other types: none)
  private async paidInOf(rows: { id: string; type: string }[]) {
    const out = new Map<string, "cash" | "credit">();
    const saleIds = rows.filter((t) => t.type === "sale").map((t) => t.id);
    const purchaseIds = rows.filter((t) => t.type === "purchase").map((t) => t.id);
    if (saleIds.length)
      for (const s of await db.select({ id: salesTable.transactionId, kind: salesTable.transactedIn }).from(salesTable).where(inArray(salesTable.transactionId, saleIds)))
        out.set(s.id, s.kind as "cash" | "credit");
    if (purchaseIds.length)
      for (const p of await db.select({ id: purchasesTable.transactionId, kind: purchasesTable.transactedIn }).from(purchasesTable).where(inArray(purchasesTable.transactionId, purchaseIds)))
        out.set(p.id, p.kind as "cash" | "credit");
    return out;
  }

  // each sale with goods back on it (by returns still in place, any quantity): Returned
  private async returnedOf(saleTransactionIds: string[]) {
    const out = new Map<string, "returned" | "pending">();
    if (saleTransactionIds.length === 0) return out;
    const back = await db
      .select({ transactionId: salesTable.transactionId, quantity: sql<number>`sum(${saleReturnProductsTable.quantity})::int` })
      .from(saleReturnProductsTable)
      .innerJoin(saleReturnsTable, eq(saleReturnsTable.id, saleReturnProductsTable.returnId))
      .innerJoin(transactionsTable, eq(transactionsTable.id, saleReturnsTable.transactionId))
      .innerJoin(salesTable, eq(salesTable.id, saleReturnsTable.saleId))
      .where(and(inArray(salesTable.transactionId, saleTransactionIds), eq(transactionsTable.status, "active")))
      .groupBy(salesTable.transactionId);
    for (const b of back) if (b.quantity > 0) out.set(b.transactionId, "returned");
    return out;
  }

  // each purchase with goods gone back on it (by returns still in place, any quantity): Pending while a return's
  // replaced packs are still to come, else Returned
  private async purchaseReturnedOf(purchaseTransactionIds: string[]) {
    const out = new Map<string, "returned" | "pending">();
    if (purchaseTransactionIds.length === 0) return out;
    const rets = await db
      .select({ purchaseTransactionId: purchasesTable.transactionId, returnTransactionId: transactionsTable.id })
      .from(purchaseReturnsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, purchaseReturnsTable.transactionId))
      .innerJoin(purchasesTable, eq(purchasesTable.id, purchaseReturnsTable.purchaseId))
      .where(and(inArray(purchasesTable.transactionId, purchaseTransactionIds), eq(transactionsTable.status, "active")));
    const replaced = await this.replacedOn(rets.map((r) => r.returnTransactionId));
    for (const r of rets) {
      const x = replaced.get(r.returnTransactionId);
      if (x && x.back < x.sent) out.set(r.purchaseTransactionId, "pending");
      else if (!out.has(r.purchaseTransactionId)) out.set(r.purchaseTransactionId, "returned");
    }
    return out;
  }

  // each purchase return's replaced packs: how many were sent to be replaced, and how many have come back (on
  // purchases still in place); returns with nothing replaced are left out
  private async replacedOn(returnTransactionIds: string[]) {
    const out = new Map<string, { sent: number; back: number }>();
    if (returnTransactionIds.length === 0) return out;
    const sent = await db
      .select({ returnTransactionId: purchaseReturnsTable.transactionId, quantity: sql<number>`sum(${purchaseReturnProductsTable.quantity})::int` })
      .from(purchaseReturnProductsTable)
      .innerJoin(purchaseReturnsTable, eq(purchaseReturnsTable.id, purchaseReturnProductsTable.returnId))
      .where(and(inArray(purchaseReturnsTable.transactionId, returnTransactionIds), eq(purchaseReturnProductsTable.replaced, true)))
      .groupBy(purchaseReturnsTable.transactionId);
    const back = await db
      .select({ returnTransactionId: returnDeliveriesTable.returnTransactionId, quantity: sql<number>`sum(${returnDeliveriesTable.quantity})::int` })
      .from(returnDeliveriesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, returnDeliveriesTable.deliveryTransactionId))
      .where(and(inArray(returnDeliveriesTable.returnTransactionId, returnTransactionIds), eq(transactionsTable.status, "active")))
      .groupBy(returnDeliveriesTable.returnTransactionId);
    for (const r of sent) {
      if (r.quantity <= 0) continue;
      const b = back.find((x) => x.returnTransactionId === r.returnTransactionId)?.quantity ?? 0;
      out.set(r.returnTransactionId, { sent: r.quantity, back: Math.min(b, r.quantity) });
    }
    return out;
  }

  // a purchase's returns, oldest first, as a sale's: each one's ID, day, items, total, how it was settled and status
  private async purchaseReturnsOf(purchaseTransactionId: string): Promise<TransactionModel["returns"]> {
    const rows = await db
      .select({
        transactionId: transactionsTable.id,
        assignedId: transactionsTable.assignedId,
        returnDate: purchaseReturnsTable.returnDate,
        total: transactionsTable.amount,
        status: transactionsTable.status,
        transactedIn: purchaseReturnsTable.transactedIn,
        items: sql<number>`(select count(distinct ${purchaseProductsTable.productId})::int from ${purchaseReturnProductsTable} inner join ${purchaseProductsTable} on ${purchaseProductsTable.id} = ${purchaseReturnProductsTable.purchaseProductId} where ${purchaseReturnProductsTable.returnId} = ${purchaseReturnsTable.id})`,
      })
      .from(purchaseReturnsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, purchaseReturnsTable.transactionId))
      .innerJoin(purchasesTable, eq(purchasesTable.id, purchaseReturnsTable.purchaseId))
      .where(eq(purchasesTable.transactionId, purchaseTransactionId))
      .orderBy(asc(transactionsTable.dateTime), asc(transactionsTable.createdAt));
    const replaced = await this.replacedOn(rows.map((r) => r.transactionId));
    return rows.map((r) => ({
      transactionId: r.transactionId,
      assignedId: r.assignedId,
      returnDate: r.returnDate,
      items: r.items,
      total: Number(r.total),
      settledIn: r.transactedIn as "cash" | "credit" | "both",
      status: r.status === "cancelled" ? ("cancelled" as const) : ("active" as const),
      replacement: null,
      replaced: replaced.get(r.transactionId) ?? null,
    }));
  }

  // a purchase return's replacements: each purchase its replaced packs came back on (its ID, bill day, total, status),
  // oldest first, and how many packs are still to come
  private async replacementsOf(returnTransactionId: string): Promise<Pick<TransactionModel, "replacements" | "replacementsOwed" | "replacementsSent">> {
    const rows = await db
      .selectDistinct({
        transactionId: transactionsTable.id,
        assignedId: transactionsTable.assignedId,
        date: purchasesTable.invoiceDate,
        total: transactionsTable.amount,
        status: transactionsTable.status,
        createdAt: transactionsTable.createdAt,
      })
      .from(returnDeliveriesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, returnDeliveriesTable.deliveryTransactionId))
      .innerJoin(purchasesTable, eq(purchasesTable.transactionId, transactionsTable.id))
      .where(eq(returnDeliveriesTable.returnTransactionId, returnTransactionId))
      .orderBy(asc(purchasesTable.invoiceDate), asc(transactionsTable.createdAt));
    const x = (await this.replacedOn([returnTransactionId])).get(returnTransactionId);
    return {
      replacements: rows.map((r) => ({
        transactionId: r.transactionId,
        assignedId: r.assignedId,
        date: r.date,
        total: Number(r.total),
        status: r.status === "cancelled" ? ("cancelled" as const) : ("active" as const),
      })),
      replacementsOwed: x ? x.sent - x.back : 0,
      replacementsSent: x?.sent ?? 0,
    };
  }

  // a sale return's replacement: the sale it made for the items it replaced (its ID, day, total, status); none made: []
  private async saleReplacementsOf(returnTransactionId: string): Promise<TransactionModel["replacements"]> {
    const rows = await db
      .select({ transactionId: transactionsTable.id, assignedId: transactionsTable.assignedId, date: salesTable.invoiceDate, total: transactionsTable.amount, status: transactionsTable.status })
      .from(saleReturnsTable)
      .innerJoin(salesTable, eq(salesTable.id, saleReturnsTable.exchangeSaleId))
      .innerJoin(transactionsTable, eq(transactionsTable.id, salesTable.transactionId))
      .where(eq(saleReturnsTable.transactionId, returnTransactionId));
    return rows.map((r) => ({ transactionId: r.transactionId, assignedId: r.assignedId, date: r.date, total: Number(r.total), status: r.status === "cancelled" ? ("cancelled" as const) : ("active" as const) }));
  }

  // what share of a sale's or purchase's packs went back on returns still in place (replaced ones too), 0 to 100
  private async returnedShare(transactionId: string, type: TransactionType): Promise<number | null> {
    let had = 0;
    let back = 0;
    if (type === "sale") {
      const [h] = await db
        .select({ q: sql<number>`coalesce(sum(${saleProductsTable.quantity}), 0)::int` })
        .from(saleProductsTable)
        .innerJoin(salesTable, eq(salesTable.id, saleProductsTable.saleId))
        .where(eq(salesTable.transactionId, transactionId));
      const [b] = await db
        .select({ q: sql<number>`coalesce(sum(${saleReturnProductsTable.quantity}), 0)::int` })
        .from(saleReturnProductsTable)
        .innerJoin(saleReturnsTable, eq(saleReturnsTable.id, saleReturnProductsTable.returnId))
        .innerJoin(transactionsTable, eq(transactionsTable.id, saleReturnsTable.transactionId))
        .innerJoin(salesTable, eq(salesTable.id, saleReturnsTable.saleId))
        .where(and(eq(salesTable.transactionId, transactionId), eq(transactionsTable.status, "active")));
      had = h?.q ?? 0;
      back = b?.q ?? 0;
    } else if (type === "purchase") {
      const [h] = await db
        .select({ q: sql<number>`coalesce(sum(${purchaseProductsTable.quantity}), 0)::int` })
        .from(purchaseProductsTable)
        .innerJoin(purchasesTable, eq(purchasesTable.id, purchaseProductsTable.purchaseId))
        .where(eq(purchasesTable.transactionId, transactionId));
      const [b] = await db
        .select({ q: sql<number>`coalesce(sum(${purchaseReturnProductsTable.quantity}), 0)::int` })
        .from(purchaseReturnProductsTable)
        .innerJoin(purchaseReturnsTable, eq(purchaseReturnsTable.id, purchaseReturnProductsTable.returnId))
        .innerJoin(transactionsTable, eq(transactionsTable.id, purchaseReturnsTable.transactionId))
        .innerJoin(purchasesTable, eq(purchasesTable.id, purchaseReturnsTable.purchaseId))
        .where(and(eq(purchasesTable.transactionId, transactionId), eq(transactionsTable.status, "active")));
      had = h?.q ?? 0;
      back = b?.q ?? 0;
    } else return null;
    return had === 0 ? 0 : Math.min(100, Math.round((back / had) * 100));
  }

  // the return a sale or purchase was made as the replacement for (a sale: the return's exchange sale; a purchase: one
  // its replaced packs came on), if any
  private async replacementFor(transactionId: string, type: TransactionType): Promise<TransactionModel["replacementFor"]> {
    if (type === "purchase") {
      const [r] = await db
        .select({ transactionId: transactionsTable.id, assignedId: transactionsTable.assignedId })
        .from(returnDeliveriesTable)
        .innerJoin(transactionsTable, eq(transactionsTable.id, returnDeliveriesTable.returnTransactionId))
        .where(eq(returnDeliveriesTable.deliveryTransactionId, transactionId))
        .limit(1);
      return r ?? null;
    }
    if (type === "sale") {
      const [r] = await db
        .select({ transactionId: transactionsTable.id, assignedId: transactionsTable.assignedId })
        .from(saleReturnsTable)
        .innerJoin(salesTable, eq(salesTable.id, saleReturnsTable.exchangeSaleId))
        .innerJoin(transactionsTable, eq(transactionsTable.id, saleReturnsTable.transactionId))
        .where(eq(salesTable.transactionId, transactionId))
        .limit(1);
      return r ?? null;
    }
    return null;
  }

  // a sale's returns, oldest first: each one's ID, day, items, total, how it was settled, and status
  private async returnsOf(saleTransactionId: string): Promise<TransactionModel["returns"]> {
    const rows = await db
      .select({
        transactionId: transactionsTable.id,
        assignedId: transactionsTable.assignedId,
        returnDate: saleReturnsTable.returnDate,
        total: transactionsTable.amount,
        status: transactionsTable.status,
        transactedIn: saleReturnsTable.transactedIn,
        returnId: saleReturnsTable.id,
        exchangeSaleId: saleReturnsTable.exchangeSaleId,
        items: sql<number>`(select count(distinct ${saleProductsTable.productId})::int from ${saleReturnProductsTable} inner join ${saleProductsTable} on ${saleProductsTable.id} = ${saleReturnProductsTable.saleProductId} where ${saleReturnProductsTable.returnId} = ${saleReturnsTable.id})`,
      })
      .from(saleReturnsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, saleReturnsTable.transactionId))
      .innerJoin(salesTable, eq(salesTable.id, saleReturnsTable.saleId))
      .where(eq(salesTable.transactionId, saleTransactionId))
      .orderBy(asc(transactionsTable.dateTime), asc(transactionsTable.createdAt));
    // each replacement sale: its ID, when, and its total
    const saleIds = rows.map((r) => r.exchangeSaleId).filter((id): id is string => !!id);
    const replacements =
      saleIds.length === 0
        ? []
        : await db
            .select({ saleId: salesTable.id, transactionId: transactionsTable.id, assignedId: transactionsTable.assignedId, dateTime: transactionsTable.dateTime, total: transactionsTable.amount })
            .from(salesTable)
            .innerJoin(transactionsTable, eq(transactionsTable.id, salesTable.transactionId))
            .where(inArray(salesTable.id, saleIds));
    // each return's replaced packs: what went out again on its replacement sale of what came back (a pack size no more
    // than came back); they go out with the return, so all of them are back at once
    const replacedOf = new Map<string, number>();
    for (const r of rows) {
      if (!r.exchangeSaleId) continue;
      const back = await db
        .select({ productId: saleProductsTable.productId, quantity: sql<number>`sum(${saleReturnProductsTable.quantity})::int` })
        .from(saleReturnProductsTable)
        .innerJoin(saleProductsTable, eq(saleProductsTable.id, saleReturnProductsTable.saleProductId))
        .where(eq(saleReturnProductsTable.returnId, r.returnId))
        .groupBy(saleProductsTable.productId);
      const out = await db
        .select({ productId: saleProductsTable.productId, quantity: sql<number>`sum(${saleProductsTable.quantity})::int` })
        .from(saleProductsTable)
        .where(eq(saleProductsTable.saleId, r.exchangeSaleId))
        .groupBy(saleProductsTable.productId);
      const replaced = back.reduce((a, b) => a + Math.min(b.quantity, out.find((o) => o.productId === b.productId)?.quantity ?? 0), 0);
      if (replaced > 0) replacedOf.set(r.transactionId, replaced);
    }
    return rows.map((r) => ({
      transactionId: r.transactionId,
      assignedId: r.assignedId,
      returnDate: r.returnDate,
      items: r.items,
      total: Number(r.total),
      settledIn: r.exchangeSaleId ? "exchange" : (r.transactedIn as "cash" | "credit" | "both"),
      status: r.status === "cancelled" ? "cancelled" : "active",
      replacement: (() => {
        const s = replacements.find((x) => x.saleId === r.exchangeSaleId);
        return s ? { transactionId: s.transactionId, assignedId: s.assignedId, dateTime: s.dateTime, total: Number(s.total) } : null;
      })(),
      replaced: replacedOf.has(r.transactionId) ? { sent: replacedOf.get(r.transactionId)!, back: replacedOf.get(r.transactionId)! } : null,
    }));
  }

  // each transaction's last edit (the newest edit log row): when and by whom
  private async lastEdits(ids: string[]) {
    if (ids.length === 0) return new Map<string, { at: Date; by: string }>();
    const rows = await db
      .selectDistinctOn([transactionEditLogsTable.transactionId], {
        transactionId: transactionEditLogsTable.transactionId,
        at: transactionEditLogsTable.createdAt,
        by: transactionEditLogsTable.editedByName,
      })
      .from(transactionEditLogsTable)
      .where(inArray(transactionEditLogsTable.transactionId, ids))
      .orderBy(transactionEditLogsTable.transactionId, desc(transactionEditLogsTable.createdAt));
    return new Map(rows.map((r) => [r.transactionId, { at: r.at, by: r.by }]));
  }

  // the months holding a transaction the viewer can see (in India), newest first: what /history's Month filter offers
  async months(viewer: Viewer): Promise<HistoryMonthModel[]> {
    const ym = sql<string>`to_char(${transactionsTable.dateTime} at time zone 'Asia/Kolkata', 'YYYY-MM')`;
    const rows = await db
      .selectDistinct({ ym })
      .from(transactionsTable)
      .where(and(ne(transactionsTable.type, "opening_balance"), ne(transactionsTable.type, "sale_return"), ne(transactionsTable.type, "purchase_return"), viewer.role === "admin" ? undefined : eq(transactionsTable.createdById, viewer.id)))
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
    const edit = (await this.lastEdits([t.id])).get(t.id);
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
      lastEditedAt: edit?.at ?? null,
      lastEditedByName: edit?.by ?? null,
      returned:
        t.type === "sale"
          ? ((await this.returnedOf([t.id])).get(t.id) ?? null)
          : t.type === "purchase"
            ? ((await this.purchaseReturnedOf([t.id])).get(t.id) ?? null)
            : null,
      transactedIn: (await this.paidInOf([t])).get(t.id) ?? null,
      returns: t.type === "sale" ? await this.returnsOf(t.id) : t.type === "purchase" ? await this.purchaseReturnsOf(t.id) : [],
      replacementFor: await this.replacementFor(t.id, t.type),
      returnedShare: await this.returnedShare(t.id, t.type),
      ...(t.type === "purchase_return"
        ? await this.replacementsOf(t.id)
        : t.type === "sale_return"
          ? { replacements: await this.saleReplacementsOf(t.id), replacementsOwed: 0, replacementsSent: 0 }
          : { replacements: [], replacementsOwed: 0, replacementsSent: 0 }),
      edits: (
        await db
          .select({ at: transactionEditLogsTable.createdAt, byName: transactionEditLogsTable.editedByName, changes: transactionEditLogsTable.changes })
          .from(transactionEditLogsTable)
          .where(eq(transactionEditLogsTable.transactionId, t.id))
          .orderBy(desc(transactionEditLogsTable.createdAt))
      ).map((e) => ({ at: e.at, byName: e.byName, changes: e.changes.map((c) => ({ field: c.field, old: c.old, new: c.new })) })),
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
