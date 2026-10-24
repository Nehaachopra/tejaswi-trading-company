import { TRPCError } from "@trpc/server";
import { db, eq } from "@repo/database";
import { receiptsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel, PostingLine } from "../accounts/model";
import { fromPaise } from "../accounts/money";
import TransactionService from "../transaction";
import { counterLedger, settleLedger } from "../transaction/settle";
import { type CreateReceiptInputModel, createReceiptInputModel, type ReceiptIdInputModel, type ReceiptModel, tdsOn } from "./model";

// money coming in: from a party, a loan, interest or other income, into cash or one bank account, on any date (no GST
// lock). No bill-wise matching: a party's balance just goes down. When a party deducted TDS, its balance goes down by
// what was received plus the TDS, and the TDS goes to TDS receivable. A new ledger it names is made in the same save
export default class ReceiptService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
  ) {}

  async create(rawInput: CreateReceiptInputModel, actor: ActorModel): Promise<ReceiptModel & { assignedId: string }> {
    const input = createReceiptInputModel.parse(rawInput);
    const saved = await db.transaction(async (tx) => {
      // who it came from: an existing ledger, or a new one made now
      const fromId = input.receivedFromLedgerId ?? (await this.accounts.createLedgerIn(tx, input.newLedger!));
      const { ledger: from, party } = await counterLedger(tx, this.accounts, fromId);
      const into = await settleLedger(tx, this.accounts, input.settledIn, input.bankDetailsId);

      // TDS only when a party deducted it
      if (input.tdsRate !== null && !party) throw new TRPCError({ code: "BAD_REQUEST", message: "TDS applies to parties only." });
      const tds = input.tdsRate !== null ? tdsOn(input.amount, input.tdsRate) : 0;

      // what it posts: cash or bank (and TDS receivable) up, the source down by both
      const lines: PostingLine[] = [{ ledgerId: into, side: "debit", amount: input.amount }];
      if (tds > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "tdsReceivable"), side: "debit", amount: tds });
      lines.push({ ledgerId: from.id, side: "credit", amount: Math.round((input.amount + tds) * 100) / 100 });

      const t = await this.transactions.create(tx, { type: "receipt", dateTime: input.dateTime, amount: input.amount, remarks: input.remarks, lines }, actor);
      await tx.insert(receiptsTable).values({
        transactionId: t.id,
        receivedFromLedgerId: from.id,
        receivedFromNameSnapshot: (party?.shortName ?? from.name).slice(0, 150),
        partyCountryCodeSnapshot: party?.phone ? party.countryCode : null,
        partyPhoneSnapshot: party?.phone ?? null,
        partyEmailSnapshot: party?.email ?? null,
        settledIn: input.settledIn,
        bankDetailsId: input.settledIn === "bank" ? input.bankDetailsId : null,
        referenceNumber: input.referenceNumber,
        amount: fromPaise(Math.round(input.amount * 100)),
        tdsApplicable: tds > 0,
        tdsRate: tds > 0 ? input.tdsRate!.toFixed(2) : null,
        tdsAmount: tds > 0 ? fromPaise(Math.round(tds * 100)) : null,
      });
      return t;
    });
    return { ...(await this.get({ transactionId: saved.id })), assignedId: saved.assignedId };
  }

  // a receipt's own details
  async get(input: ReceiptIdInputModel): Promise<ReceiptModel> {
    const [r] = await db.select().from(receiptsTable).where(eq(receiptsTable.transactionId, input.transactionId));
    if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found." });
    return {
      transactionId: r.transactionId,
      receivedFromLedgerId: r.receivedFromLedgerId,
      receivedFromName: r.receivedFromNameSnapshot,
      partyPhone: r.partyPhoneSnapshot,
      settledIn: r.settledIn,
      bankDetailsId: r.bankDetailsId,
      referenceNumber: r.referenceNumber,
      amount: Number(r.amount),
      tdsRate: r.tdsRate === null ? null : Number(r.tdsRate),
      tdsAmount: r.tdsAmount === null ? null : Number(r.tdsAmount),
    };
  }
}

