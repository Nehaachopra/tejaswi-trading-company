import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray, sql } from "@repo/database";
import {
  bankDetailsTable,
  employeesTable,
  partiesTable,
  salariesTable,
  salaryAdvanceDeductionsTable,
  salaryPostingsTable,
  transactionBankDetailsTable,
  transactionsTable,
  usersTable,
} from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel } from "../accounts/model";
import { BANK_MODE_DB, type BankMode } from "../payment/model";
import { fromPaise, toPaise } from "../accounts/money";
import type { Tx } from "../stock/engine";
import TransactionService from "../transaction";
import { settleLedger } from "../transaction/settle";
import {
  type PaySalariesInputModel,
  paySalariesInputModel,
  type PaySalaryInputModel,
  paySalaryInputModel,
  type SalaryEmployeeModel,
  type SalaryIdInputModel,
  type SalaryPaymentModel,
} from "./model";

// what a ledger holds today, debit as plus (cash and bank accounts hold a debit balance)
const held = (b: { amount: number; side: "debit" | "credit" } | undefined) => (b ? (b.side === "debit" ? 1 : -1) * b.amount : 0);

// a day in India as "2026-11-09", and the days in a month
const indiaDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// salary: each employee's month booked as owed on their pay day (posted by the app), and what's paid them, from cash
// or one bank account: salary (any part of what's owed, settling the months oldest first), or an advance. An advance is taken back only when the user
// chooses, in a salary payment (oldest first; what's left carries on). The month they joined is for
// the days from their joining date. Money goes: posting Salary up, the employee owed it; paying the employee down,
// cash or the bank down; an advance the same, owed back by them, which their next posting nets off
// a place money is paid from: its ledger, and the bank account (none for cash)
type Place = { ledgerId: string; bank: typeof bankDetailsTable.$inferSelect | null };
// a bank payment: how it was paid and its UTR or cheque no.
type PaidBy = { mode: BankMode; referenceNumber: string | null };
// one payment's share of a place
type Part = Place & { paidBy: PaidBy | null; paise: number };

export default class SalaryService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
  ) {}

  // every month due by now and not yet posted, for every active employee (from the month they joined, or were added to
// the app if later); run by the
  // jobs every hour, so a pay day the server was down for is caught up. Gives how many were posted
  async postDue(now = new Date()): Promise<number> {
    const today = indiaDay(now);
    const employees = await db
      .select({ e: employeesTable })
      .from(employeesTable)
      .innerJoin(partiesTable, eq(partiesTable.id, employeesTable.partyId))
      .where(and(eq(partiesTable.isActive, true), sql`'employee' = ANY(${partiesTable.types})`));
    if (employees.length === 0) return 0;
    // postings are made by the app, in the admin's name
    const [admin] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin")).orderBy(asc(usersTable.createdAt)).limit(1);
    if (!admin) return 0;
    const actor = { id: admin.id, name: "Pay day (auto)" };
    let posted = 0;
    for (const { e } of employees) {
      const [jy, jm, jd] = e.joiningDate.split("-").map(Number) as [number, number, number];
      const [ty, tm] = today.split("-").map(Number) as [number, number];
      // from the month they joined, or the month they were added to the app if later (salary before that was paid
      // outside it; anything still owed then is an opening balance)
      const [ay, am] = indiaDay(e.createdAt).split("-").map(Number) as [number, number];
      const [sy, sm] = jy > ay || (jy === ay && jm >= am) ? [jy, jm] : [ay, am];
      for (let y = sy, m = sm; y < ty || (y === ty && m <= tm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
        const dim = daysIn(y, m);
        // its pay day (the month's last day when the pay day isn't in it), never before they joined
        const payDate = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(e.payDay, dim)).padStart(2, "0")}`;
        const postDate = payDate < e.joiningDate ? e.joiningDate : payDate;
        if (postDate > today) break;
        if (await this.postMonth(e.id, y, m, postDate, y === jy && m === jm ? jd : 1, actor)) posted += 1;
      }
    }
    return posted;
  }

  // one employee's month, unless it's posted already: the salary (from the day they started that month), less every
  // advance still owed, up to it
  private async postMonth(employeeId: string, year: number, month: number, postDate: string, fromDay: number, actor: ActorModel) {
    return db.transaction(async (tx) => {
      // one at a time per employee, so two runs can't post a month twice
      const [e] = await tx.select().from(employeesTable).where(eq(employeesTable.id, employeeId)).for("update");
      if (!e) return false;
      const [done] = await tx
        .select({ id: salaryPostingsTable.id })
        .from(salaryPostingsTable)
        .where(and(eq(salaryPostingsTable.employeeId, employeeId), eq(salaryPostingsTable.year, year), eq(salaryPostingsTable.month, month)));
      if (done) return false;

      const dim = daysIn(year, month);
      const grossPaise = Math.round((toPaise(e.monthlySalary) * (dim - fromDay + 1)) / dim);
      if (grossPaise <= 0) return false;

      const gross = grossPaise / 100;
      const employeeLedger = (await this.accounts.ledgerOf(tx, "parties", e.partyId)).id;
      const t = await this.transactions.create(
        tx,
        {
          type: "salary",
          subType: "posting",
          dateTime: new Date(`${postDate}T12:00:00+05:30`),
          amount: gross,
          remarks: `Salary for ${MONTHS[month - 1]} ${year}`,
          lines: [
            { ledgerId: await this.accounts.ledgerId(tx, "salary"), side: "debit", amount: gross },
            { ledgerId: employeeLedger, side: "credit", amount: gross },
          ],
        },
        actor,
      );
      await tx.insert(salaryPostingsTable).values({
        transactionId: t.id,
        employeeId,
        year,
        month,
        grossAmount: fromPaise(grossPaise),
        // advances are taken back only when the user chooses, in a payment
        advanceDeducted: "0",
        netAmount: fromPaise(grossPaise),
      });
      return true;
    });
  }

  // an employee's advances still owed, oldest first: each one less what's been taken off it
  private async advancesLeft(q: Pick<Tx, "select">, employeeId: string) {
    const rows = await q
      .select({
        salaryId: salariesTable.id,
        amount: salariesTable.amount,
        taken: sql<string>`coalesce((select sum(d.amount) from salary_advance_deductions d
          left join salaries ps on ps.id = d.payment_salary_id
          left join transactions pt on pt.id = ps.transaction_id
          where d.salary_id = ${salariesTable.id} and (d.payment_salary_id is null or pt.status = 'active')), 0)`,
      })
      .from(salariesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, salariesTable.transactionId))
      .where(and(eq(salariesTable.employeeId, employeeId), eq(salariesTable.kind, "advance"), eq(transactionsTable.status, "active")))
      .orderBy(asc(transactionsTable.dateTime));
    return rows.map((r) => ({ salaryId: r.salaryId, leftPaise: toPaise(r.amount) - toPaise(r.taken) })).filter((r) => r.leftPaise > 0);
  }

  // an employee's posted months (active ones, oldest first), each with what's been paid on it: their salary payments
  // settle the months oldest first
  private async monthsOf(q: Pick<Tx, "select">, employeeId: string) {
    const postings = await q
      .select({ p: salaryPostingsTable })
      .from(salaryPostingsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, salaryPostingsTable.transactionId))
      .where(and(eq(salaryPostingsTable.employeeId, employeeId), eq(transactionsTable.status, "active")))
      .orderBy(asc(salaryPostingsTable.year), asc(salaryPostingsTable.month));
    const [paid] = await q
      .select({ total: sql<string>`coalesce(sum(${salariesTable.amount}), 0)` })
      .from(salariesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, salariesTable.transactionId))
      .where(and(eq(salariesTable.employeeId, employeeId), eq(salariesTable.kind, "salary"), eq(transactionsTable.status, "active")));
    const [taken] = await q
      .select({ total: sql<string>`coalesce(sum(${salaryAdvanceDeductionsTable.amount}), 0)` })
      .from(salaryAdvanceDeductionsTable)
      .innerJoin(salariesTable, eq(salariesTable.id, salaryAdvanceDeductionsTable.paymentSalaryId))
      .innerJoin(transactionsTable, eq(transactionsTable.id, salariesTable.transactionId))
      .where(and(eq(salariesTable.employeeId, employeeId), eq(transactionsTable.status, "active")));
    let pool = toPaise(paid?.total ?? 0) + toPaise(taken?.total ?? 0);
    return postings.map(({ p }) => {
      const netPaise = toPaise(p.netAmount);
      const paidPaise = Math.min(pool, netPaise);
      pool -= paidPaise;
      return {
        postingId: p.id,
        year: p.year,
        month: p.month,
        gross: Number(p.grossAmount),
        advanceDeducted: Number(p.advanceDeducted),
        net: netPaise / 100,
        paid: paidPaise / 100,
        left: (netPaise - paidPaise) / 100,
      };
    });
  }

  // an employee's pay (or joining date) changed: each posted month still owed is worked out again at the new pay (from
  // the day they joined, for their joining month), never below what's been paid on it with the advance taken off it.
  // The difference is booked as a revision dated now: Salary up and the employee owed more, or the other way round
  async repriceIn(tx: Tx, employeeId: string, actor: ActorModel) {
    const [e] = await tx.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    if (!e) return;
    const [jy, jm, jd] = String(e.joiningDate).split("-").map(Number);
    const employeeLedger = (await this.accounts.ledgerOf(tx, "parties", e.partyId)).id;
    const salaryLedger = await this.accounts.ledgerId(tx, "salary");
    for (const m of await this.monthsOf(tx, employeeId)) {
      if (m.left <= 0) continue;
      const dim = daysIn(m.year, m.month);
      const fromDay = jy === m.year && jm === m.month ? jd! : 1;
      const advance = toPaise(m.advanceDeducted);
      const gross = Math.max(Math.round((toPaise(e.monthlySalary) * (dim - fromDay + 1)) / dim), toPaise(m.paid) + advance);
      const diff = gross - toPaise(m.gross);
      if (diff === 0) continue;
      const amount = Math.abs(diff) / 100;
      await this.transactions.create(
        tx,
        {
          type: "salary",
          subType: "revision",
          dateTime: new Date(),
          amount,
          remarks: `Salary for ${MONTHS[m.month - 1]} ${m.year} revised`,
          lines:
            diff > 0
              ? [
                  { ledgerId: salaryLedger, side: "debit", amount },
                  { ledgerId: employeeLedger, side: "credit", amount },
                ]
              : [
                  { ledgerId: employeeLedger, side: "debit", amount },
                  { ledgerId: salaryLedger, side: "credit", amount },
                ],
        },
        actor,
      );
      await tx
        .update(salaryPostingsTable)
        .set({ grossAmount: fromPaise(gross), netAmount: fromPaise(gross - advance) })
        .where(eq(salaryPostingsTable.id, m.postingId));
    }
  }

  // the pay form: every active employee with their pay, the advance they still owe, and the months still owed
  async employees(): Promise<SalaryEmployeeModel[]> {
    const rows = await db
      .select({ e: employeesTable, name: partiesTable.name, shortName: partiesTable.shortName })
      .from(employeesTable)
      .innerJoin(partiesTable, eq(partiesTable.id, employeesTable.partyId))
      .where(and(eq(partiesTable.isActive, true), sql`'employee' = ANY(${partiesTable.types})`))
      .orderBy(asc(sql`coalesce(${partiesTable.shortName}, upper(${partiesTable.name}))`));
    return Promise.all(
      rows.map(async ({ e, name, shortName }) => ({
        employeeId: e.id,
        partyId: e.partyId,
        name,
        shortName,
        monthlySalary: Number(e.monthlySalary),
        payDay: e.payDay,
        advanceLeft: (await this.advancesLeft(db, e.id)).reduce((sum, a) => sum + a.leftPaise, 0) / 100,
        owed: (await this.monthsOf(db, e.id)).filter((m) => m.left > 0),
      })),
    );
  }

  // paying an employee: salary (never more than is owed, settling the oldest months first) or an advance, from cash or
  // one active bank account, never more than it holds
  async pay(rawInput: PaySalaryInputModel, actor: ActorModel): Promise<SalaryPaymentModel> {
    const input = paySalaryInputModel.parse(rawInput);
    const id = await db.transaction(async (tx) => {
      const from = await this.placeFor(tx, input.bankDetailsId, toPaise(input.amount));
      const paidBy = input.bankMode ? { mode: input.bankMode, referenceNumber: input.referenceNumber } : null;
      return this.payIn(tx, [{ ...from, paidBy, paise: toPaise(input.amount) }], input, actor);
    });
    return this.get({ transactionId: id });
  }

  // salary to many employees in one save, from one place: a transaction each, all saved or none; the place must hold
  // the whole of it
  async payAll(rawInput: PaySalariesInputModel, actor: ActorModel): Promise<SalaryPaymentModel[]> {
    const input = paySalariesInputModel.parse(rawInput);
    const ids = await db.transaction(async (tx) => {
      // each place, never more than it holds; then shared over the employees in order, each taking from the first place
      // with anything left (one at the boundary is paid from both)
      const left: (Place & { leftPaise: number; paidBy: PaidBy | null })[] = [];
      for (const src of input.sources) {
        const place = await this.placeFor(tx, src.bankDetailsId, toPaise(src.amount));
        left.push({ ...place, leftPaise: toPaise(src.amount), paidBy: src.mode ? { mode: src.mode, referenceNumber: src.referenceNumber } : null });
      }
      const out: string[] = [];
      for (const l of input.lines) {
        let need = toPaise(l.amount);
        const parts: Part[] = [];
        for (const p of left) {
          const take = Math.min(p.leftPaise, need);
          if (take <= 0) continue;
          parts.push({ ledgerId: p.ledgerId, bank: p.bank, paidBy: p.paidBy, paise: take });
          p.leftPaise -= take;
          need -= take;
          if (need === 0) break;
        }
        out.push(await this.payIn(tx, parts, { ...input, employeeId: l.employeeId, amount: l.amount, kind: "salary" }, actor, l.advance));
      }
      return out;
    });
    return Promise.all(ids.map((transactionId) => this.get({ transactionId })));
  }

  // where it's paid from (cash, or a bank account), never more than it holds today: its ledger, and the account as it
  // is now (for the snapshot)
  private async placeFor(tx: Tx, bankDetailsId: string | null, paise: number) {
    const ledgerId = await settleLedger(tx, this.accounts, bankDetailsId ? "bank" : "cash", bankDetailsId);
    const has = toPaise(held((await this.accounts.balances([ledgerId])).get(ledgerId)?.today));
    if (paise > has) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Only ₹${(has / 100).toLocaleString("en-IN")} is ${bankDetailsId ? "in that account" : "in cash"}.` });
    }
    const [bank] = bankDetailsId ? await tx.select().from(bankDetailsTable).where(eq(bankDetailsTable.id, bankDetailsId)) : [];
    return { ledgerId, bank: bank ?? null };
  }

  // one payment to one employee, from the parts given (cash, a bank account, or both): its transaction (a credit line
  // per part), its salaries row and a bank row per account; gives the transaction's id
  private async payIn(
    tx: Tx,
    parts: Part[],
    input: Pick<PaySalaryInputModel, "employeeId" | "kind" | "amount" | "dateTime" | "referenceNumber" | "remarks">,
    actor: ActorModel,
    // a salary: the advance taken back in it (never more than they still owe, and with the cash never more than is owed)
    advance = 0,
  ) {
    const [row] = await tx
      .select({ e: employeesTable, isActive: partiesTable.isActive })
      .from(employeesTable)
      .innerJoin(partiesTable, eq(partiesTable.id, employeesTable.partyId))
      .where(eq(employeesTable.id, input.employeeId))
      .for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found." });
    if (!row.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That employee is inactive." });

    // salary: the money and the advance taken back never more than is owed for the months posted
    const advancePaise = input.kind === "salary" ? toPaise(advance) : 0;
    const advances = advancePaise > 0 ? await this.advancesLeft(tx, row.e.id) : [];
    if (input.kind === "salary") {
      const owed = (await this.monthsOf(tx, row.e.id)).reduce((sum, m) => sum + toPaise(m.left), 0);
      if (toPaise(input.amount) + advancePaise > owed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Only ₹${(owed / 100).toLocaleString("en-IN")} is owed.` });
      const owesBack = advances.reduce((sum, a) => sum + a.leftPaise, 0);
      if (advancePaise > owesBack) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Only ₹${(owesBack / 100).toLocaleString("en-IN")} of advance is owed back.` });
    }

    const cash = parts.some((p) => !p.bank);
    const bank = parts.some((p) => p.bank);
    const employeeLedger = (await this.accounts.ledgerOf(tx, "parties", row.e.partyId)).id;
    const t = await this.transactions.create(
      tx,
      {
        type: "salary",
        subType: input.kind,
        dateTime: input.dateTime,
        amount: input.amount,
        remarks: input.remarks,
        lines: [
          { ledgerId: employeeLedger, side: "debit", amount: input.amount },
          ...parts.map((p) => ({ ledgerId: p.ledgerId, side: "credit" as const, amount: p.paise / 100 })),
        ],
      },
      actor,
    );
    const [saved] = await tx
      .insert(salariesTable)
      .values({
        transactionId: t.id,
        employeeId: row.e.id,
        kind: input.kind,
        salaryPostingId: null,
        settledIn: cash && bank ? "cash_and_bank" : bank ? "bank" : "cash",
        referenceNumber: cash ? input.referenceNumber : null,
        amount: fromPaise(toPaise(input.amount)),
        remarks: input.remarks,
      })
      .returning({ id: salariesTable.id });
    // each bank account's part: the account, how it was paid, its UTR or cheque no., and the account as it is now; a
    // millisecond apart, so they read back in the order saved
    const savedAt = Date.now();
    for (const [i, p] of parts.filter((x) => x.bank && x.paidBy).entries()) {
      await tx.insert(transactionBankDetailsTable).values({
        createdAt: new Date(savedAt + i),
        transactionId: t.id,
        bankDetailsId: p.bank!.id,
        amount: fromPaise(p.paise),
        mode: BANK_MODE_DB[p.paidBy!.mode],
        referenceNumber: p.paidBy!.referenceNumber,
        bankNameSnapshot: p.bank!.bankName.slice(0, 100),
        bankAccountLast4Snapshot: p.bank!.accountNumber.slice(-4),
        bankIfscSnapshot: p.bank!.ifscCode?.slice(0, 11) ?? null,
      });
    }
    // the advance taken back: from the oldest advance first
    let rest = advancePaise;
    for (const a of advances) {
      const take = Math.min(a.leftPaise, rest);
      if (take <= 0) break;
      await tx.insert(salaryAdvanceDeductionsTable).values({ salaryId: a.salaryId, paymentSalaryId: saved!.id, amount: fromPaise(take) });
      rest -= take;
    }
    return t.id;
  }

  // one payment's own details
  async get(input: SalaryIdInputModel): Promise<SalaryPaymentModel> {
    const [row] = await db
      .select({ s: salariesTable, t: transactionsTable, name: partiesTable.name })
      .from(salariesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, salariesTable.transactionId))
      .innerJoin(employeesTable, eq(employeesTable.id, salariesTable.employeeId))
      .innerJoin(partiesTable, eq(partiesTable.id, employeesTable.partyId))
      .where(eq(salariesTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
    const { s, t, name } = row;
    const [bank] = await db
      .select()
      .from(transactionBankDetailsTable)
      .where(eq(transactionBankDetailsTable.transactionId, t.id))
      .orderBy(asc(transactionBankDetailsTable.createdAt));
    return {
      transactionId: t.id,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      status: t.status,
      kind: s.kind,
      employee: { id: s.employeeId, name },
      amount: Number(s.amount),
      settledIn: s.settledIn === "cash_and_bank" ? "cashAndBank" : s.settledIn === "bank" ? "bank" : "cash",
      bankDetailsId: bank?.bankDetailsId ?? null,
      referenceNumber: s.referenceNumber ?? bank?.referenceNumber ?? null,
      remarks: s.remarks,
    };
  }
}
