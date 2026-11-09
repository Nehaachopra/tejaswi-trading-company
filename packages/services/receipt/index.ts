import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray, sql } from "@repo/database";
import { bankDetailsTable, bankUpiIdsTable, dueSettlementsTable, duesTable, ledgerEntriesTable, ledgersTable, partiesTable, partyAddressesTable, receiptBankDetailsTable, receiptsTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import { type ActorModel, fitsReceiptKind, type LedgerSummaryModel, type PostingLine, type ReceiptKind } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import DueService from "../due";
import PartyService from "../party";
import TransactionService from "../transaction";
import SettingService from "../setting";
import { appOfUpi } from "../bank/upi-handles";
import { BANK_MODE_DB, type BankMode, SETTLED_IN_DB, type SettledInModel } from "../payment/model";
import { counterLedger, moneyPartsIn } from "../transaction/settle";
import type { Tx } from "../stock/engine";
import { type CreateReceiptInputModel, createReceiptInputModel, gstOutOf, NEW_LEDGER_FOR, SCRAP_GST, RECEIVED_FOR_DB, type ReceiptIdInputModel, type ReceiptModel, type SavedReceiptModel, tdsOn } from "./model";

// the kind back from how the database keeps it
// the TDS a party takes from what it pays us, by law: a buyer 0.1% under section 194Q (we have a PAN), a borrower 10% on
// interest under section 194A
const RECEIPT_TDS_RATE: Partial<Record<ReceiptKind, number>> = { customer: 0.1, interestReceived: 10 };

const KIND_OF = Object.fromEntries(Object.entries(RECEIVED_FOR_DB).map(([k, v]) => [v, k])) as Record<string, ReceiptKind>;
const MODE_OF = Object.fromEntries(Object.entries(BANK_MODE_DB).map(([k, v]) => [v, k])) as Record<string, BankMode>;
const SETTLED_OF = Object.fromEntries(Object.entries(SETTLED_IN_DB).map(([k, v]) => [v, k])) as Record<string, SettledInModel>;

// money coming in: from a party, a loan, interest or other income, into cash, bank accounts or both, on any date (only a
// scrap sale, which carries GST, has its month locked by GSTR-1). A customer's balance goes down and its dues are settled oldest first; when it deducted TDS, by what was
// received plus the TDS, and the TDS goes to TDS. A loan given back brings the loan picked down; its
// interest is a receipt of its own, to Interest received. A loan taken becomes a due. A new ledger it names is made in
// the same save
export default class ReceiptService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly settings = new SettingService(),
  ) {}

  async create(rawInput: CreateReceiptInputModel, actor: ActorModel): Promise<SavedReceiptModel> {
    const input = createReceiptInputModel.parse(rawInput);
    const saved = await db.transaction(async (tx) => {
      // who it came from: an existing ledger, a new party (a customer in Debtors when it's paying us; anyone else in
      // Parties until their first sale or purchase), or a new ledger made now where its kind puts it
      // a loan given back or its interest: the loan we gave, which says who it comes from
      const loan = input.dueId ? await this.dues.loanIn(tx, input.dueId, "loanGiven") : null;
      const lent = input.lender ? await this.dues.lenderIn(tx, input.lender) : null;
      const fromId =
        lent?.ledgerId ??
        loan?.ledgerId ??
        input.receivedFromLedgerId ??
        // capital: the one Capital ledger
        (input.receivedFor === "capital" ? await this.accounts.ledgerId(tx, "capital") : null) ??
        (input.newParty
          ? (await this.parties.createIn(tx, input.newParty, input.receivedFor === "customer" ? "customer" : null)).ledgerId
          : await this.accounts.createLedgerIn(tx, { ...NEW_LEDGER_FOR[input.receivedFor]!, name: input.newLedger!.name }));
      const { ledger: from, party } = await counterLedger(tx, this.accounts, fromId);
      // and it must be a ledger of that kind: a loan for a loan, income for income
      if (!fitsReceiptKind(input.receivedFor, await this.accounts.placeIn(tx, from.id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That ledger doesn't fit what the money was received for." });
      }
      // where it came into: cash and the first account (whichever are used), and any more accounts, each with its part
      const into = await moneyPartsIn(tx, this.accounts, input);

      // a bank or NBFC pays a loan into a bank account, never in cash
      if (lent && input.settledIn !== "bank") throw new TRPCError({ code: "BAD_REQUEST", message: "A bank's loan comes into a bank account." });
      // TDS only when a party deducted it: a customer paying us, or a borrower paying interest
      if (input.tdsRate !== null && (!party || (input.receivedFor !== "customer" && input.receivedFor !== "interestReceived"))) throw new TRPCError({ code: "BAD_REQUEST", message: "TDS applies to parties only." });
      // the rate is the law's, never typed: 0.1% a buyer takes under 194Q, 10% a borrower takes on interest under 194A
      const tdsRate = input.tdsRate !== null ? RECEIPT_TDS_RATE[input.receivedFor]! : null;
      const tds = tdsRate !== null ? tdsOn(input.amount, tdsRate) : 0;

      // a scrap sale: the party who bought it (its default address goes on the invoice), and the GST taken out of what
      // was received at its fixed rate, CGST + SGST within our state or IGST outside it. Its month locks once
      // GSTR-1 is filed
      const scrap = from.id === (await this.accounts.ledgerId(tx, "scrapSale"));
      if (scrap && !input.buyerLedgerId && !input.newBuyer) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick who bought the scrap." });
      if (!scrap && (input.buyerLedgerId || input.newBuyer)) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a scrap sale has a buyer." });
      // a new buyer is made a customer in the same save, so the next scrap sale finds them
      const buyerLedgerId = scrap ? (input.buyerLedgerId ?? (await this.parties.createIn(tx, input.newBuyer!, "customer")).ledgerId) : null;
      const buyer = buyerLedgerId ? await this.buyerIn(tx, buyerLedgerId) : null;
      let gst: ({ hsn: string; rate: number } & ReturnType<typeof gstOutOf>) | null = null;
      if (buyer) {
        await this.transactions.assertOpen(tx, "gstr1", input.dateTime);
        const company = await this.settings.get("company", tx);
        gst = { ...SCRAP_GST, ...gstOutOf(toPaise(input.amount), SCRAP_GST.rate, buyer.stateCode === company.stateCode) };
      }

      // what it posts: cash or bank (and TDS) up, the source down by both (Interest received up, for interest)
      const fromLedger = Math.round((input.amount + tds) * 100) / 100;
      const lines: PostingLine[] = [];
      if (into.cashLedger && into.cashPart > 0) lines.push({ ledgerId: into.cashLedger, side: "debit", amount: into.cashPart / 100 });
      if (into.bankLedger && into.bankPart > 0) lines.push({ ledgerId: into.bankLedger, side: "debit", amount: into.bankPart / 100 });
      for (const b of into.more) lines.push({ ledgerId: b.ledger, side: "debit", amount: b.part / 100 });
      if (tds > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "tdsReceivable"), side: "debit", amount: tds });
      if (gst) {
        // a scrap sale: Scrap sale up by the price before GST, the GST owed up by the rest
        lines.push({ ledgerId: from.id, side: "credit", amount: gst.taxable / 100 });
        if (gst.cgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputCgst"), side: "credit", amount: gst.cgst / 100 });
        if (gst.sgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputSgst"), side: "credit", amount: gst.sgst / 100 });
        if (gst.igst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputIgst"), side: "credit", amount: gst.igst / 100 });
      } else {
        lines.push({ ledgerId: input.receivedFor === "interestReceived" ? await this.accounts.ledgerId(tx, "interestReceived") : from.id, side: "credit", amount: fromLedger });
      }

      const t = await this.transactions.create(tx, { type: "receipt", dateTime: input.dateTime, amount: input.amount, remarks: input.remarks, lines }, actor);

      // the party's (or the scrap buyer's) default address and the bank account as they are now, kept with the receipt so
      // its voucher reads the same on any later date
      const who = party ?? buyer?.party ?? null;
      const [[address], [bank], moreBanks] = await Promise.all([
        who
          ? tx
              .select()
              .from(partyAddressesTable)
              .where(and(eq(partyAddressesTable.partyId, who.id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)))
          : Promise.resolve([]),
        into.bankLedger && input.bankDetailsId
          ? tx
              .select({ bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
              .from(bankDetailsTable)
              .where(eq(bankDetailsTable.id, input.bankDetailsId))
          : Promise.resolve([]),
        into.more.length > 0
          ? tx
              .select({ id: bankDetailsTable.id, bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
              .from(bankDetailsTable)
              .where(inArray(bankDetailsTable.id, into.more.map((m) => m.bankDetailsId)))
          : Promise.resolve([]),
      ]);
      const [row] = await tx.insert(receiptsTable).values({
        transactionId: t.id,
        receivedFromLedgerId: from.id,
        receivedFromNameSnapshot: (who ? (who.shortName ?? who.name) : from.name).slice(0, 150),
        partyCountryCodeSnapshot: who?.phone ? who.countryCode : null,
        partyPhoneSnapshot: who?.phone ?? null,
        partyEmailSnapshot: who?.email ?? null,
        partyNameSnapshot: who ? who.name.slice(0, 150) : null,
        partyShortNameSnapshot: who?.shortName?.slice(0, 20) ?? null,
        partyAddressLine1Snapshot: address ? address.addressLine1.slice(0, 200) : null,
        partyAddressLine2Snapshot: address?.addressLine2?.slice(0, 200) ?? null,
        partyCitySnapshot: address ? address.city.slice(0, 100) : null,
        partyPostalCodeSnapshot: address ? address.postalCode.slice(0, 6) : null,
        partyStateSnapshot: address ? address.state.slice(0, 100) : null,
        partyStateCodeSnapshot: address?.stateCode ?? null,
        partyGstinSnapshot: address?.gstin?.slice(0, 15) ?? null,
        receivedFor: RECEIVED_FOR_DB[input.receivedFor],
        interestOnDueId: input.receivedFor === "interestReceived" ? loan!.due.id : null,
        settledIn: SETTLED_IN_DB[input.settledIn],
        referenceNumber: input.settledIn === "bank" ? null : input.cashReferenceNumber,
        amount: fromPaise(Math.round(input.amount * 100)),
        tdsApplicable: tds > 0,
        tdsRate: tds > 0 ? tdsRate!.toFixed(2) : null,
        tdsAmount: tds > 0 ? fromPaise(Math.round(tds * 100)) : null,
        hsnSnapshot: gst?.hsn ?? null,
        gstRate: gst ? gst.rate.toFixed(2) : null,
        taxableAmount: gst ? fromPaise(gst.taxable) : null,
        cgstAmount: gst ? fromPaise(gst.cgst) : null,
        sgstAmount: gst ? fromPaise(gst.sgst) : null,
        igstAmount: gst ? fromPaise(gst.igst) : null,
      }).returning({ id: receiptsTable.id });

      // the bank's part: each account, how much came in, how and its reference, and the account as it is now; each row
      // a millisecond apart, so they read back in the order saved (the first account, then the others)
      const savedAt = Date.now();
      if (bank && input.bankDetailsId) {
        await tx.insert(receiptBankDetailsTable).values({
          createdAt: new Date(savedAt),
          receiptId: row!.id,
          bankDetailsId: input.bankDetailsId,
          amount: fromPaise(into.bankPart),
          mode: BANK_MODE_DB[input.bankMode!],
          referenceNumber: input.referenceNumber,
          bankNameSnapshot: bank.bankName.slice(0, 100),
          bankAccountLast4Snapshot: bank.accountNumber.slice(-4),
          bankIfscSnapshot: bank.ifsc?.slice(0, 11) ?? null,
        });
      }
      for (const [i, part] of input.moreBankParts.entries()) {
        const acc = moreBanks.find((m) => m.id === part.bankDetailsId);
        if (!acc) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the bank account." });
        await tx.insert(receiptBankDetailsTable).values({
          createdAt: new Date(savedAt + i + 1),
          receiptId: row!.id,
          bankDetailsId: part.bankDetailsId,
          amount: fromPaise(into.more[i]!.part),
          mode: BANK_MODE_DB[part.mode],
          referenceNumber: part.referenceNumber,
          bankNameSnapshot: acc.bankName.slice(0, 100),
          bankAccountLast4Snapshot: acc.accountNumber.slice(-4),
          bankIfscSnapshot: acc.ifsc?.slice(0, 11) ?? null,
        });
      }

      // a UPI ID typed for an account that had none: added to it, unless another account already has it
      for (const u of input.bankUpiIds) {
        const [held] = await tx.select({ bankDetailsId: bankUpiIdsTable.bankDetailsId }).from(bankUpiIdsTable).where(eq(bankUpiIdsTable.upiId, u.upiId));
        if (held && held.bankDetailsId !== u.bankDetailsId) throw new TRPCError({ code: "BAD_REQUEST", message: "That UPI ID is on another account." });
        // the account's default when it has no other
        if (!held) {
          const [other] = await tx.select({ id: bankUpiIdsTable.id }).from(bankUpiIdsTable).where(eq(bankUpiIdsTable.bankDetailsId, u.bankDetailsId)).limit(1);
          await tx.insert(bankUpiIdsTable).values({ bankDetailsId: u.bankDetailsId, upiId: u.upiId, provider: appOfUpi(u.upiId)!, isDefault: !other });
        }
      }

      // what it does to the dues: a customer's settled oldest first (with the TDS), the loan given back brought down, a
      // loan taken made a due with its terms
      if (input.receivedFor === "customer" && party) await this.dues.settleOldestIn(tx, { kind: "debtor", partyId: party.id, transactionId: t.id, amount: fromLedger });
      if (input.receivedFor === "loanReturned") await this.dues.settleLoanIn(tx, loan!.due, t.id, input.amount);
      if (input.loan) {
        if (!party && !lent) throw new TRPCError({ code: "BAD_REQUEST", message: "A loan comes from a party." });
        const { dueOn, ...terms } = input.loan;
        await this.dues.createIn(tx, { kind: "loanTaken", party, lender: lent?.due ?? null, transactionId: t.id, amount: input.amount, dueOn, terms });
      }
      return { t };
    });

    const [receipt, balances] = await Promise.all([this.get({ transactionId: saved.t.id }), this.balances({ transactionId: saved.t.id })]);
    return { ...receipt, balances };
  }

  // the ledgers a receipt moved (cash or the bank, TDS, the source), each with its balance now
  async balances(input: ReceiptIdInputModel): Promise<LedgerSummaryModel[]> {
    const lines = await db
      .select({ ledgerId: ledgerEntriesTable.ledgerId })
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.transactionId, input.transactionId))
      // the debit side of the transaction first, then the credit side
      .orderBy(sql`case when ${ledgerEntriesTable.transactionType} = 'debit' then 0 else 1 end`, asc(ledgerEntriesTable.createdAt));
    const ids = [...new Set(lines.map((l) => l.ledgerId))];
    const ledgers = await Promise.all(ids.map((id) => this.accounts.ledger({ id })));
    return ledgers.map(({ openingBalance: _o, hasEntries: _h, ...l }) => l);
  }

  // a receipt's own details
  async get(input: ReceiptIdInputModel): Promise<ReceiptModel> {
    const [row] = await db
      .select({ r: receiptsTable, t: transactionsTable, party: partiesTable })
      .from(receiptsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, receiptsTable.transactionId))
      .innerJoin(ledgersTable, eq(ledgersTable.id, receiptsTable.receivedFromLedgerId))
      .leftJoin(partiesTable, and(eq(ledgersTable.referenceTable, "parties"), eq(partiesTable.id, ledgersTable.referenceId)))
      .where(eq(receiptsTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found." });
    const { r, t, party } = row;
    // what it was saved with; receipts saved before snapshots were kept fall back to the party and bank as they are now
    const snapped = r.partyNameSnapshot !== null;
    // its bank rows in the order they were saved: the first account, then any more; the rest came in cash
    const [b, ...more] = await db
      .select()
      .from(receiptBankDetailsTable)
      .where(eq(receiptBankDetailsTable.receiptId, r.id))
      .orderBy(asc(receiptBankDetailsTable.createdAt), asc(receiptBankDetailsTable.id));
    const bankAmount = [b, ...more].reduce((sum, x) => (x ? sum + toPaise(x.amount) : sum), 0) / 100;

    // the party's default address (only for those older receipts), and a loan's interest
    const [[address], [loan], [settled]] = await Promise.all([
      party && !snapped
        ? db
            .select()
            .from(partyAddressesTable)
            .where(and(eq(partyAddressesTable.partyId, party.id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)))
        : Promise.resolve([]),
      db.select({ interestRate: duesTable.interestRate, frequency: duesTable.frequency }).from(duesTable).where(eq(duesTable.transactionId, r.transactionId)),
      db.select({ amount: sql<string>`coalesce(sum(${dueSettlementsTable.amount}), 0)` }).from(dueSettlementsTable).where(eq(dueSettlementsTable.transactionId, r.transactionId)),
    ]);
    // a customer's receipt: what it settled of their dues, the rest an advance (only when there is one)
    const settles = Math.round((Number(r.amount) + Number(r.tdsAmount ?? 0)) * 100) / 100;
    const duePart = Number(settled?.amount ?? 0);
    const advancePart = Math.round((settles - duePart) * 100) / 100;
    return {
      transactionId: r.transactionId,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      remarks: t.remarks,
      status: t.status,
      receivedFor: KIND_OF[r.receivedFor]!,
      createdByName: t.createdByName,
      bank: b ? { name: b.bankNameSnapshot, last4: b.bankAccountLast4Snapshot, ifsc: b.bankIfscSnapshot } : null,
      receivedFromLedgerId: r.receivedFromLedgerId,
      receivedFromName: r.receivedFromNameSnapshot,
      partyPhone: r.partyPhoneSnapshot,
      party: snapped
        ? {
            name: r.partyNameSnapshot!,
            shortName: r.partyShortNameSnapshot,
            address: r.partyAddressLine1Snapshot !== null
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
      company: t.companySnapshot ?? (await this.settings.get("company")),
      settledIn: SETTLED_OF[r.settledIn]!,
      cashAmount: (toPaise(r.amount) - toPaise(bankAmount)) / 100,
      bankAmount,
      bankDetailsId: b?.bankDetailsId ?? null,
      bankMode: b ? MODE_OF[b.mode]! : null,
      referenceNumber: b?.referenceNumber ?? null,
      cashReferenceNumber: r.referenceNumber,
      moreBankParts: more.map((x) => ({
        bankDetailsId: x.bankDetailsId,
        name: x.bankNameSnapshot,
        last4: x.bankAccountLast4Snapshot,
        ifsc: x.bankIfscSnapshot,
        amount: Number(x.amount),
        mode: MODE_OF[x.mode]!,
        referenceNumber: x.referenceNumber,
      })),
      amount: Number(r.amount),
      tdsRate: r.tdsRate === null ? null : Number(r.tdsRate),
      tdsAmount: r.tdsAmount === null ? null : Number(r.tdsAmount),
      split: KIND_OF[r.receivedFor] === "customer" && advancePart > 0 ? { due: duePart, advance: advancePart } : null,
      gst:
        r.gstRate !== null
          ? {
              hsn: r.hsnSnapshot!,
              rate: Number(r.gstRate),
              taxable: Number(r.taxableAmount),
              cgst: Number(r.cgstAmount ?? 0),
              sgst: Number(r.sgstAmount ?? 0),
              igst: Number(r.igstAmount ?? 0),
            }
          : null,
    };
  }

  // a scrap sale's buyer, from its ledger: an active party with a default address, whose state says CGST + SGST or IGST
  private async buyerIn(tx: Tx, ledgerId: string) {
    const { party } = await counterLedger(tx, this.accounts, ledgerId);
    if (!party) throw new TRPCError({ code: "BAD_REQUEST", message: "The buyer must be a party." });
    if (!party.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${party.name} is inactive.` });
    const [address] = await tx
      .select({ stateCode: partyAddressesTable.stateCode })
      .from(partyAddressesTable)
      .where(and(eq(partyAddressesTable.partyId, party.id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)));
    if (!address) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The buyer needs an address for the invoice." });
    return { party, stateCode: address.stateCode as string };
  }
}

