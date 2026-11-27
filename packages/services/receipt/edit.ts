import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray, ne, sql } from "@repo/database";
import { bankDetailsTable, dueSettlementsTable, duesTable, ledgerEntriesTable, ledgersTable, receiptsTable, transactionBankDetailsTable, transactionEditLogsTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import LedgerEngine from "../accounts/engine";
import type { ActorModel, PostingLine, ReceiptKind } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import { BANK_MODE_DB, type BankMode, SETTLED_IN_DB } from "../payment/model";
import SettingService from "../setting";
import type { Tx } from "../stock/engine";
import TransactionService from "../transaction";
import { moneyPartsIn } from "../transaction/settle";
import { type EditReceiptInputModel, editReceiptInputModel, type ReceiptForEditModel } from "./edit-model";
import DueService from "../due";
import PartyService from "../party";
import { gstOutOf, RECEIPT_TDS_RATE, RECEIVED_FOR_DB, type ReceiptIdInputModel, tdsOn } from "./model";

// the kind and how it came in, back from how the database keeps them
const KIND_OF = Object.fromEntries(Object.entries(RECEIVED_FOR_DB).map(([k, v]) => [v, k])) as Record<string, ReceiptKind>;
const MODE_OF = Object.fromEntries(Object.entries(BANK_MODE_DB).map(([k, v]) => [v, k])) as Record<string, BankMode>;

// the month a moment falls in, in India
const indiaMonth = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at).slice(0, 7);
const indiaDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);

// Editing a receipt (the admin's): how much came in, where it came into, whether TDS was deducted, the day (within its
// month) and the remarks. What it was received for and who it came from stay. Its old ledger effect is reversed and
// the new one posted; what it settled follows the new amount (a customer's dues oldest first again, a loan given back
// by the new amount, a loan taken's due made the new amount). Money already spent can't be taken back out of cash or
// a bank account. Each edit is kept in the edit log
export default class ReceiptEditService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly engine = new LedgerEngine(),
    private readonly settings = new SettingService(),
  ) {}

  // the receipt's transaction and row, its bank parts and the ledger it came from; locked inside a save
  private async load(q: Tx, transactionId: string, lock: boolean) {
    const base = q.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
    const [t] = lock ? await base.for("update") : await base;
    if (!t || t.type !== "receipt") throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found." });
    const [r] = await q.select().from(receiptsTable).where(eq(receiptsTable.transactionId, t.id));
    if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found." });
    const banks = await q
      .select()
      .from(transactionBankDetailsTable)
      .where(eq(transactionBankDetailsTable.transactionId, t.id))
      .orderBy(asc(transactionBankDetailsTable.createdAt), asc(transactionBankDetailsTable.id));
    const [from] = await q.select().from(ledgersTable).where(eq(ledgersTable.id, r.receivedFromLedgerId));
    return { t, r, banks, kind: KIND_OF[r.receivedFor]!, from: from! };
  }

  // why it can't be edited, if it can't: cancelled, or a scrap sale in a month whose GSTR-1 is filed
  private async blockedBy(q: Tx, t: { status: string; dateTime: Date }, r: { gstRate: string | null }) {
    if (t.status === "cancelled") return "cancelled" as const;
    if (r.gstRate !== null && (await this.transactions.filed(q, "gstr1", t.dateTime))) return "gstFiled" as const;
    return null;
  }

  // TDS can be deducted here: a party paying as a customer, or a borrower paying interest
  private tdsRateOf(kind: ReceiptKind, from: { referenceTable: string | null }) {
    return from.referenceTable === "parties" ? (RECEIPT_TDS_RATE[kind] ?? null) : null;
  }

  // the amount's limits: a loan taken can't go below what we've repaid of it; a loan given back can't go above what
  // was left of it before this receipt
  private async limits(q: Tx, transactionId: string, kind: ReceiptKind) {
    if (kind === "loanTaken") {
      const [due] = await q.select({ id: duesTable.id }).from(duesTable).where(eq(duesTable.transactionId, transactionId));
      if (!due) return { min: null, max: null, dueId: null };
      const [repaid] = await q
        .select({ paise: sql<string>`coalesce(sum(${dueSettlementsTable.amount}), 0)` })
        .from(dueSettlementsTable)
        .innerJoin(transactionsTable, eq(transactionsTable.id, dueSettlementsTable.transactionId))
        .where(and(eq(dueSettlementsTable.dueId, due.id), eq(transactionsTable.status, "active")));
      const min = Number(repaid?.paise ?? 0);
      return { min: min > 0 ? min : null, max: null, dueId: due.id };
    }
    if (kind === "loanReturned") {
      const [own] = await q.select({ dueId: dueSettlementsTable.dueId, amount: dueSettlementsTable.amount }).from(dueSettlementsTable).where(eq(dueSettlementsTable.transactionId, transactionId));
      if (!own) return { min: null, max: null, dueId: null };
      const [due] = await q.select({ amount: duesTable.amount }).from(duesTable).where(eq(duesTable.id, own.dueId));
      const [others] = await q
        .select({ paise: sql<string>`coalesce(sum(${dueSettlementsTable.amount}), 0)` })
        .from(dueSettlementsTable)
        .innerJoin(transactionsTable, eq(transactionsTable.id, dueSettlementsTable.transactionId))
        .where(and(eq(dueSettlementsTable.dueId, own.dueId), ne(dueSettlementsTable.transactionId, transactionId), eq(transactionsTable.status, "active")));
      return { min: null, max: (toPaise(due!.amount) - toPaise(others?.paise ?? "0")) / 100, dueId: own.dueId };
    }
    return { min: null, max: null, dueId: null };
  }

  // each ledger's balance now (debit as plus), and less this receipt's net on it: what it would hold without it, in paise
  private async heldWithout(q: Tx, transactionId: string, ledgerIds: string[]) {
    if (ledgerIds.length === 0) return new Map<string, { now: number; without: number }>();
    const ledgers = await q.select({ id: ledgersTable.id, balance: ledgersTable.balance, side: ledgersTable.balanceType }).from(ledgersTable).where(inArray(ledgersTable.id, ledgerIds));
    const entries = await q.select().from(ledgerEntriesTable).where(and(eq(ledgerEntriesTable.transactionId, transactionId), inArray(ledgerEntriesTable.ledgerId, ledgerIds)));
    const held = new Map(ledgers.map((l) => [l.id, { now: (l.side === "debit" ? 1 : -1) * toPaise(l.balance), without: (l.side === "debit" ? 1 : -1) * toPaise(l.balance) }]));
    for (const e of entries) held.get(e.ledgerId)!.without -= (e.transactionType === "debit" ? 1 : -1) * toPaise(e.amount);
    return held;
  }

  // where this receipt's money went, from its ledger entries (older bank receipts kept no bank rows): cash, then each
  // bank account in the order its rows were saved, each with what came in (paise) and, where a row was kept, how and
  // its reference
  private async placesOf(q: Tx, transactionId: string, bankRows: (typeof transactionBankDetailsTable.$inferSelect)[]) {
    const entries = await q.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.transactionId, transactionId));
    const net = new Map<string, number>();
    for (const e of entries) net.set(e.ledgerId, (net.get(e.ledgerId) ?? 0) + (e.transactionType === "debit" ? 1 : -1) * toPaise(e.amount));
    const ids = [...net].filter(([, p]) => p > 0).map(([id]) => id);
    const ledgers = ids.length ? await q.select({ id: ledgersTable.id, referenceTable: ledgersTable.referenceTable, referenceId: ledgersTable.referenceId }).from(ledgersTable).where(inArray(ledgersTable.id, ids)) : [];
    const cashId = await this.accounts.ledgerId(q, "cash");
    const order = (bankDetailsId: string) => {
      const i = bankRows.findIndex((b) => b.bankDetailsId === bankDetailsId);
      return i < 0 ? bankRows.length : i;
    };
    const banks = ledgers
      .filter((l) => l.referenceTable === "bank_details" && l.referenceId)
      .map((l) => {
        const row = bankRows.find((b) => b.bankDetailsId === l.referenceId);
        return { ledgerId: l.id, bankDetailsId: l.referenceId!, paise: net.get(l.id)!, mode: row ? MODE_OF[row.mode]! : null, referenceNumber: row?.referenceNumber ?? null, row: row ?? null };
      })
      .sort((a, b) => order(a.bankDetailsId) - order(b.bankDetailsId));
    const cash = (net.get(cashId) ?? 0) > 0 ? { ledgerId: cashId, paise: net.get(cashId)! } : null;
    return { cash, banks };
  }

  // the receipt as the edit form opens it
  async forEdit(input: ReceiptIdInputModel): Promise<ReceiptForEditModel> {
    return db.transaction(async (tx) => {
      const { t, r, banks: bankRows, kind, from } = await this.load(tx, input.transactionId, false);
      const { cash, banks } = await this.placesOf(tx, t.id, bankRows);
      const [b, ...more] = banks;
      const limits = await this.limits(tx, t.id, kind);
      const held = await this.heldWithout(tx, t.id, [...(cash ? [cash.ledgerId] : []), ...banks.map((x) => x.ledgerId)]);
      return {
        transactionId: t.id,
        assignedId: t.assignedId,
        dateTime: t.dateTime,
        receivedFor: kind,
        receivedFromName: r.receivedFromNameSnapshot,
        scrap: r.gstRate !== null,
        amount: Number(r.amount),
        settledIn: cash && b ? "cashAndBank" : b ? "bank" : "cash",
        cashAmount: (cash?.paise ?? 0) / 100,
        bankDetailsId: b?.bankDetailsId ?? null,
        bankAmount: (b?.paise ?? 0) / 100,
        bankMode: b?.mode ?? null,
        referenceNumber: b?.referenceNumber ?? null,
        cashReferenceNumber: r.referenceNumber,
        moreBankParts: more.map((x) => ({ bankDetailsId: x.bankDetailsId, amount: x.paise / 100, mode: x.mode, referenceNumber: x.referenceNumber })),
        tdsRate: this.tdsRateOf(kind, from),
        tdsDeducted: r.tdsApplicable === true,
        bankOnly: from.referenceTable === "lenders",
        remarks: t.remarks,
        minAmount: limits.min,
        maxAmount: limits.max,
        heldWithout: {
          cash: cash ? (held.get(cash.ledgerId)?.without ?? 0) / 100 : 0,
          banks: banks.map((p) => ({ bankDetailsId: p.bankDetailsId, amount: (held.get(p.ledgerId)?.without ?? 0) / 100 })),
        },
        editBlockedBy: await this.blockedBy(tx, t, r),
      };
    });
  }

  // saves an edit
  async edit(rawInput: EditReceiptInputModel, actor: ActorModel) {
    const input = editReceiptInputModel.parse(rawInput);
    const transactionId = await db.transaction(async (tx) => {
      const { t, r, banks: bankRows, kind, from } = await this.load(tx, input.transactionId, true);
      const old = await this.placesOf(tx, t.id, bankRows);
      const blocked = await this.blockedBy(tx, t, r);
      if (blocked === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "This receipt is cancelled." });
      if (blocked === "gstFiled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That month's GSTR-1 is filed, so this scrap sale can't be edited." });
      if (indiaMonth(input.dateTime) !== indiaMonth(t.dateTime)) throw new TRPCError({ code: "BAD_REQUEST", message: "The date stays in the receipt's own month." });
      // a bank or NBFC's loan comes into a bank account, never in cash
      if (from.referenceTable === "lenders" && input.settledIn !== "bank") throw new TRPCError({ code: "BAD_REQUEST", message: "A bank's loan comes into a bank account." });

      // the amount within its limits
      const amount = toPaise(input.amount);
      const limits = await this.limits(tx, t.id, kind);
      if (limits.min !== null && amount < toPaise(limits.min)) throw new TRPCError({ code: "BAD_REQUEST", message: `${rupeesOf(toPaise(limits.min))} of this loan is already repaid, so the amount can't be less.` });
      if (limits.max !== null && amount > toPaise(limits.max)) throw new TRPCError({ code: "BAD_REQUEST", message: "That's more than is left on the loan." });

      // TDS, at the law's rate, only where it can be deducted
      const rate = this.tdsRateOf(kind, from);
      if (input.tdsDeducted && rate === null) throw new TRPCError({ code: "BAD_REQUEST", message: "TDS applies to parties only." });
      const tds = input.tdsDeducted ? tdsOn(input.amount, rate!) : 0;
      const fromLedger = Math.round((input.amount + tds) * 100) / 100;

      // a scrap sale: the GST taken out of the new amount, as the buyer's state had it when saved
      let gst: ReturnType<typeof gstOutOf> | null = null;
      if (r.gstRate !== null) {
        const company = t.companySnapshot ?? (await this.settings.get("company", tx));
        gst = gstOutOf(amount, Number(r.gstRate), r.partyStateCodeSnapshot === company.stateCode);
      }

      // where it now came into, and what cash and the accounts it came into before and now would hold without it
      const into = await moneyPartsIn(tx, this.accounts, input);
      const newParts = new Map<string, number>();
      if (into.cashLedger && into.cashPart > 0) newParts.set(into.cashLedger, into.cashPart);
      if (into.bankLedger && into.bankPart > 0) newParts.set(into.bankLedger, (newParts.get(into.bankLedger) ?? 0) + into.bankPart);
      for (const m of into.more) newParts.set(m.ledger, (newParts.get(m.ledger) ?? 0) + m.part);
      const held = await this.heldWithout(tx, t.id, [...new Set([...(old.cash ? [old.cash.ledgerId] : []), ...old.banks.map((p) => p.ledgerId), ...newParts.keys()])]);
      // money already spent can't come back out: a place the edit takes below zero (and lower than it is now) keeps at
      // least what it's short without this receipt
      const cashId = await this.accounts.ledgerId(tx, "cash");
      for (const [ledgerId, { now, without }] of held) {
        const after = without + (newParts.get(ledgerId) ?? 0);
        if (after < 0 && after < now) {
          const least = rupeesOf(-without);
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: ledgerId === cashId ? `That cash is already spent. At least ${least} must have come in cash.` : `That money is already spent. At least ${least} must have come into that bank account.`,
          });
        }
      }

      // the ledgers again: the old effect reversed (on its own day), the new one posted on the receipt's day
      await this.engine.reverse(tx, { transactionId: t.id, dateTime: t.dateTime });
      const lines: PostingLine[] = [];
      for (const [ledgerId, paise] of newParts) lines.push({ ledgerId, side: "debit", amount: paise / 100 });
      if (tds > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "tdsReceivable"), side: "debit", amount: tds });
      if (gst) {
        lines.push({ ledgerId: from.id, side: "credit", amount: gst.taxable / 100 });
        if (gst.cgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputCgst"), side: "credit", amount: gst.cgst / 100 });
        if (gst.sgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputSgst"), side: "credit", amount: gst.sgst / 100 });
        if (gst.igst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputIgst"), side: "credit", amount: gst.igst / 100 });
      } else {
        lines.push({ ledgerId: kind === "interestReceived" ? await this.accounts.ledgerId(tx, "interestReceived") : from.id, side: "credit", amount: fromLedger });
      }
      await this.engine.post(tx, { transactionId: t.id, dateTime: input.dateTime, lines });

      // what it settled, by the new amount: a customer's dues oldest first again (with the TDS), a loan given back by
      // the new amount, a loan taken's due made the new amount
      if (kind === "customer" && from.referenceTable === "parties" && from.referenceId) {
        await tx.delete(dueSettlementsTable).where(eq(dueSettlementsTable.transactionId, t.id));
        await this.dues.settleOldestIn(tx, { kind: "debtor", partyId: from.referenceId, transactionId: t.id, amount: fromLedger });
      }
      if (kind === "loanReturned" && limits.dueId) {
        await tx.update(dueSettlementsTable).set({ amount: fromPaise(amount), updatedAt: new Date() }).where(and(eq(dueSettlementsTable.dueId, limits.dueId), eq(dueSettlementsTable.transactionId, t.id)));
      }
      if (kind === "loanTaken" && limits.dueId) await tx.update(duesTable).set({ amount: fromPaise(amount) }).where(eq(duesTable.id, limits.dueId));

      // the receipt as it now reads
      await tx
        .update(receiptsTable)
        .set({
          settledIn: SETTLED_IN_DB[input.settledIn],
          referenceNumber: input.settledIn === "bank" ? null : input.cashReferenceNumber,
          amount: fromPaise(amount),
          tdsApplicable: tds > 0,
          tdsRate: tds > 0 ? rate!.toFixed(2) : null,
          tdsAmount: tds > 0 ? fromPaise(toPaise(tds)) : null,
          ...(gst ? { taxableAmount: fromPaise(gst.taxable), cgstAmount: fromPaise(gst.cgst), sgstAmount: fromPaise(gst.sgst), igstAmount: fromPaise(gst.igst) } : {}),
        })
        .where(eq(receiptsTable.id, r.id));
      await tx.update(transactionsTable).set({ dateTime: input.dateTime, amount: fromPaise(amount), remarks: input.remarks }).where(eq(transactionsTable.id, t.id));

      // the bank parts, written again: the first account, then the others, a millisecond apart so they read back in
      // order; an account kept keeps the details it was saved with
      await tx.delete(transactionBankDetailsTable).where(eq(transactionBankDetailsTable.transactionId, t.id));
      const parts = [
        ...(input.settledIn !== "cash" && input.bankDetailsId ? [{ bankDetailsId: input.bankDetailsId, paise: into.bankPart, mode: input.bankMode!, referenceNumber: input.referenceNumber }] : []),
        ...input.moreBankParts.map((m, i) => ({ bankDetailsId: m.bankDetailsId, paise: into.more[i]!.part, mode: m.mode, referenceNumber: m.referenceNumber })),
      ];
      const accs = parts.length
        ? await tx
            .select({ id: bankDetailsTable.id, bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
            .from(bankDetailsTable)
            .where(inArray(bankDetailsTable.id, parts.map((p) => p.bankDetailsId)))
        : [];
      const savedAt = Date.now();
      for (const [i, p] of parts.entries()) {
        const kept = old.banks.find((o) => o.bankDetailsId === p.bankDetailsId)?.row;
        const acc = accs.find((a) => a.id === p.bankDetailsId);
        if (!acc) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the bank account." });
        await tx.insert(transactionBankDetailsTable).values({
          createdAt: new Date(savedAt + i),
          transactionId: t.id,
          bankDetailsId: p.bankDetailsId,
          amount: fromPaise(p.paise),
          mode: BANK_MODE_DB[p.mode],
          referenceNumber: p.referenceNumber,
          bankNameSnapshot: kept?.bankNameSnapshot ?? acc.bankName.slice(0, 100),
          bankAccountLast4Snapshot: kept?.bankAccountLast4Snapshot ?? acc.accountNumber.slice(-4),
          bankIfscSnapshot: kept ? kept.bankIfscSnapshot : (acc.ifsc?.slice(0, 11) ?? null),
        });
      }

      // the edit log: what changed, from what to what
      const placed = (cash: number, banks: { bankDetailsId: string; amount: number; mode: string | null; referenceNumber: string | null }[]) => ({ cash, banks });
      const changes = [
        { field: "date", old: indiaDay(t.dateTime), new: indiaDay(input.dateTime) },
        { field: "total", old: Number(r.amount), new: amount / 100 },
        {
          field: "receivedIn",
          old: placed((old.cash?.paise ?? 0) / 100, old.banks.map((b) => ({ bankDetailsId: b.bankDetailsId, amount: b.paise / 100, mode: b.mode, referenceNumber: b.referenceNumber }))),
          new: placed(into.cashPart / 100, parts.map((p) => ({ bankDetailsId: p.bankDetailsId, amount: p.paise / 100, mode: p.mode, referenceNumber: p.referenceNumber }))),
        },
        { field: "cashReference", old: r.referenceNumber, new: input.settledIn === "bank" ? null : input.cashReferenceNumber },
        { field: "tds", old: r.tdsAmount === null ? 0 : Number(r.tdsAmount), new: tds },
        { field: "remarks", old: t.remarks, new: input.remarks },
      ].filter((c) => JSON.stringify(c.old) !== JSON.stringify(c.new));
      // nothing changed: no edit is recorded
      if (changes.length > 0) await tx.insert(transactionEditLogsTable).values({ transactionId: t.id, editedById: actor.id, editedByName: actor.name.slice(0, 30), changes });
      return t.id;
    });
    return { transactionId };
  }
}

// an amount in rupees, Indian grouping, for an error message
const rupeesOf = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
