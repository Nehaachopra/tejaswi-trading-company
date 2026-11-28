import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, sql } from "@repo/database";
import {
  employeesTable,
  partiesTable,
  salariesTable,
  salaryAdvanceDeductionsTable,
  transactionBankDetailsTable,
  transactionEditLogsTable,
  transactionsTable,
} from "@repo/database/schema";

import AccountsService from "../accounts";
import LedgerEngine from "../accounts/engine";
import type { ActorModel } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import { BANK_MODE_DB, type BankMode } from "../payment/model";
import type { Tx } from "../stock/engine";
import SalaryService from ".";
import { type EditSalaryInputModel, editSalaryInputModel, type SalaryForEditModel } from "./edit-model";
import type { SalaryIdInputModel } from "./model";

// how a bank part was paid, back from how the database keeps it
const MODE_OF = Object.fromEntries(Object.entries(BANK_MODE_DB).map(([k, v]) => [v, k])) as Record<string, BankMode>;

// a moment's day and month, in India
const indiaDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);
const indiaMonth = (at: Date) => indiaDay(at).slice(0, 7);

// an amount in rupees, Indian grouping, for an error message
const rupeesOf = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Editing a salary or an advance (the admin's), as a payment's edit: what it was paid for and who stay. Its old ledger
// effect is reversed (on its own day), its bank rows and the advance it set off taken away, and it's written again
// under its own number, on its own month's day. Its salaries row is kept (changed in place), so what later salaries took
// back from an advance stays with it. Each edit is kept in the edit log
export default class SalaryEditService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly salaries = new SalaryService(accounts),
    private readonly engine = new LedgerEngine(),
  ) {}

  // the salary's transaction, its row and the employee; locked inside a save
  private async load(q: Tx, transactionId: string, lock: boolean) {
    const base = q
      .select({ t: transactionsTable, s: salariesTable, e: employeesTable, party: partiesTable })
      .from(transactionsTable)
      .innerJoin(salariesTable, eq(salariesTable.transactionId, transactionsTable.id))
      .innerJoin(employeesTable, eq(employeesTable.id, salariesTable.employeeId))
      .innerJoin(partiesTable, eq(partiesTable.id, employeesTable.partyId))
      .where(eq(transactionsTable.id, transactionId));
    const [row] = lock ? await base.for("update", { of: transactionsTable }) : await base;
    if (!row || row.t.type !== "salary" || (row.s.kind !== "salary" && row.s.kind !== "advance")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Salary payment not found." });
    }
    const banks = await q
      .select()
      .from(transactionBankDetailsTable)
      .where(eq(transactionBankDetailsTable.transactionId, transactionId))
      .orderBy(asc(transactionBankDetailsTable.createdAt), asc(transactionBankDetailsTable.id));
    return { ...row, kind: row.s.kind as "salary" | "advance", banks };
  }

  // what this payment set off from advances, and (an advance) what later salaries took back from it, in paise
  private async ownSetOff(q: Pick<Tx, "select">, salaryId: string) {
    const [own] = await q
      .select({ total: sql<string>`coalesce(sum(${salaryAdvanceDeductionsTable.amount}), 0)` })
      .from(salaryAdvanceDeductionsTable)
      .where(eq(salaryAdvanceDeductionsTable.paymentSalaryId, salaryId));
    const [back] = await q
      .select({ total: sql<string>`coalesce(sum(${salaryAdvanceDeductionsTable.amount}), 0)` })
      .from(salaryAdvanceDeductionsTable)
      .leftJoin(salariesTable, eq(salariesTable.id, salaryAdvanceDeductionsTable.paymentSalaryId))
      .leftJoin(transactionsTable, eq(transactionsTable.id, salariesTable.transactionId))
      .where(and(eq(salaryAdvanceDeductionsTable.salaryId, salaryId), sql`(${salaryAdvanceDeductionsTable.paymentSalaryId} is null or ${transactionsTable.status} = 'active')`));
    return { setOff: toPaise(own?.total ?? 0), takenBack: toPaise(back?.total ?? 0) };
  }

  // what the employee owed and owed back before this payment (its own money and set-off left out), in paise
  private async before(q: Pick<Tx, "select">, employeeId: string, s: typeof salariesTable.$inferSelect, setOff: number) {
    const owedNow = (await this.salaries.monthsOf(q, employeeId)).reduce((sum, m) => sum + toPaise(m.left), 0);
    const advanceNow = (await this.salaries.advancesLeft(q, employeeId)).reduce((sum, a) => sum + a.leftPaise, 0);
    return {
      // a salary's own money and set-off went towards the months: back in, they're owed again
      owed: owedNow + (s.kind === "salary" ? toPaise(s.amount) + setOff : 0),
      // its set-off came out of advances: back in, they're owed back again (an advance itself is left out: it's the one
      // being changed)
      advanceLeft: advanceNow + setOff,
    };
  }

  // why it can't be edited, if it can't
  private blockedBy(t: typeof transactionsTable.$inferSelect) {
    return t.status === "cancelled" ? ("cancelled" as const) : null;
  }

  // the salary as the edit form opens it
  async forEdit(input: SalaryIdInputModel): Promise<SalaryForEditModel> {
    return db.transaction(async (tx) => {
      const { t, s, e, party, kind, banks } = await this.load(tx, input.transactionId, false);
      const { setOff, takenBack } = await this.ownSetOff(tx, s.id);
      const was = await this.before(tx, e.id, s, setOff);
      const bankPaise = banks.reduce((sum, b) => sum + toPaise(b.amount), 0);

      // the months as they were before it: what's been paid on them, less this salary's own money and set-off, settles
      // them oldest first again
      const own = kind === "salary" ? toPaise(s.amount) + setOff : 0;
      const months = await this.salaries.monthsOf(tx, e.id);
      let pool = months.reduce((sum, m) => sum + toPaise(m.paid), 0) - own;
      const owed = months
        .map((m) => {
          const net = toPaise(m.net);
          const paid = Math.min(Math.max(pool, 0), net);
          pool -= paid;
          return { ...m, paid: paid / 100, left: (net - paid) / 100 };
        })
        .filter((m) => m.left > 0);
      // how many of those its own share reached
      let share = own;
      let covered = 0;
      for (const m of owed) {
        if (share <= 0) break;
        covered += 1;
        share -= toPaise(m.left);
      }
      const ledgerId = (await this.accounts.ledgerOf(tx, "parties", e.partyId)).id;
      const ledger = await this.accounts.pickedById(ledgerId);
      if (!ledger) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found." });
      // its own month, never after today
      const month = indiaMonth(t.dateTime);
      const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const today = indiaDay(new Date());
      return {
        transactionId: t.id,
        assignedId: t.assignedId,
        dateTime: t.dateTime,
        kind,
        employee: { employeeId: e.id, name: party.name, shortName: party.shortName },
        row: {
          employeeId: e.id,
          partyId: e.partyId,
          name: party.name,
          shortName: party.shortName,
          monthlySalary: Number(e.monthlySalary),
          payDay: e.payDay,
          // an advance being edited isn't owed back to itself
          advanceLeft: (kind === "advance" ? was.advanceLeft - Math.max(0, toPaise(s.amount) - takenBack) : was.advanceLeft) / 100,
          owed,
        },
        ledger,
        months: covered,
        takesAdvance: setOff > 0,
        amount: Number(s.amount),
        advance: setOff / 100,
        owedBefore: was.owed / 100,
        advanceLeftBefore: was.advanceLeft / 100,
        takenBack: takenBack / 100,
        cashAmount: Math.max(0, toPaise(s.amount) - bankPaise) / 100,
        banks: banks.map((b) => ({ bankDetailsId: b.bankDetailsId, amount: Number(b.amount), mode: MODE_OF[b.mode] ?? null, referenceNumber: b.referenceNumber })),
        referenceNumber: s.referenceNumber,
        remarks: s.remarks,
        dayMin: `${month}-01`,
        dayMax: last < today ? last : today,
        editBlockedBy: this.blockedBy(t),
      };
    });
  }

  // saves an edit
  async edit(rawInput: EditSalaryInputModel, actor: ActorModel) {
    const input = editSalaryInputModel.parse(rawInput);
    const transactionId = await db.transaction(async (tx) => {
      const { t, s, e, kind, banks } = await this.load(tx, input.transactionId, true);
      if (this.blockedBy(t) === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "This payment is cancelled." });
      if (indiaMonth(input.dateTime) !== indiaMonth(t.dateTime)) throw new TRPCError({ code: "BAD_REQUEST", message: "The date stays in the payment's own month." });
      if (indiaDay(input.dateTime) > indiaDay(new Date())) throw new TRPCError({ code: "BAD_REQUEST", message: "The date can't be after today." });
      // (the employee locked, so two saves can't settle the same months)
      await tx.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.id, e.id)).for("update");

      const amountPaise = toPaise(input.amount);
      const advancePaise = kind === "salary" ? toPaise(input.advance) : 0;
      const { setOff, takenBack } = await this.ownSetOff(tx, s.id);
      const was = await this.before(tx, e.id, s, setOff);
      if (kind === "salary") {
        if (amountPaise + advancePaise > was.owed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Only ${rupeesOf(was.owed)} is owed.` });
        if (advancePaise > was.advanceLeft) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Only ${rupeesOf(was.advanceLeft)} of advance is owed back.` });
      }
      // an advance partly taken back since: never below that
      if (kind === "advance" && amountPaise < takenBack) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${rupeesOf(takenBack)} of this advance has been set off since, so it can't be less.` });
      }

      // what it was, for the edit log
      const before = {
        date: indiaDay(t.dateTime),
        total: Number(s.amount),
        advance: setOff / 100,
        paidFrom: { cash: Math.max(0, toPaise(s.amount) - banks.reduce((sum, b) => sum + toPaise(b.amount), 0)) / 100, banks: banks.map((b) => ({ bankDetailsId: b.bankDetailsId, amount: Number(b.amount), mode: MODE_OF[b.mode] ?? null, referenceNumber: b.referenceNumber })) },
        cashReference: s.referenceNumber,
        remarks: s.remarks,
      };

      // taken away: its ledger effect (on its own day), the advance it set off and its bank rows
      await this.engine.reverse(tx, { transactionId: t.id, dateTime: t.dateTime });
      await tx.delete(salaryAdvanceDeductionsTable).where(eq(salaryAdvanceDeductionsTable.paymentSalaryId, s.id));
      await tx.delete(transactionBankDetailsTable).where(eq(transactionBankDetailsTable.transactionId, t.id));

      // each place, never more than it holds today with what this payment took from it back in
      const oldCash = toPaise(before.paidFrom.cash);
      const parts = [];
      for (const src of input.sources) {
        const own = src.bankDetailsId ? banks.filter((b) => b.bankDetailsId === src.bankDetailsId).reduce((sum, b) => sum + toPaise(b.amount), 0) : oldCash;
        const place = await this.salaries.placeFor(tx, src.bankDetailsId, toPaise(src.amount), own);
        parts.push({ ...place, paise: toPaise(src.amount), mode: src.mode, referenceNumber: src.referenceNumber });
      }
      const cash = parts.some((p) => !p.bank);
      const bank = parts.some((p) => p.bank);

      // written again: the employee down by what was paid, each place by its part, under its own number
      const employeeLedger = (await this.accounts.ledgerOf(tx, "parties", e.partyId)).id;
      await this.engine.post(tx, {
        transactionId: t.id,
        dateTime: input.dateTime,
        lines: [
          { ledgerId: employeeLedger, side: "debit", amount: input.amount },
          ...parts.map((p) => ({ ledgerId: p.ledgerId, side: "credit" as const, amount: p.paise / 100 })),
        ],
      });
      await tx.update(transactionsTable).set({ dateTime: input.dateTime, amount: fromPaise(amountPaise), remarks: input.remarks }).where(eq(transactionsTable.id, t.id));
      await tx
        .update(salariesTable)
        .set({ settledIn: cash && bank ? "cash_and_bank" : bank ? "bank" : "cash", referenceNumber: cash ? input.referenceNumber : null, amount: fromPaise(amountPaise), remarks: input.remarks })
        .where(eq(salariesTable.id, s.id));
      // each bank account's part, a millisecond apart so they read back in order
      const savedAt = Date.now();
      for (const [i, p] of parts.filter((x) => x.bank).entries()) {
        await tx.insert(transactionBankDetailsTable).values({
          createdAt: new Date(savedAt + i),
          transactionId: t.id,
          bankDetailsId: p.bank!.id,
          amount: fromPaise(p.paise),
          mode: BANK_MODE_DB[p.mode!],
          referenceNumber: p.referenceNumber,
          bankNameSnapshot: p.bank!.bankName.slice(0, 100),
          bankAccountLast4Snapshot: p.bank!.accountNumber.slice(-4),
          bankIfscSnapshot: p.bank!.ifscCode?.slice(0, 11) ?? null,
        });
      }
      // a salary: the advance set off again, oldest advance first
      if (advancePaise > 0) {
        let rest = advancePaise;
        for (const a of await this.salaries.advancesLeft(tx, e.id)) {
          const take = Math.min(a.leftPaise, rest);
          if (take <= 0) break;
          await tx.insert(salaryAdvanceDeductionsTable).values({ salaryId: a.salaryId, paymentSalaryId: s.id, amount: fromPaise(take) });
          rest -= take;
        }
      }

      // the edit log: what changed, from what to what
      const after = {
        date: indiaDay(input.dateTime),
        total: amountPaise / 100,
        advance: advancePaise / 100,
        paidFrom: {
          cash: parts.filter((p) => !p.bank).reduce((sum, p) => sum + p.paise, 0) / 100,
          banks: parts.filter((p) => p.bank).map((p) => ({ bankDetailsId: p.bank!.id, amount: p.paise / 100, mode: p.mode, referenceNumber: p.referenceNumber })),
        },
        cashReference: cash ? input.referenceNumber : null,
        remarks: input.remarks,
      };
      const changes = [
        { field: "date", old: before.date, new: after.date },
        { field: "total", old: before.total, new: after.total },
        { field: "advance", old: before.advance, new: after.advance },
        { field: "paidFrom", old: before.paidFrom, new: after.paidFrom },
        { field: "cashReference", old: before.cashReference, new: after.cashReference },
        { field: "remarks", old: before.remarks, new: after.remarks },
      ].filter((c) => JSON.stringify(c.old) !== JSON.stringify(c.new));
      // nothing changed: no edit is recorded
      if (changes.length > 0) await tx.insert(transactionEditLogsTable).values({ transactionId: t.id, editedById: actor.id, editedByName: actor.name.slice(0, 30), changes });
      return t.id;
    });
    return { transactionId };
  }
}
