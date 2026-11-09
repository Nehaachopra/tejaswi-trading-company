import { TRPCError } from "@trpc/server";
import { asc, db, eq, sql } from "@repo/database";
import { bankDetailsTable, contrasTable, ledgerEntriesTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel, LedgerSummaryModel } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import TransactionService from "../transaction";
import { settleLedger } from "../transaction/settle";
import { type CreateDepositInputModel, createDepositInputModel, type DepositIdInputModel, type DepositModel, type SavedDepositModel } from "./model";

// what a ledger holds today, debit as plus (cash and bank accounts hold a debit balance)
const held = (b: { amount: number; side: "debit" | "credit" } | undefined) => (b ? (b.side === "debit" ? 1 : -1) * b.amount : 0);

// money moving between cash and our bank accounts (a contra): a deposit (cash into a bank account) for now; a
// withdrawal and a transfer follow. Dated as a receipt is (today or before; staff a few days back at most, checked
// where it's asked for), it posts Bank up and Cash down, and is kept in contras with its reference
export default class ContraService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
  ) {}

  // a deposit: never more than the cash held today; into an active bank account
  async deposit(rawInput: CreateDepositInputModel, actor: ActorModel): Promise<SavedDepositModel> {
    const input = createDepositInputModel.parse(rawInput);
    const saved = await db.transaction(async (tx) => {
      const cashLedger = await settleLedger(tx, this.accounts, "cash", null);
      const bankLedger = await settleLedger(tx, this.accounts, "bank", input.bankDetailsId);
      // the cash there is today
      const now = await this.accounts.balances([cashLedger]);
      const cashHeld = toPaise(held(now.get(cashLedger)?.today));
      if (toPaise(input.amount) > cashHeld) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Only ₹${(cashHeld / 100).toLocaleString("en-IN")} is in cash.` });
      }

      const t = await this.transactions.create(
        tx,
        {
          type: "deposit",
          dateTime: input.dateTime,
          amount: input.amount,
          remarks: input.remarks,
          lines: [
            { ledgerId: bankLedger, side: "debit", amount: input.amount },
            { ledgerId: cashLedger, side: "credit", amount: input.amount },
          ],
          isContra: true,
        },
        actor,
      );
      await tx.insert(contrasTable).values({
        transactionId: t.id,
        fromBankDetailsId: null,
        toBankDetailsId: input.bankDetailsId,
        amount: fromPaise(toPaise(input.amount)),
        referenceNumber: input.referenceNumber,
      });
      return t;
    });

    const [deposit, balances] = await Promise.all([this.getDeposit({ transactionId: saved.id }), this.balances({ transactionId: saved.id })]);
    return { ...deposit, balances };
  }

  // a deposit's own details
  async getDeposit(input: DepositIdInputModel): Promise<DepositModel> {
    const [row] = await db
      .select({ c: contrasTable, t: transactionsTable, bank: bankDetailsTable })
      .from(contrasTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, contrasTable.transactionId))
      .innerJoin(bankDetailsTable, eq(bankDetailsTable.id, contrasTable.toBankDetailsId))
      .where(eq(contrasTable.transactionId, input.transactionId));
    if (!row || row.t.type !== "deposit") throw new TRPCError({ code: "NOT_FOUND", message: "Deposit not found." });
    const { c, t, bank } = row;
    return {
      transactionId: t.id,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      status: t.status,
      amount: Number(c.amount),
      bank: { id: bank.id, name: bank.bankName, last4: bank.accountNumber.slice(-4), ifsc: bank.ifscCode },
      referenceNumber: c.referenceNumber,
      remarks: t.remarks,
      createdByName: t.createdByName,
    };
  }

  // the ledgers a contra moved (the bank account, then cash), each with its balance now
  async balances(input: DepositIdInputModel): Promise<LedgerSummaryModel[]> {
    const lines = await db
      .select({ ledgerId: ledgerEntriesTable.ledgerId })
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.transactionId, input.transactionId))
      // the debit side first, then the credit side
      .orderBy(sql`case when ${ledgerEntriesTable.transactionType} = 'debit' then 0 else 1 end`, asc(ledgerEntriesTable.createdAt));
    const ids = [...new Set(lines.map((l) => l.ledgerId))];
    const ledgers = await Promise.all(ids.map((id) => this.accounts.ledger({ id })));
    return ledgers.map(({ openingBalance: _o, hasEntries: _h, ...l }) => l);
  }
}
