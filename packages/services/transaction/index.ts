import { TRPCError } from "@trpc/server";
import { and, asc, db, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from "@repo/database";
import { gstReturnFilingsTable, ledgerEntriesTable, ledgersTable, transactionsTable } from "@repo/database/schema";

import LedgerEngine from "../accounts/engine";
import type { ActorModel, PostingLine } from "../accounts/model";
import { fromPaise } from "../accounts/money";
import { LEDGERS } from "../accounts/structure";
import type { Tx } from "../stock/engine";
import AssignedIdCounter, { type Prefix } from "./assigned-id";
import { COMPANY } from "./company";
import {
  type CancelTransactionInputModel,
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

// a built-in ledger's key from its stored name, so screens can show it in the reader's language
const LEDGER_KEY = new Map<string, string>(Object.entries(LEDGERS).map(([key, l]) => [l.name, key]));

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

  // refuses a date that isn't today in India (deposits, withdrawals, transfers, drawings and others)
  assertToday(date: Date) {
    const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
    if (day(date) !== day(new Date())) throw new TRPCError({ code: "BAD_REQUEST", message: "This can only be dated today." });
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
        companySnapshot: COMPANY,
      })
      .returning({ id: transactionsTable.id });
    await this.engine.post(tx, { transactionId: created!.id, dateTime: input.dateTime, lines: input.lines, isContra: input.isContra });
    return { id: created!.id, assignedId };
  }

  // why a transaction can't be cancelled, if it can't
  private async cancelBlockedBy(q: Pick<Tx, "select">, t: { type: TransactionType; status: string; dateTime: Date }): Promise<TransactionModel["cancelBlockedBy"]> {
    if (t.status === "cancelled") return "cancelled";
    // an opening balance is changed on the Opening balances page, not cancelled
    if (t.type === "opening_balance") return "openingBalance";
    const lockedBy = LOCKED_BY[t.type];
    if (lockedBy && (await this.filed(q, lockedBy, t.dateTime))) return "gstFiled";
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
      const now = new Date();
      await this.engine.reverse(tx, { transactionId: t.id, dateTime: now });
      await tx
        .update(transactionsTable)
        .set({ status: "cancelled", cancelledAt: now, cancelledById: actor.id, cancelledByName: actor.name.slice(0, 30), cancelReason: input.reason })
        .where(eq(transactionsTable.id, t.id));
    });
    return this.get({ id: input.id });
  }

  // /history: newest first, a page at a time
  async list(rawInput: ListTransactionsInputModel): Promise<TransactionSummaryModel[]> {
    const input = listTransactionsInputModel.parse(rawInput);
    const search = input.search ? `%${input.search.replace(/[%_\\]/g, "\\$&")}%` : null;
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          input.types.length ? inArray(transactionsTable.type, input.types) : undefined,
          input.status ? eq(transactionsTable.status, input.status) : undefined,
          input.from ? gte(transactionsTable.dateTime, input.from) : undefined,
          input.to ? lte(transactionsTable.dateTime, input.to) : undefined,
          input.minAmount !== null ? gte(transactionsTable.amount, String(input.minAmount)) : undefined,
          input.maxAmount !== null ? lte(transactionsTable.amount, String(input.maxAmount)) : undefined,
          search ? or(ilike(transactionsTable.assignedId, search), ilike(transactionsTable.remarks, search)) : undefined,
          // the page after the last one shown
          input.beforeDateTime && input.beforeId
            ? or(lt(transactionsTable.dateTime, input.beforeDateTime), and(eq(transactionsTable.dateTime, input.beforeDateTime), lt(transactionsTable.id, input.beforeId)))
            : undefined,
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

  // one transaction in full, with every line it posted
  async get(input: TransactionIdInputModel): Promise<TransactionModel> {
    const [t] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, input.id));
    if (!t) throw notFound();
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
