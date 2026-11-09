import { TRPCError } from "@trpc/server";
import { asc, db, eq, inArray, sql } from "@repo/database";
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
  type CreateTransferInputModel,
  createTransferInputModel,
  type SavedContraModel,
} from "./model";

// what a ledger holds today, debit as plus (cash and bank accounts hold a debit balance)
const held = (b: { amount: number; side: "debit" | "credit" } | undefined) => (b ? (b.side === "debit" ? 1 : -1) * b.amount : 0);

// what each kind is called in a message
const NAME: Record<ContraKind, string> = { deposit: "Deposit", withdrawal: "Withdrawal", transfer: "Transfer" };

// money moving between cash and our bank accounts (a contra): a deposit (cash into a bank account), a withdrawal (cash
// out of one) and a transfer (from one account to another). Dated as a receipt is (today or before; staff a few days
// back at most, checked where it's asked for), it moves money from one side to the other, never more than the side it
// comes out of holds, and is kept in contras with its reference (an empty side is cash)
export default class ContraService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
  ) {}

  // a deposit (Bank up, Cash down) or a withdrawal (Cash up, Bank down) into or out of an active bank account
  async create(kind: "deposit" | "withdrawal", rawInput: CreateContraInputModel, actor: ActorModel): Promise<SavedContraModel> {
    const input = createContraInputModel.parse(rawInput);
    return this.save(kind, { ...input, fromBankId: kind === "withdrawal" ? input.bankDetailsId : null, toBankId: kind === "deposit" ? input.bankDetailsId : null }, actor);
  }

  // a transfer: the account it goes into up, the one it leaves down
  async transfer(rawInput: CreateTransferInputModel, actor: ActorModel): Promise<SavedContraModel> {
    const input = createTransferInputModel.parse(rawInput);
    return this.save("transfer", { ...input, fromBankId: input.fromBankDetailsId, toBankId: input.toBankDetailsId }, actor);
  }

  // saves one: each side's ledger (cash for an empty side), what the side it comes out of holds today, the transaction
  // with its two lines, and the contra row
  private async save(
    kind: ContraKind,
    input: { dateTime: Date; amount: number; referenceNumber: string | null; remarks: string | null; fromBankId: string | null; toBankId: string | null },
    actor: ActorModel,
  ): Promise<SavedContraModel> {
    const saved = await db.transaction(async (tx) => {
      const from = await settleLedger(tx, this.accounts, input.fromBankId ? "bank" : "cash", input.fromBankId);
      const to = await settleLedger(tx, this.accounts, input.toBankId ? "bank" : "cash", input.toBankId);
      const now = await this.accounts.balances([from]);
      const has = toPaise(held(now.get(from)?.today));
      if (toPaise(input.amount) > has) {
        const where = input.fromBankId ? "in that account" : "in cash";
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
      await tx.insert(contrasTable).values({
        transactionId: t.id,
        fromBankDetailsId: input.fromBankId,
        toBankDetailsId: input.toBankId,
        amount: fromPaise(toPaise(input.amount)),
        referenceNumber: input.referenceNumber,
      });
      return t;
    });

    const [contra, balances] = await Promise.all([this.get(kind, { transactionId: saved.id }), this.balances({ transactionId: saved.id })]);
    return { ...contra, balances };
  }

  // one's own details, each side's account (null for cash)
  async get(kind: ContraKind, input: ContraIdInputModel): Promise<ContraModel> {
    const [row] = await db
      .select({ c: contrasTable, t: transactionsTable })
      .from(contrasTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, contrasTable.transactionId))
      .where(eq(contrasTable.transactionId, input.transactionId));
    if (!row || row.t.type !== kind) throw new TRPCError({ code: "NOT_FOUND", message: `${NAME[kind]} not found.` });
    const { c, t } = row;
    const ids = [c.fromBankDetailsId, c.toBankDetailsId].filter((id): id is string => id !== null);
    const banks = await db.select().from(bankDetailsTable).where(inArray(bankDetailsTable.id, ids));
    const side = (id: string | null) => {
      const b = id ? banks.find((x) => x.id === id) : undefined;
      return b ? { id: b.id, name: b.bankName, last4: b.accountNumber.slice(-4), ifsc: b.ifscCode } : null;
    };
    return {
      transactionId: t.id,
      kind,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      status: t.status,
      amount: Number(c.amount),
      from: side(c.fromBankDetailsId),
      to: side(c.toBankDetailsId),
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
