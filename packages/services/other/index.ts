import { TRPCError } from "@trpc/server";
import { asc, db, eq, sql } from "@repo/database";
import { ledgerEntriesTable, ledgersTable, othersTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import { type ActorModel, fitsJournal, type LedgerSummaryModel } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import type { Tx } from "../stock/engine";
import TransactionService from "../transaction";
import { type CreateOtherInputModel, createOtherInputModel, type OtherIdInputModel, type OtherModel, type SavedOtherModel } from "./model";

// Others: a journal entry for anything no other page covers (depreciation, a provision, GST set off, a correction): one
// of our own ledgers debited and another credited with the same amount. Dated as a receipt is (checked where it's asked
// for); never cash, a bank account, a party, a lender, a landlord or an employee, nor a ledger only its own page posts
// to. A new ledger either side needs is made in the same save
export default class OtherService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
  ) {}

  // a ledger an entry can use: active and one of our own heads
  private async journalLedgerIn(tx: Tx, id: string) {
    const [ledger] = await tx.select().from(ledgersTable).where(eq(ledgersTable.id, id));
    if (!ledger) throw new TRPCError({ code: "NOT_FOUND", message: "Ledger not found." });
    if (!ledger.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${ledger.name} is inactive.` });
    if (!fitsJournal(await this.accounts.placeIn(tx, id))) throw new TRPCError({ code: "BAD_REQUEST", message: "That ledger has its own page." });
    return ledger;
  }

  async create(rawInput: CreateOtherInputModel, actor: ActorModel): Promise<SavedOtherModel> {
    const input = createOtherInputModel.parse(rawInput);
    const saved = await db.transaction(async (tx) => {
      // each side: the ledger picked, or a new one made now under the head chosen (a name its head already has is refused)
      const debitId = input.debitLedgerId ?? (await this.accounts.createLedgerIn(tx, input.newDebitLedger!));
      const creditId = input.creditLedgerId ?? (await this.accounts.createLedgerIn(tx, input.newCreditLedger!));
      const [debit, credit] = [await this.journalLedgerIn(tx, debitId), await this.journalLedgerIn(tx, creditId)];
      const t = await this.transactions.create(
        tx,
        {
          type: "other",
          dateTime: input.dateTime,
          amount: input.amount,
          remarks: input.remarks,
          lines: [
            { ledgerId: debit.id, side: "debit", amount: input.amount },
            { ledgerId: credit.id, side: "credit", amount: input.amount },
          ],
        },
        actor,
      );
      // the two ledgers' names as they are now, so it reads the same on any later date
      await tx.insert(othersTable).values({
        transactionId: t.id,
        debitLedgerId: debit.id,
        debitLedgerNameSnapshot: debit.name.slice(0, 150),
        creditLedgerId: credit.id,
        creditLedgerNameSnapshot: credit.name.slice(0, 150),
        total: fromPaise(toPaise(input.amount)),
      });
      return t;
    });
    const [other, balances] = await Promise.all([this.get({ transactionId: saved.id }), this.balances({ transactionId: saved.id })]);
    return { ...other, balances };
  }

  // one entry's own details
  async get(input: OtherIdInputModel): Promise<OtherModel> {
    const [row] = await db
      .select({ o: othersTable, t: transactionsTable })
      .from(othersTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, othersTable.transactionId))
      .where(eq(othersTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found." });
    const { o, t } = row;
    return {
      transactionId: t.id,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      status: t.status,
      amount: Number(o.total),
      debit: { id: o.debitLedgerId, name: o.debitLedgerNameSnapshot },
      credit: { id: o.creditLedgerId, name: o.creditLedgerNameSnapshot },
      remarks: t.remarks,
      createdByName: t.createdByName,
    };
  }

  // the two ledgers it moved (the debit first), each with its balance now
  async balances(input: OtherIdInputModel): Promise<LedgerSummaryModel[]> {
    const lines = await db
      .select({ ledgerId: ledgerEntriesTable.ledgerId })
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.transactionId, input.transactionId))
      .orderBy(sql`case when ${ledgerEntriesTable.transactionType} = 'debit' then 0 else 1 end`, asc(ledgerEntriesTable.createdAt));
    const ids = [...new Set(lines.map((l) => l.ledgerId))];
    const ledgers = await Promise.all(ids.map((id) => this.accounts.ledger({ id })));
    return ledgers.map(({ openingBalance: _o, hasEntries: _h, ...l }) => l);
  }
}
