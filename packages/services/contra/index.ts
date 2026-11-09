import { TRPCError } from "@trpc/server";
import { asc, db, eq, sql } from "@repo/database";
import { bankDetailsTable, contrasTable, ledgerEntriesTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel, LedgerSummaryModel } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import TransactionService from "../transaction";
import { settleLedger } from "../transaction/settle";
import {
  type ContraIdInputModel,
  type ContraKind,
  type ContraModel,
  type CreateContraInputModel,
  createContraInputModel,
  type SavedContraModel,
} from "./model";

// what a ledger holds today, debit as plus (cash and bank accounts hold a debit balance)
const held = (b: { amount: number; side: "debit" | "credit" } | undefined) => (b ? (b.side === "debit" ? 1 : -1) * b.amount : 0);

// money moving between cash and our bank accounts (a contra): a deposit (cash into a bank account) and a withdrawal
// (cash out of one); a transfer follows. Dated as a receipt is (today or before; staff a few days back at most,
// checked where it's asked for), it moves money from one to the other, never more than the one it comes out of holds,
// and is kept in contras with its reference
export default class ContraService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
  ) {}

  // a deposit (Bank up, Cash down) or a withdrawal (Cash up, Bank down) into or out of an active bank account
  async create(kind: ContraKind, rawInput: CreateContraInputModel, actor: ActorModel): Promise<SavedContraModel> {
    const input = createContraInputModel.parse(rawInput);
    const saved = await db.transaction(async (tx) => {
      const cashLedger = await settleLedger(tx, this.accounts, "cash", null);
      const bankLedger = await settleLedger(tx, this.accounts, "bank", input.bankDetailsId);
      // what it comes out of: the cash for a deposit, the account for a withdrawal, as it is today
      const from = kind === "deposit" ? cashLedger : bankLedger;
      const to = kind === "deposit" ? bankLedger : cashLedger;
      const now = await this.accounts.balances([from]);
      const has = toPaise(held(now.get(from)?.today));
      if (toPaise(input.amount) > has) {
        const where = kind === "deposit" ? "in cash" : "in that account";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Only ₹${(has / 100).toLocaleString("en-IN")} is ${where}.` });
      }

      const t = await this.transactions.create(
        tx,
        {
          type: kind,
          dateTime: input.dateTime,
          amount: input.amount,
          remarks: input.remarks,
          lines: [
            { ledgerId: to, side: "debit", amount: input.amount },
            { ledgerId: from, side: "credit", amount: input.amount },
          ],
          isContra: true,
        },
        actor,
      );
      // an empty side is cash in hand
      await tx.insert(contrasTable).values({
        transactionId: t.id,
        fromBankDetailsId: kind === "withdrawal" ? input.bankDetailsId : null,
        toBankDetailsId: kind === "deposit" ? input.bankDetailsId : null,
        amount: fromPaise(toPaise(input.amount)),
        referenceNumber: input.referenceNumber,
      });
      return t;
    });

    const [contra, balances] = await Promise.all([this.get(kind, { transactionId: saved.id }), this.balances({ transactionId: saved.id })]);
    return { ...contra, balances };
  }

  // a deposit's or withdrawal's own details
  async get(kind: ContraKind, input: ContraIdInputModel): Promise<ContraModel> {
    const [row] = await db
      .select({ c: contrasTable, t: transactionsTable, bank: bankDetailsTable })
      .from(contrasTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, contrasTable.transactionId))
      // the account on its bank side: the one it went into, or came out of
      .innerJoin(bankDetailsTable, eq(bankDetailsTable.id, sql`coalesce(${contrasTable.toBankDetailsId}, ${contrasTable.fromBankDetailsId})`))
      .where(eq(contrasTable.transactionId, input.transactionId));
    if (!row || row.t.type !== kind) throw new TRPCError({ code: "NOT_FOUND", message: `${kind === "deposit" ? "Deposit" : "Withdrawal"} not found.` });
    const { c, t, bank } = row;
    return {
      transactionId: t.id,
      kind,
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

  // the ledgers a contra moved (the side it went to, then the side it came from), each with its balance now
  async balances(input: ContraIdInputModel): Promise<LedgerSummaryModel[]> {
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
