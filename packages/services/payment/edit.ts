import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray, ne, sql } from "@repo/database";
import {
  dueSettlementsTable,
  duesTable,
  ledgerEntriesTable,
  ledgersTable,
  paymentsTable,
  transactionBankDetailsTable,
  transactionEditLogsTable,
  transactionsTable,
} from "@repo/database/schema";

import AccountsService from "../accounts";
import LedgerEngine from "../accounts/engine";
import type { ActorModel, PaymentKind } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import DueService from "../due";
import PartyService from "../party";
import type { Tx } from "../stock/engine";
import TransactionService from "../transaction";
import PaymentService from ".";
import { type EditPaymentInputModel, editPaymentInputModel, type PaymentForEditModel } from "./edit-model";
import { BANK_MODE_DB, type BankMode, PAID_FOR_DB, type PaymentIdInputModel } from "./model";

// the kind and how a bank part was paid, back from how the database keeps them
const KIND_OF = Object.fromEntries(Object.entries(PAID_FOR_DB).map(([k, v]) => [v, k])) as Record<string, PaymentKind>;
const MODE_OF = Object.fromEntries(Object.entries(BANK_MODE_DB).map(([k, v]) => [v, k])) as Record<string, BankMode>;

// a moment's day and month, in India
const indiaDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);
const indiaMonth = (at: Date) => indiaDay(at).slice(0, 7);

// an amount in rupees, Indian grouping, for an error message
const rupeesOf = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Editing a payment (the admin's): the payment form again, over the saved payment, what it was paid for fixed. Its old
// ledger effect is reversed (on its own day), what it settled and its rows taken away, and the payment form's own save
// writes it again under its own number, on its own month's day. A loan given keeps its due, and what came back on it. Each edit is
// kept in the edit log
export default class PaymentEditService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly payments = new PaymentService(accounts, transactions, parties),
    private readonly engine = new LedgerEngine(),
  ) {}

  // the payment's transaction, row and bank parts; locked inside a save
  private async load(q: Tx, transactionId: string, lock: boolean) {
    const base = q.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
    const [t] = lock ? await base.for("update") : await base;
    if (!t || t.type !== "payment") throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
    const [p] = await q.select().from(paymentsTable).where(eq(paymentsTable.transactionId, t.id));
    if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
    const banks = await q
      .select()
      .from(transactionBankDetailsTable)
      .where(eq(transactionBankDetailsTable.transactionId, t.id))
      .orderBy(asc(transactionBankDetailsTable.createdAt), asc(transactionBankDetailsTable.id));
    return { t, p, banks, kind: KIND_OF[p.paidFor]! };
  }

  // why it can't be edited, if it can't: cancelled, GST in a month whose GSTR-3B is filed, or its reverse-charge GST
  // since paid
  private async blockedBy(q: Tx, t: typeof transactionsTable.$inferSelect, p: typeof paymentsTable.$inferSelect) {
    const why = await this.transactions.cancelBlockedBy(q, t);
    if (why === "cancelled" || why === "gstFiled" || why === "rcmPaid") return why;
    if ((p.rcmApplicable || p.gstRate !== null) && (await this.transactions.filed(q, "gstr3b", t.dateTime))) return "gstFiled" as const;
    return null;
  }

  // what this payment did to each ledger, debit as plus, in paise (its edits and their reversals added in)
  private async netOf(q: Tx, transactionId: string) {
    const entries = await q.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.transactionId, transactionId));
    const net = new Map<string, number>();
    for (const e of entries) net.set(e.ledgerId, (net.get(e.ledgerId) ?? 0) + (e.transactionType === "debit" ? 1 : -1) * toPaise(e.amount));
    return net;
  }

  // a loan given by this payment: its due, and what's come back on it from other transactions still standing (paise)
  private async loanGiven(q: Tx, transactionId: string) {
    const [due] = await q.select().from(duesTable).where(eq(duesTable.transactionId, transactionId));
    if (!due) return null;
    const [back] = await q
      .select({ paise: sql<string>`coalesce(sum(${dueSettlementsTable.amount}), 0)` })
      .from(dueSettlementsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, dueSettlementsTable.transactionId))
      .where(and(eq(dueSettlementsTable.dueId, due.id), ne(dueSettlementsTable.transactionId, transactionId), eq(transactionsTable.status, "active")));
    return { due, returned: toPaise(back?.paise ?? "0") };
  }

  // the payment as the edit form opens it
  async forEdit(input: PaymentIdInputModel): Promise<PaymentForEditModel> {
    return db.transaction(async (tx) => {
      const { t, p, banks, kind } = await this.load(tx, input.transactionId, false);
      const net = await this.netOf(tx, t.id);
      const cashId = await this.accounts.ledgerId(tx, "cash");

      // who it went to: a loan repaid or its interest names the loan (as it was before this payment); the others the
      // ledger, as the picker shows it
      const loanKind = kind === "loanRepaid" || kind === "interestPaid";
      const [settled] = kind === "loanRepaid" ? await tx.select({ dueId: dueSettlementsTable.dueId }).from(dueSettlementsTable).where(eq(dueSettlementsTable.transactionId, t.id)) : [];
      const loanId = kind === "interestPaid" ? p.interestOnDueId : (settled?.dueId ?? null);
      const loan = loanKind && loanId ? await this.dues.loanWithout(tx, loanId, t.id) : null;
      const to = loanKind ? null : await this.accounts.pickedById(p.paidToLedgerId);
      const payee = p.payeePartyId ? await this.accounts.pickedById((await this.accounts.ledgerOf(tx, "parties", p.payeePartyId)).id) : null;
      const given = kind === "loanGiven" ? await this.loanGiven(tx, t.id) : null;

      // the bank parts as saved, with what each paid out (from the ledger: older payments kept the part on the row)
      const bankLedgers = banks.length
        ? await tx.select({ id: ledgersTable.id, referenceId: ledgersTable.referenceId }).from(ledgersTable).where(and(eq(ledgersTable.referenceTable, "bank_details"), inArray(ledgersTable.referenceId, banks.map((b) => b.bankDetailsId))))
        : [];
      const paidFrom = (bankDetailsId: string) => {
        const ledger = bankLedgers.find((l) => l.referenceId === bankDetailsId);
        return ledger ? -(net.get(ledger.id) ?? 0) / 100 : 0;
      };

      // its own month, never after today
      const month = indiaMonth(t.dateTime);
      const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const today = indiaDay(new Date());
      return {
        transactionId: t.id,
        assignedId: t.assignedId,
        dateTime: t.dateTime,
        paidFor: kind,
        to,
        loan,
        payee,
        payeeLandlordId: p.payeeLandlordId,
        loanTerms:
          given?.due.interestRate != null && given.due.frequency
            ? { interestRate: Number(given.due.interestRate), frequency: given.due.frequency, dueOn: given.due.dueOn }
            : null,
        gst:
          !p.rcmApplicable && p.gstRate !== null && p.supplierGstinSnapshot && p.supplierInvoiceNumber && p.supplierInvoiceDate
            ? { gstin: p.supplierGstinSnapshot, billNumber: p.supplierInvoiceNumber, billDate: p.supplierInvoiceDate, rate: p.gstRate }
            : null,
        amount: Number(p.amount),
        tdsAmount: p.tdsAmount === null ? 0 : Number(p.tdsAmount),
        cashAmount: -(net.get(cashId) ?? 0) / 100,
        banks: banks.map((b) => ({ bankDetailsId: b.bankDetailsId, amount: paidFrom(b.bankDetailsId) || Number(b.amount), mode: MODE_OF[b.mode] ?? null, referenceNumber: b.referenceNumber })),
        cashReferenceNumber: p.referenceNumber,
        remarks: t.remarks,
        toEffect: (net.get(p.paidToLedgerId) ?? 0) / 100,
        dayMin: `${month}-01`,
        dayMax: last < today ? last : today,
        editBlockedBy: await this.blockedBy(tx, t, p),
      };
    });
  }

  // saves an edit
  async edit(rawInput: EditPaymentInputModel, actor: ActorModel) {
    const input = editPaymentInputModel.parse(rawInput);
    const payment = input.payment;
    const transactionId = await db.transaction(async (tx) => {
      const { t, p, banks, kind } = await this.load(tx, input.transactionId, true);
      const blocked = await this.blockedBy(tx, t, p);
      if (blocked === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "This payment is cancelled." });
      if (blocked === "gstFiled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That month's GSTR-3B is filed, so this payment can't be edited." });
      if (blocked === "rcmPaid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Its reverse-charge GST is already paid. Cancel that Tax paid payment first." });
      if (payment.paidFor !== kind) throw new TRPCError({ code: "BAD_REQUEST", message: "What it was paid for stays as saved." });
      if (indiaMonth(payment.dateTime) !== indiaMonth(t.dateTime)) throw new TRPCError({ code: "BAD_REQUEST", message: "The date stays in the payment's own month." });

      // a loan given that's partly come back: it stays with the same party, and never below what came back
      const given = kind === "loanGiven" ? await this.loanGiven(tx, t.id) : null;
      if (given && given.returned > 0) {
        if (payment.paidToLedgerId !== p.paidToLedgerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Part of this loan has come back, so it stays with the same party." });
        if (toPaise(payment.amount) < given.returned) throw new TRPCError({ code: "BAD_REQUEST", message: `${rupeesOf(given.returned)} of this loan has come back, so the amount can't be less.` });
      }

      // what it was, for the edit log
      const oldNet = await this.netOf(tx, t.id);
      const before = {
        date: indiaDay(t.dateTime),
        paidTo: p.paidToNameSnapshot,
        total: Number(p.amount),
        tds: p.tdsAmount === null ? 0 : Number(p.tdsAmount),
        paidFrom: banks.map((b) => ({ bankDetailsId: b.bankDetailsId, amount: Number(b.amount), mode: MODE_OF[b.mode] ?? null, referenceNumber: b.referenceNumber })),
        cashReference: p.referenceNumber,
        remarks: t.remarks,
      };
      const cashId = await this.accounts.ledgerId(tx, "cash");

      // taken away: its ledger effect (on its own day), what it settled, its bank rows and its row
      await this.engine.reverse(tx, { transactionId: t.id, dateTime: t.dateTime });
      await tx.delete(dueSettlementsTable).where(eq(dueSettlementsTable.transactionId, t.id));
      await tx.delete(transactionBankDetailsTable).where(eq(transactionBankDetailsTable.transactionId, t.id));
      await tx.delete(paymentsTable).where(eq(paymentsTable.id, p.id));

      // written again by the payment form's own save, under its own number
      // (a loan given: its own due is written again in place, so what came back on it, and interest named on it, stay)
      await this.payments.saveIn(tx, payment, actor, { id: t.id, assignedId: t.assignedId, loanDueId: given?.due.id ?? null });

      // the edit log: what changed, from what to what
      const [now] = await tx.select().from(paymentsTable).where(eq(paymentsTable.transactionId, t.id));
      const nowBanks = await tx
        .select()
        .from(transactionBankDetailsTable)
        .where(eq(transactionBankDetailsTable.transactionId, t.id))
        .orderBy(asc(transactionBankDetailsTable.createdAt), asc(transactionBankDetailsTable.id));
      const newNet = await this.netOf(tx, t.id);
      const after = {
        date: indiaDay(payment.dateTime),
        paidTo: now!.paidToNameSnapshot,
        total: Number(now!.amount),
        tds: now!.tdsAmount === null ? 0 : Number(now!.tdsAmount),
        paidFrom: nowBanks.map((b) => ({ bankDetailsId: b.bankDetailsId, amount: Number(b.amount), mode: MODE_OF[b.mode] ?? null, referenceNumber: b.referenceNumber })),
        cashReference: now!.referenceNumber,
        remarks: payment.remarks,
      };
      // the cash part, from the ledger (old payments' and new): what changed in it shows with Paid from
      const cashOut = (net: Map<string, number>) => -(net.get(cashId) ?? 0) / 100;
      const changes = [
        { field: "date", old: before.date, new: after.date },
        { field: "paidTo", old: before.paidTo, new: after.paidTo },
        { field: "total", old: before.total, new: after.total },
        { field: "paidFrom", old: { cash: cashOut(oldNet), banks: before.paidFrom }, new: { cash: cashOut(newNet), banks: after.paidFrom } },
        { field: "cashReference", old: before.cashReference, new: after.cashReference },
        { field: "tds", old: before.tds, new: after.tds },
        { field: "remarks", old: before.remarks, new: after.remarks },
      ].filter((c) => JSON.stringify(c.old) !== JSON.stringify(c.new));
      // nothing changed: no edit is recorded
      if (changes.length > 0) await tx.insert(transactionEditLogsTable).values({ transactionId: t.id, editedById: actor.id, editedByName: actor.name.slice(0, 30), changes });
      return t.id;
    });
    return { transactionId };
  }
}
