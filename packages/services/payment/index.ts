import { TRPCError } from "@trpc/server";
import { and, asc, db, eq } from "@repo/database";
import { bankDetailsTable, duesTable, ledgerEntriesTable, ledgersTable, partyAddressesTable, paymentsTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import { type ActorModel, fitsPaymentKind, type LedgerSummaryModel, type PaymentKind, type PostingLine } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import DueService from "../due";
import PartyService from "../party";
import TransactionService from "../transaction";
import { COMPANY } from "../transaction/company";
import { counterLedger, settleLedger } from "../transaction/settle";
import {
  type CreatePaymentInputModel,
  createPaymentInputModel,
  PAID_FOR_DB,
  type PaymentFitsInputModel,
  paymentFitsInputModel,
  type PaymentIdInputModel,
  type PaymentModel,
  type PaymentSourcesModel,
  type SavedPaymentModel,
  tdsOn,
} from "./model";

// the kind back from how the database keeps it
const KIND_OF = Object.fromEntries(Object.entries(PAID_FOR_DB).map(([k, v]) => [v, k])) as Record<string, PaymentKind>;

// what a ledger holds today, debit as plus (cash and bank accounts hold a debit balance)
const held = (b: { amount: number; side: "debit" | "credit" } | undefined) => (b ? (b.side === "debit" ? 1 : -1) * b.amount : 0);

// money going out: to a supplier, a lender, a borrower, an expense head, a tax or a customer being refunded, from
// cash or one bank account, on any date. A supplier we deducted TDS from goes down by what was paid plus the TDS,
// and the TDS goes to TDS payable; it settles the supplier's dues oldest first. A loan repaid brings the loan picked
// down (never below nothing); its interest is a payment of its own, to Interest paid. A loan given becomes a due. A
// new party or expense ledger it names is made in the same save
export default class PaymentService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
  ) {}

  async create(rawInput: CreatePaymentInputModel, actor: ActorModel): Promise<SavedPaymentModel> {
    const input = createPaymentInputModel.parse(rawInput);
    const saved = await db.transaction(async (tx) => {
      // a loan repaid or its interest: the loan we took, which says who it goes to
      const loan = input.dueId ? await this.dues.loanIn(tx, input.dueId, "loanTaken") : null;
      // who it went to: the lender, an existing ledger, a new party (a supplier in Creditors; anyone else in Parties
      // until their first sale or purchase), or a new expense ledger
      const toId =
        loan?.ledgerId ??
        input.paidToLedgerId ??
        (input.newParty
          ? (await this.parties.createIn(tx, input.newParty, input.paidFor === "supplier" ? "supplier" : null)).ledgerId
          : await this.accounts.createLedgerIn(tx, { head: "expense", name: input.newLedger!.name }));
      const { ledger: to, party } = await counterLedger(tx, this.accounts, toId);
      // and it must be a ledger of that kind: a party for a supplier or a loan, an expense head for an expense
      if (!fitsPaymentKind(input.paidFor, await this.accounts.placeIn(tx, to.id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That ledger doesn't fit what the money was paid for." });
      }
      const from = await settleLedger(tx, this.accounts, input.settledIn, input.bankDetailsId);
      // never more than cash or the bank account holds today
      if (input.amount > held((await this.accounts.balances([from])).get(from)?.today)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `That's more than there is in ${input.settledIn === "cash" ? "cash" : "the bank account"}.` });
      }

      // TDS only from a supplier
      const tds = input.tdsRate !== null ? tdsOn(input.amount, input.tdsRate) : 0;
      const toLedger = Math.round((input.amount + tds) * 100) / 100;

      // what it posts: the party or head up by what was paid (and the TDS), or Interest paid for interest; cash or
      // bank (and TDS payable) down
      const lines: PostingLine[] = [
        { ledgerId: input.paidFor === "interestPaid" ? await this.accounts.ledgerId(tx, "interestPaid") : to.id, side: "debit", amount: toLedger },
      ];
      lines.push({ ledgerId: from, side: "credit", amount: input.amount });
      if (tds > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "tdsPayable"), side: "credit", amount: tds });

      const t = await this.transactions.create(tx, { type: "payment", dateTime: input.dateTime, amount: input.amount, remarks: input.remarks, lines }, actor);

      // the party's default address and the bank account as they are now, kept with the payment so its voucher reads
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
      await tx.insert(paymentsTable).values({
        transactionId: t.id,
        paidToLedgerId: to.id,
        paidToNameSnapshot: (party ? (party.shortName ?? party.name) : to.name).slice(0, 150),
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
        paidFor: PAID_FOR_DB[input.paidFor],
        settledIn: input.settledIn,
        bankDetailsId: input.settledIn === "bank" ? input.bankDetailsId : null,
        referenceNumber: input.referenceNumber,
        bankNameSnapshot: bank ? bank.bankName.slice(0, 100) : null,
        bankAccountLast4Snapshot: bank ? bank.accountNumber.slice(-4) : null,
        bankIfscSnapshot: bank?.ifsc?.slice(0, 11) ?? null,
        amount: fromPaise(Math.round(input.amount * 100)),
        interestOnDueId: input.paidFor === "interestPaid" ? loan!.due.id : null,
        tdsApplicable: tds > 0,
        tdsRate: tds > 0 ? input.tdsRate!.toFixed(2) : null,
        tdsAmount: tds > 0 ? fromPaise(Math.round(tds * 100)) : null,
      });

      // what it does to the dues: a supplier's settled oldest first (with the TDS), the loan repaid brought down, a loan
      // given made a due with its terms
      if (input.paidFor === "supplier" && party) await this.dues.settleOldestIn(tx, { kind: "creditor", partyId: party.id, transactionId: t.id, amount: toLedger });
      if (input.paidFor === "loanRepaid") await this.dues.settleLoanIn(tx, loan!.due, t.id, input.amount);
      if (input.loan) {
        if (!party) throw new TRPCError({ code: "BAD_REQUEST", message: "A loan goes to a party." });
        const { dueOn, ...terms } = input.loan;
        await this.dues.createIn(tx, { kind: "loanGiven", party, transactionId: t.id, amount: input.amount, dueOn, terms });
      }
      return { t };
    });

    const [payment, balances] = await Promise.all([this.get({ transactionId: saved.t.id }), this.balances({ transactionId: saved.t.id })]);
    return { ...payment, balances };
  }

  // cash and each active bank account with what it holds today; the balances only for the admin
  async sources(showBalances: boolean): Promise<PaymentSourcesModel> {
    const cashId = await db.transaction((tx) => this.accounts.ledgerId(tx, "cash"));
    const banks = await db
      .select({ id: bankDetailsTable.id, bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ledgerId: ledgersTable.id })
      .from(bankDetailsTable)
      .innerJoin(ledgersTable, and(eq(ledgersTable.referenceTable, "bank_details"), eq(ledgersTable.referenceId, bankDetailsTable.id)))
      .where(eq(bankDetailsTable.isActive, true));
    const balances = showBalances ? await this.accounts.balances([cashId, ...banks.map((b) => b.ledgerId)]) : new Map();
    return {
      cash: showBalances ? held(balances.get(cashId)?.today) : null,
      banks: banks.map((b) => ({
        id: b.id,
        bankName: b.bankName,
        last4: b.accountNumber.slice(-4),
        available: showBalances ? held(balances.get(b.ledgerId)?.today) : null,
      })),
    };
  }

  // whether an amount can be paid from there (for staff too, who don't see the balance itself)
  async fits(rawInput: PaymentFitsInputModel): Promise<{ fits: boolean }> {
    const input = paymentFitsInputModel.parse(rawInput);
    const from = await db.transaction((tx) => settleLedger(tx, this.accounts, input.settledIn, input.bankDetailsId));
    return { fits: toPaise(input.amount) <= toPaise(held((await this.accounts.balances([from])).get(from)?.today)) };
  }

  // the ledgers a payment moved (cash or the bank, TDS payable, Interest paid, the party or head), each with its
  // balance now
  async balances(input: PaymentIdInputModel): Promise<LedgerSummaryModel[]> {
    const lines = await db
      .select({ ledgerId: ledgerEntriesTable.ledgerId })
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.transactionId, input.transactionId))
      .orderBy(asc(ledgerEntriesTable.createdAt));
    const ids = [...new Set(lines.map((l) => l.ledgerId))];
    const ledgers = await Promise.all(ids.map((id) => this.accounts.ledger({ id })));
    return ledgers.map(({ openingBalance: _o, hasEntries: _h, ...l }) => l);
  }

  // a payment's own details, all as they were when paid
  async get(input: PaymentIdInputModel): Promise<PaymentModel> {
    const [row] = await db
      .select({ p: paymentsTable, t: transactionsTable })
      .from(paymentsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, paymentsTable.transactionId))
      .where(eq(paymentsTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
    const { p, t } = row;
    const [loan] = await db.select({ interestRate: duesTable.interestRate, frequency: duesTable.frequency }).from(duesTable).where(eq(duesTable.transactionId, p.transactionId));
    return {
      transactionId: p.transactionId,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      remarks: t.remarks,
      status: t.status,
      paidFor: KIND_OF[p.paidFor]!,
      createdByName: t.createdByName,
      bank: p.bankNameSnapshot ? { name: p.bankNameSnapshot, last4: p.bankAccountLast4Snapshot ?? "", ifsc: p.bankIfscSnapshot } : null,
      paidToLedgerId: p.paidToLedgerId,
      paidToName: p.paidToNameSnapshot,
      partyPhone: p.partyPhoneSnapshot,
      party: p.partyNameSnapshot
        ? {
            name: p.partyNameSnapshot,
            shortName: p.partyShortNameSnapshot,
            address: p.partyAddressLine1Snapshot
              ? {
                  line1: p.partyAddressLine1Snapshot,
                  line2: p.partyAddressLine2Snapshot,
                  city: p.partyCitySnapshot ?? "",
                  postalCode: p.partyPostalCodeSnapshot ?? "",
                  state: p.partyStateSnapshot ?? "",
                  stateCode: p.partyStateCodeSnapshot ?? "",
                  gstin: p.partyGstinSnapshot,
                }
              : null,
          }
        : null,
      loan: loan?.interestRate != null && loan.frequency ? { interestRate: Number(loan.interestRate), frequency: loan.frequency } : null,
      company: t.companySnapshot ?? COMPANY,
      settledIn: p.settledIn,
      bankDetailsId: p.bankDetailsId,
      referenceNumber: p.referenceNumber,
      amount: Number(p.amount),
      tdsRate: p.tdsRate === null ? null : Number(p.tdsRate),
      tdsAmount: p.tdsAmount === null ? null : Number(p.tdsAmount),
    };
  }
}
