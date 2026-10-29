import { TRPCError } from "@trpc/server";
import { and, asc, db, eq } from "@repo/database";
import { bankDetailsTable, duesTable, ledgerEntriesTable, ledgersTable, partiesTable, partyAddressesTable, receiptsTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import { type ActorModel, fitsReceiptKind, type LedgerSummaryModel, type PostingLine, type ReceiptKind } from "../accounts/model";
import { fromPaise } from "../accounts/money";
import DueService from "../due";
import PartyService from "../party";
import TransactionService from "../transaction";
import { COMPANY } from "../transaction/company";
import { counterLedger, settleLedger } from "../transaction/settle";
import { type CreateReceiptInputModel, createReceiptInputModel, NEW_LEDGER_FOR, RECEIVED_FOR_DB, type ReceiptIdInputModel, type ReceiptModel, type SavedReceiptModel, tdsOn } from "./model";

// the kind back from how the database keeps it
const KIND_OF = Object.fromEntries(Object.entries(RECEIVED_FOR_DB).map(([k, v]) => [v, k])) as Record<string, ReceiptKind>;

// money coming in: from a party, a loan, interest or other income, into cash or one bank account, on any date (no GST
// lock). A customer's balance goes down and its dues are settled oldest first; when it deducted TDS, by what was
// received plus the TDS, and the TDS goes to TDS receivable. A loan given back brings the loan picked down; its
// interest is a receipt of its own, to Interest received. A loan taken becomes a due. A new ledger it names is made in
// the same save
export default class ReceiptService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
  ) {}

  async create(rawInput: CreateReceiptInputModel, actor: ActorModel): Promise<SavedReceiptModel> {
    const input = createReceiptInputModel.parse(rawInput);
    const saved = await db.transaction(async (tx) => {
      // who it came from: an existing ledger, a new party (a customer in Debtors when it's paying us; anyone else in
      // Parties until their first sale or purchase), or a new ledger made now where its kind puts it
      // a loan given back or its interest: the loan we gave, which says who it comes from
      const loan = input.dueId ? await this.dues.loanIn(tx, input.dueId, "loanGiven") : null;
      const fromId =
        loan?.ledgerId ??
        input.receivedFromLedgerId ??
        (input.newParty
          ? (await this.parties.createIn(tx, input.newParty, input.receivedFor === "customer" ? "customer" : null)).ledgerId
          : await this.accounts.createLedgerIn(tx, { ...NEW_LEDGER_FOR[input.receivedFor]!, name: input.newLedger!.name }));
      const { ledger: from, party } = await counterLedger(tx, this.accounts, fromId);
      // and it must be a ledger of that kind: a loan for a loan, income for income
      if (!fitsReceiptKind(input.receivedFor, await this.accounts.placeIn(tx, from.id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That ledger doesn't fit what the money was received for." });
      }
      const into = await settleLedger(tx, this.accounts, input.settledIn, input.bankDetailsId);

      // TDS only when a party deducted it
      if (input.tdsRate !== null && (!party || input.receivedFor !== "customer")) throw new TRPCError({ code: "BAD_REQUEST", message: "TDS applies to parties only." });
      const tds = input.tdsRate !== null ? tdsOn(input.amount, input.tdsRate) : 0;

      // what it posts: cash or bank (and TDS receivable) up, the source down by both (Interest received up, for interest)
      const fromLedger = Math.round((input.amount + tds) * 100) / 100;
      const lines: PostingLine[] = [{ ledgerId: into, side: "debit", amount: input.amount }];
      if (tds > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "tdsReceivable"), side: "debit", amount: tds });
      lines.push({ ledgerId: input.receivedFor === "interestReceived" ? await this.accounts.ledgerId(tx, "interestReceived") : from.id, side: "credit", amount: fromLedger });

      const t = await this.transactions.create(tx, { type: "receipt", dateTime: input.dateTime, amount: input.amount, remarks: input.remarks, lines }, actor);

      // the party's default address and the bank account as they are now, kept with the receipt so its voucher reads
      // the same on any later date
      const [[address], [bank]] = await Promise.all([
        party
          ? tx
              .select()
              .from(partyAddressesTable)
              .where(and(eq(partyAddressesTable.partyId, party.id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)))
          : Promise.resolve([]),
        input.settledIn === "bank" && input.bankDetailsId
          ? tx
              .select({ bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
              .from(bankDetailsTable)
              .where(eq(bankDetailsTable.id, input.bankDetailsId))
          : Promise.resolve([]),
      ]);
      await tx.insert(receiptsTable).values({
        transactionId: t.id,
        receivedFromLedgerId: from.id,
        receivedFromNameSnapshot: (party ? (party.shortName ?? party.name) : from.name).slice(0, 150),
        partyCountryCodeSnapshot: party?.phone ? party.countryCode : null,
        partyPhoneSnapshot: party?.phone ?? null,
        partyEmailSnapshot: party?.email ?? null,
        partyNameSnapshot: party ? party.name.slice(0, 150) : null,
        partyShortNameSnapshot: party?.shortName?.slice(0, 20) ?? null,
        partyAddressLine1Snapshot: address ? address.addressLine1.slice(0, 200) : null,
        partyAddressLine2Snapshot: address?.addressLine2?.slice(0, 200) ?? null,
        partyCitySnapshot: address ? address.city.slice(0, 100) : null,
        partyPostalCodeSnapshot: address ? address.postalCode.slice(0, 6) : null,
        partyStateSnapshot: address ? address.state.slice(0, 100) : null,
        partyStateCodeSnapshot: address?.stateCode ?? null,
        partyGstinSnapshot: address?.gstin?.slice(0, 15) ?? null,
        receivedFor: RECEIVED_FOR_DB[input.receivedFor],
        interestOnDueId: input.receivedFor === "interestReceived" ? loan!.due.id : null,
        settledIn: input.settledIn,
        bankDetailsId: input.settledIn === "bank" ? input.bankDetailsId : null,
        referenceNumber: input.referenceNumber,
        bankNameSnapshot: bank ? bank.bankName.slice(0, 100) : null,
        bankAccountLast4Snapshot: bank ? bank.accountNumber.slice(-4) : null,
        bankIfscSnapshot: bank?.ifsc?.slice(0, 11) ?? null,
        amount: fromPaise(Math.round(input.amount * 100)),
        tdsApplicable: tds > 0,
        tdsRate: tds > 0 ? input.tdsRate!.toFixed(2) : null,
        tdsAmount: tds > 0 ? fromPaise(Math.round(tds * 100)) : null,
      });

      // what it does to the dues: a customer's settled oldest first (with the TDS), the loan given back brought down, a
      // loan taken made a due with its terms
      if (input.receivedFor === "customer" && party) await this.dues.settleOldestIn(tx, { kind: "debtor", partyId: party.id, transactionId: t.id, amount: fromLedger });
      if (input.receivedFor === "loanReturned") await this.dues.settleLoanIn(tx, loan!.due, t.id, input.amount);
      if (input.loan) {
        if (!party) throw new TRPCError({ code: "BAD_REQUEST", message: "A loan comes from a party." });
        const { dueOn, ...terms } = input.loan;
        await this.dues.createIn(tx, { kind: "loanTaken", party, transactionId: t.id, amount: input.amount, dueOn, terms });
      }
      return { t };
    });

    const [receipt, balances] = await Promise.all([this.get({ transactionId: saved.t.id }), this.balances({ transactionId: saved.t.id })]);
    return { ...receipt, balances };
  }

  // the ledgers a receipt moved (cash or the bank, TDS receivable, the source), each with its balance now
  async balances(input: ReceiptIdInputModel): Promise<LedgerSummaryModel[]> {
    const lines = await db
      .select({ ledgerId: ledgerEntriesTable.ledgerId })
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.transactionId, input.transactionId))
      .orderBy(asc(ledgerEntriesTable.createdAt));
    const ids = [...new Set(lines.map((l) => l.ledgerId))];
    const ledgers = await Promise.all(ids.map((id) => this.accounts.ledger({ id })));
    return ledgers.map(({ openingBalance: _o, hasEntries: _h, ...l }) => l);
  }

  // a receipt's own details
  async get(input: ReceiptIdInputModel): Promise<ReceiptModel> {
    const [row] = await db
      .select({
        r: receiptsTable,
        t: transactionsTable,
        bankName: bankDetailsTable.bankName,
        accountNumber: bankDetailsTable.accountNumber,
        ifsc: bankDetailsTable.ifscCode,
        party: partiesTable,
      })
      .from(receiptsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, receiptsTable.transactionId))
      .leftJoin(bankDetailsTable, eq(bankDetailsTable.id, receiptsTable.bankDetailsId))
      .innerJoin(ledgersTable, eq(ledgersTable.id, receiptsTable.receivedFromLedgerId))
      .leftJoin(partiesTable, and(eq(ledgersTable.referenceTable, "parties"), eq(partiesTable.id, ledgersTable.referenceId)))
      .where(eq(receiptsTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found." });
    const { r, t, party } = row;
    // what it was saved with; receipts saved before snapshots were kept fall back to the party and bank as they are now
    const snapped = r.partyNameSnapshot !== null;

    // the party's default address (only for those older receipts), and a loan's interest
    const [[address], [loan]] = await Promise.all([
      party && !snapped
        ? db
            .select()
            .from(partyAddressesTable)
            .where(and(eq(partyAddressesTable.partyId, party.id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)))
        : Promise.resolve([]),
      db.select({ interestRate: duesTable.interestRate, frequency: duesTable.frequency }).from(duesTable).where(eq(duesTable.transactionId, r.transactionId)),
    ]);
    return {
      transactionId: r.transactionId,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      remarks: t.remarks,
      status: t.status,
      receivedFor: KIND_OF[r.receivedFor]!,
      createdByName: t.createdByName,
      bank: r.bankNameSnapshot
        ? { name: r.bankNameSnapshot, last4: r.bankAccountLast4Snapshot ?? "", ifsc: r.bankIfscSnapshot }
        : row.bankName
          ? { name: row.bankName, last4: row.accountNumber!.slice(-4), ifsc: row.ifsc }
          : null,
      receivedFromLedgerId: r.receivedFromLedgerId,
      receivedFromName: r.receivedFromNameSnapshot,
      partyPhone: r.partyPhoneSnapshot,
      party: snapped
        ? {
            name: r.partyNameSnapshot!,
            shortName: r.partyShortNameSnapshot,
            address: r.partyAddressLine1Snapshot
              ? {
                  line1: r.partyAddressLine1Snapshot,
                  line2: r.partyAddressLine2Snapshot,
                  city: r.partyCitySnapshot ?? "",
                  postalCode: r.partyPostalCodeSnapshot ?? "",
                  state: r.partyStateSnapshot ?? "",
                  stateCode: r.partyStateCodeSnapshot ?? "",
                  gstin: r.partyGstinSnapshot,
                }
              : null,
          }
        : party
        ? {
            name: party.name,
            shortName: party.shortName,
            address: address
              ? {
                  line1: address.addressLine1,
                  line2: address.addressLine2,
                  city: address.city,
                  postalCode: address.postalCode,
                  state: address.state,
                  stateCode: address.stateCode,
                  gstin: address.gstin,
                }
              : null,
          }
        : null,
      loan: loan?.interestRate != null && loan.frequency ? { interestRate: Number(loan.interestRate), frequency: loan.frequency } : null,
      company: t.companySnapshot ?? COMPANY,
      settledIn: r.settledIn,
      bankDetailsId: r.bankDetailsId,
      referenceNumber: r.referenceNumber,
      amount: Number(r.amount),
      tdsRate: r.tdsRate === null ? null : Number(r.tdsRate),
      tdsAmount: r.tdsAmount === null ? null : Number(r.tdsAmount),
    };
  }
}

