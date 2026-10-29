import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray, type SQL, sql } from "@repo/database";
import { duesTable, dueSettlementsTable, partiesTable, partyAddressesTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import PartyService from "../party";
import type { Tx } from "../stock/engine";
import TransactionService from "../transaction";
import { counterLedger } from "../transaction/settle";
import {
  type AddOldDueInputModel,
  addOldDueInputModel,
  DUE_KIND_DB,
  type DueKind,
  type DueModel,
  type DuePartyModel,
  type DuesBoardModel,
  isLoan,
  type ListDuesInputModel,
  type LoanTermsInputModel,
  type OpenLoansInputModel,
  type PartyDuesInputModel,
  type PartyDuesModel,
  partyDuesInputModel,
  type WriteOffInputModel,
  writeOffInputModel,
} from "./model";

// the kind back from how the database keeps it
const KIND_OF = Object.fromEntries(Object.entries(DUE_KIND_DB).map(([k, v]) => [v, k])) as Record<string, DueKind>;

// today in India, "2026-10-28"
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

// days from each due's date to the payment or receipt that settled it, weighted by what it settled (write-offs left
// out: they aren't a payment), over one kind and, when given, one party
async function averageDays(kind: string, partyId: string | null) {
  const r = await db.execute<{ days: string | null }>(sql`
    select sum(s.amount * extract(epoch from (st.date_time - dt.date_time)) / 86400) / nullif(sum(s.amount), 0) as days
    from due_settlements s
    join dues d on d.id = s.due_id
    join transactions st on st.id = s.transaction_id and st.status = 'active' and st.sub_type is distinct from 'bad_debt'
    join transactions dt on dt.id = d.transaction_id and dt.status = 'active'
    where d.kind = ${kind} ${partyId ? sql`and d.party_id = ${partyId}` : sql``}`);
  const days = r.rows[0]?.days;
  return days == null ? null : Math.max(0, Math.round(Number(days)));
}

// what's been settled of a due, by payments and receipts that still stand (a cancelled one stops counting)
const settledPaise = sql<string>`(select coalesce(sum(s.amount), 0) from due_settlements s join transactions st on st.id = s.transaction_id where s.due_id = ${duesTable.id} and st.status = 'active')`;

type Party = { id: string; name: string; phone: string | null };

// what's owed both ways: debtors, creditors, loans given and taken. A due is made by the transaction that creates it
// (inside that save) or added as an old one from before the app. Debtors and creditors are one running amount per
// party, settled oldest first; a loan is settled by naming it. What's left is the amount less its settlements
export default class DueService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
  ) {}

  // inside a save: a new due on a party, made by that transaction
  async createIn(tx: Tx, input: { kind: DueKind; party: Party; transactionId: string; amount: number; dueOn: string | null; terms: Omit<LoanTermsInputModel, "dueOn"> | null }) {
    const [due] = await tx
      .insert(duesTable)
      .values({
        kind: DUE_KIND_DB[input.kind],
        partyId: input.party.id,
        partyName: input.party.name.slice(0, 150),
        partyPhone: input.party.phone,
        transactionId: input.transactionId,
        amount: fromPaise(toPaise(input.amount)),
        dueOn: input.dueOn,
        interestRate: input.terms ? input.terms.interestRate.toFixed(2) : null,
        frequency: input.terms?.frequency ?? null,
      })
      .returning({ id: duesTable.id });
    return due!.id;
  }

  // the dues still open, oldest first, with what's left of each; locked when inside a save, so two payments can't
  // settle the same rupee
  private async open(q: Tx | typeof db, where: SQL | undefined, lock = false) {
    const query = q
      .select({ d: duesTable, t: { assignedId: transactionsTable.assignedId, dateTime: transactionsTable.dateTime, subType: transactionsTable.subType }, settled: settledPaise })
      .from(duesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, duesTable.transactionId))
      .where(and(eq(transactionsTable.status, "active"), where))
      .orderBy(asc(transactionsTable.dateTime), asc(duesTable.createdAt));
    const rows = lock ? await query.for("update", { of: duesTable }) : await query;
    const today = todayInIndia();
    return rows
      .map(({ d, t, settled }): DueModel => {
        const left = Number(fromPaise(toPaise(d.amount) - toPaise(settled)));
        return {
          id: d.id,
          kind: KIND_OF[d.kind]!,
          partyId: d.partyId,
          partyName: d.partyName,
          partyPhone: d.partyPhone,
          transactionId: d.transactionId,
          assignedId: t.assignedId,
          dated: t.dateTime,
          old: t.subType === "old_due",
          amount: Number(d.amount),
          left,
          dueOn: d.dueOn,
          overdue: left > 0 && d.dueOn !== null && d.dueOn < today,
          interestRate: d.interestRate === null ? null : Number(d.interestRate),
          frequency: d.frequency,
        };
      })
      .filter((d) => d.left > 0);
  }

  // inside a save: a party's dues of one kind settled oldest first, up to the amount; what's beyond them is on
  // account (it stays on the party's ledger, with no due)
  async settleOldestIn(tx: Tx, input: { kind: "debtor" | "creditor"; partyId: string; transactionId: string; amount: number }) {
    let rest = toPaise(input.amount);
    for (const due of await this.open(tx, and(eq(duesTable.kind, DUE_KIND_DB[input.kind]), eq(duesTable.partyId, input.partyId)), true)) {
      if (rest <= 0) break;
      const take = Math.min(rest, toPaise(due.left));
      await tx.insert(dueSettlementsTable).values({ dueId: due.id, transactionId: input.transactionId, amount: fromPaise(take) });
      rest -= take;
    }
    return Number(fromPaise(rest));
  }

  // inside a save: the loan a repayment or interest is on, of that kind and still open
  async loanIn(tx: Tx, dueId: string, kind: "loanGiven" | "loanTaken") {
    const [due] = await this.open(tx, and(eq(duesTable.id, dueId), eq(duesTable.kind, DUE_KIND_DB[kind])), true);
    if (!due) throw new TRPCError({ code: "NOT_FOUND", message: "That loan isn't open." });
    return { due, ledgerId: (await this.accounts.ledgerOf(tx, "parties", due.partyId)).id };
  }

  // inside a save: a loan settled by this much, never more than is left of it
  async settleLoanIn(tx: Tx, due: DueModel, transactionId: string, amount: number) {
    if (toPaise(amount) > toPaise(due.left)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That's more than is left on the loan." });
    await tx.insert(dueSettlementsTable).values({ dueId: due.id, transactionId, amount: fromPaise(toPaise(amount)) });
  }

  // /dues: one kind's totals and how long settling takes, then each party's open dues (with the party as it is now:
  // short name, phone, town), the most overdue and then the largest first
  async list(input: ListDuesInputModel): Promise<DuesBoardModel> {
    const kind = DUE_KIND_DB[input.kind];
    const [dues, days] = await Promise.all([this.open(db, eq(duesTable.kind, kind)), averageDays(kind, null)]);
    const ids = [...new Set(dues.map((d) => d.partyId))];
    const now = new Map(
      (ids.length
        ? await db
            .select({ id: partiesTable.id, name: partiesTable.name, shortName: partiesTable.shortName, phone: partiesTable.phone, city: partyAddressesTable.city })
            .from(partiesTable)
            .leftJoin(partyAddressesTable, and(eq(partyAddressesTable.partyId, partiesTable.id), eq(partyAddressesTable.isDefault, true), eq(partyAddressesTable.isActive, true)))
            .where(inArray(partiesTable.id, ids))
        : []
      ).map((p) => [p.id, p]),
    );
    const byParty = new Map<string, DuePartyModel>();
    for (const d of dues) {
      const party = now.get(d.partyId);
      const p = byParty.get(d.partyId) ?? {
        partyId: d.partyId,
        partyName: party?.name ?? d.partyName,
        shortName: party?.shortName ?? null,
        partyPhone: party?.phone ?? d.partyPhone,
        city: party?.city ?? null,
        left: 0,
        overdue: 0,
        nextDueOn: null,
        dues: [],
      };
      p.left = Number(fromPaise(toPaise(p.left) + toPaise(d.left)));
      if (d.overdue) p.overdue = Number(fromPaise(toPaise(p.overdue) + toPaise(d.left)));
      if (d.dueOn && (p.nextDueOn === null || d.dueOn < p.nextDueOn)) p.nextDueOn = d.dueOn;
      p.dues.push(d);
      byParty.set(d.partyId, p);
    }
    const list = [...byParty.values()].sort((a, b) => b.overdue - a.overdue || b.left - a.left);
    return {
      total: Number(fromPaise(list.reduce((sum, p) => sum + toPaise(p.left), 0))),
      overdue: Number(fromPaise(list.reduce((sum, p) => sum + toPaise(p.overdue), 0))),
      parties: list.length,
      overdueParties: list.filter((p) => p.overdue > 0).length,
      averageDays: days,
      list,
    };
  }

  // one party's dues page: the party as it is now, its open dues of the kind oldest first, what settled them newest
  // first, and its own pace and last payment
  async party(rawInput: PartyDuesInputModel): Promise<PartyDuesModel> {
    const input = partyDuesInputModel.parse(rawInput);
    const kind = DUE_KIND_DB[input.kind];
    const [[party], dues, days, settled] = await Promise.all([
      db
        .select({
          id: partiesTable.id,
          name: partiesTable.name,
          shortName: partiesTable.shortName,
          phone: partiesTable.phone,
          countryCode: partiesTable.countryCode,
          type: partiesTable.type,
          city: partyAddressesTable.city,
        })
        .from(partiesTable)
        .leftJoin(partyAddressesTable, and(eq(partyAddressesTable.partyId, partiesTable.id), eq(partyAddressesTable.isDefault, true), eq(partyAddressesTable.isActive, true)))
        .where(eq(partiesTable.id, input.partyId)),
      this.open(db, and(eq(duesTable.kind, kind), eq(duesTable.partyId, input.partyId))),
      averageDays(kind, input.partyId),
      db.execute<{ transaction_id: string; assigned_id: string; type: string; sub_type: string | null; date_time: string; amount: string; due_assigned_id: string }>(sql`
        select st.id as transaction_id, st.assigned_id, st.type, st.sub_type, st.date_time, s.amount, dt.assigned_id as due_assigned_id
        from due_settlements s
        join dues d on d.id = s.due_id
        join transactions st on st.id = s.transaction_id and st.status = 'active'
        join transactions dt on dt.id = d.transaction_id and dt.status = 'active'
        where d.kind = ${kind} and d.party_id = ${input.partyId}
        order by st.date_time desc, st.created_at desc`),
    ]);
    if (!party) throw new TRPCError({ code: "NOT_FOUND", message: "Party not found." });
    const settlements = settled.rows.map((r) => ({
      transactionId: r.transaction_id,
      assignedId: r.assigned_id,
      type: r.type,
      badDebt: r.sub_type === "bad_debt",
      dated: new Date(r.date_time),
      amount: Number(r.amount),
      dueAssignedId: r.due_assigned_id,
    }));
    const paid = settlements.find((x) => !x.badDebt);
    // a payment that settled several dues counts once, in full
    const lastPaid = paid ? { dated: paid.dated, amount: settlements.filter((x) => x.transactionId === paid.transactionId).reduce((sum, x) => sum + x.amount, 0) } : null;
    return {
      party,
      left: Number(fromPaise(dues.reduce((sum, d) => sum + toPaise(d.left), 0))),
      overdue: Number(fromPaise(dues.filter((d) => d.overdue).reduce((sum, d) => sum + toPaise(d.left), 0))),
      averageDays: days,
      lastPaid,
      dues,
      settlements,
    };
  }

  // a debtor's or borrower's due they'll never pay (or all of them): what's left, posted today from their ledger to Bad
  // debts (an OT, "bad_debt") and settling the due, so it leaves /dues
  async writeOff(rawInput: WriteOffInputModel, actor: ActorModel): Promise<PartyDuesModel> {
    const input = writeOffInputModel.parse(rawInput);
    await db.transaction(async (tx) => {
      const dues = await this.open(
        tx,
        and(eq(duesTable.kind, DUE_KIND_DB[input.kind]), eq(duesTable.partyId, input.partyId), input.dueId ? eq(duesTable.id, input.dueId) : undefined),
        true,
      );
      if (dues.length === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nothing is left to write off." });
      const total = Number(fromPaise(dues.reduce((sum, d) => sum + toPaise(d.left), 0)));
      const ledger = await this.accounts.ledgerOf(tx, "parties", input.partyId);
      const t = await this.transactions.create(
        tx,
        {
          type: "other",
          subType: "bad_debt",
          dateTime: new Date(),
          amount: total,
          remarks: input.remarks,
          lines: [
            { ledgerId: await this.accounts.ledgerId(tx, "badDebts"), side: "debit", amount: total },
            { ledgerId: ledger.id, side: "credit", amount: total },
          ],
        },
        actor,
      );
      for (const d of dues) await tx.insert(dueSettlementsTable).values({ dueId: d.id, transactionId: t.id, amount: fromPaise(toPaise(d.left)) });
    });
    return this.party({ kind: input.kind, partyId: input.partyId });
  }

  // the open loans of one kind, oldest first, for the chat to pick the one being repaid or paid interest on
  async openLoans(input: OpenLoansInputModel): Promise<DueModel[]> {
    return this.open(db, and(eq(duesTable.kind, DUE_KIND_DB[input.kind]), input.partyId ? eq(duesTable.partyId, input.partyId) : undefined));
  }

  // a due from before the app: posted against Capital on the day it was taken or billed (what we're owed up, Capital
  // up; what we owe up, Capital down), numbered OT, and made a due. A new party is made in the same save
  async addOld(rawInput: AddOldDueInputModel, actor: ActorModel): Promise<DueModel> {
    const input = addOldDueInputModel.parse(rawInput);
    const id = await db.transaction(async (tx) => {
      const ledgerId =
        input.partyLedgerId ??
        (await this.parties.createIn(tx, input.newParty!, input.kind === "debtor" ? "customer" : input.kind === "creditor" ? "supplier" : null)).ledgerId;
      const { ledger, party } = await counterLedger(tx, this.accounts, ledgerId);
      if (!party) throw new TRPCError({ code: "BAD_REQUEST", message: "A due is on a party." });

      // we're owed it (a debtor, a loan we gave): the party is debited; we owe it: the party is credited
      const owedToUs = input.kind === "debtor" || input.kind === "loanGiven";
      const capital = await this.accounts.ledgerId(tx, "capital");
      const t = await this.transactions.create(
        tx,
        {
          type: "other",
          subType: "old_due",
          dateTime: new Date(`${input.dated}T12:00:00+05:30`),
          amount: input.amount,
          remarks: input.remarks,
          lines: [
            { ledgerId: ledger.id, side: owedToUs ? "debit" : "credit", amount: input.amount },
            { ledgerId: capital, side: owedToUs ? "credit" : "debit", amount: input.amount },
          ],
        },
        actor,
      );
      return this.createIn(tx, {
        kind: input.kind,
        party,
        transactionId: t.id,
        amount: input.amount,
        dueOn: input.dueOn,
        terms: isLoan(input.kind) ? { interestRate: input.interestRate!, frequency: input.frequency! } : null,
      });
    });
    const [due] = await this.open(db, eq(duesTable.id, id));
    return due!;
  }
}
