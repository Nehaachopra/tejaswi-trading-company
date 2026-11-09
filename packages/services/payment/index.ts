import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, gte, inArray, isNotNull, lt, lte, ne, or, sql } from "@repo/database";
import { bankDetailsTable, dueSettlementsTable, duesTable, ledgerEntriesTable, ledgersTable, lendersTable, partiesTable, partyAddressesTable, partyPaidBeforeTable, partyUpiIdsTable, paymentsTable, transactionBankDetailsTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import { type ActorModel, fitsPaymentKind, type LedgerSummaryModel, type PaymentKind, type PostingLine, type TdsType } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import { queueDocument } from "../document/queue";
import DueService from "../due";
import PartyService from "../party";
import TransactionService from "../transaction";
import SettingService from "../setting";
import { financialYear } from "../setting/model";
import { counterLedger, moneyPartsIn, settleLedger } from "../transaction/settle";
import {
  type CashTodayInputModel,
  cashTodayInputModel,
  type CreatePaymentInputModel,
  createPaymentInputModel,
  PAID_FOR_DB,
  SETTLED_IN_DB,
  type SettledInModel,
  type PaymentFitsInputModel,
  paymentFitsInputModel,
  type PaymentIdInputModel,
  type PaymentModel,
  type PaymentSourcesModel,
  type SavedPaymentModel,
  type ExpenseTaxInputModel,
  expenseTaxInputModel,
  type InterestTdsInputModel,
  interestTdsInputModel,
  type InterestTdsModel,
  type ExpenseTaxModel,
  expenseTds,
  expenseTdsRate,
  type ExpenseGstModel,
  gstInBill,
  CONTRACT_BILL_LIMIT,
  PHONE_OPTIONAL_HEADS,
  RCM_RENT_RATE,
  RCM_SAC,
  RCM_SERVICE_RATE,
  RCM_TRANSPORT_RATE,
  rcmServiceOf,
  rcmOn,
  type SupplierTdsInputModel,
  supplierTdsInputModel,
  type SupplierTdsModel,
  tds194Q,
  BANK_MODE_DB,
  type BankMode,
} from "./model";

// the kind back from how the database keeps it
const MODE_OF = Object.fromEntries(Object.entries(BANK_MODE_DB).map(([k, v]) => [v, k])) as Record<string, BankMode>;

const KIND_OF = Object.fromEntries(Object.entries(PAID_FOR_DB).map(([k, v]) => [v, k])) as Record<string, PaymentKind>;
const SETTLED_OF = Object.fromEntries(Object.entries(SETTLED_IN_DB).map(([k, v]) => [v, k])) as Record<string, SettledInModel>;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];


// what a ledger holds today, debit as plus (cash and bank accounts hold a debit balance)
const held = (b: { amount: number; side: "debit" | "credit" } | undefined) => (b ? (b.side === "debit" ? 1 : -1) * b.amount : 0);

// reverse-charge GST by tax: what's owed, and the input credit it becomes once it's paid
const RCM_SPLITS = [
  { payable: "rcmCgstPayable", input: "inputCgst", part: "half", supply: "intra" },
  { payable: "rcmSgstPayable", input: "inputSgst", part: "half", supply: "intra" },
  { payable: "rcmIgstPayable", input: "inputIgst", part: "whole", supply: "inter" },
] as const;

// money going out: to a supplier, a lender, a borrower, an expense head, a tax or a customer being refunded, from
// cash or one bank account, on any date. A supplier's TDS (section 194Q) is worked out here; they go down by what
// was paid plus the TDS, and the TDS goes to TDS payable; it settles the supplier's dues oldest first. A loan repaid brings the loan picked
// down (never below nothing); its interest is a payment of its own, to Interest paid. A loan given becomes a due. A
// new party or expense ledger it names is made in the same save
export default class PaymentService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly settings = new SettingService(),
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
          : await this.accounts.createLedgerIn(tx, { head: "expense", name: input.newLedger!.name, tdsType: input.newLedger!.tdsType }));
      const { ledger: to, party, lender } = await counterLedger(tx, this.accounts, toId);
      const place = await this.accounts.placeIn(tx, to.id);
      // and it must be a ledger of that kind: a party for a supplier or a loan, an expense head for an expense
      if (!fitsPaymentKind(input.paidFor, place)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That ledger doesn't fit what the money was paid for." });
      }
      const src = await moneyPartsIn(tx, this.accounts, input);

      // an expense to a head with TDS names who was paid (a party already added, or a new one made now)
      const tdsType = input.paidFor === "expense" ? place.tdsType : null;
      // rent goes to a landlord, added in Entities; the other heads to a party
      const rent = tdsType === "rent";
      if (rent && !input.payeeLandlordId) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the landlord." });
      if (rent && (input.payeeLedgerId || input.newPayee)) throw new TRPCError({ code: "BAD_REQUEST", message: "Rent goes to a landlord." });
      // casual labour can go unnamed, up to the amount a single payment can carry no TDS
      const unnamed = place.key === "labour" && !input.payeeLedgerId && !input.newPayee && input.amount <= CONTRACT_BILL_LIMIT;
      if (tdsType && !rent && !unnamed && !input.payeeLedgerId && !input.newPayee) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick who was paid." });
      const landlord = rent ? await this.landlordOf(tx, input.payeeLandlordId!) : null;
      // a broker paid brokerage is an agent (their ledger moves to Agents unless they're a customer or supplier)
      const payeeRole = place.key === "brokerage" ? ("agent" as const) : null;
      const payee = tdsType && !rent && !unnamed
        ? (await counterLedger(tx, this.accounts, input.payeeLedgerId ?? (await this.parties.createIn(tx, input.newPayee!, payeeRole, PHONE_OPTIONAL_HEADS.includes(place.key))).ledgerId)).party
        : null;
      if (payee && payeeRole) await this.parties.addRoleIn(tx, payee.id, payeeRole);
      if (tdsType && !rent && !unnamed && !payee) throw new TRPCError({ code: "BAD_REQUEST", message: "Who was paid must be a party." });

      // a PAN given with this payment goes on the record of whoever carries its TDS, if they have none
      const taxed = landlord ?? payee ?? (input.paidFor === "supplier" || input.paidFor === "interestPaid" ? party : null);
      if (input.pan && taxed && !taxed.pan) {
        await tx.update(partiesTable).set({ pan: input.pan }).where(eq(partiesTable.id, taxed.id));
      }
      // a UPI ID typed for the QR goes on whoever was paid (the landlord, the expense's payee, or the party), for next time
      const upiOwner = landlord ?? payee ?? party;
      if (input.payeeUpiId && upiOwner) {
        // a landlord has one UPI ID: the new one takes its place
        if (landlord) await tx.delete(partyUpiIdsTable).where(eq(partyUpiIdsTable.partyId, landlord.id));
        await tx.insert(partyUpiIdsTable).values({ partyId: upiOwner.id, upiId: input.payeeUpiId }).onConflictDoNothing();
      }
      if (input.pan && input.paidFor === "interestPaid" && lender && !lender.pan) await tx.update(lendersTable).set({ pan: input.pan }).where(eq(lendersTable.id, lender.id));

      // the TDS as the rules work it out: a supplier's (194Q), or an expense head's (rent, contract work, brokerage);
      // and rent from a landlord without a GSTIN carries reverse-charge GST
      const supplierTds =
        input.paidFor === "supplier" ? await this.tdsIn(tx, { ledgerId: to.id, hasPan: !!(party?.pan || input.pan), amount: input.amount, dateTime: input.dateTime }) : null;
      const paid = landlord ? this.landlordPayee(landlord) : payee ? await this.payeeOf(tx, payee.id) : null;
      if (paid) paid.pan ??= input.pan;
      if (input.gst && rent && !paid?.hasGstin) throw new TRPCError({ code: "BAD_REQUEST", message: "Rent from a landlord with no GSTIN is reverse charge." });
      if (input.gst && rcmServiceOf(place.key)) throw new TRPCError({ code: "BAD_REQUEST", message: "This expense is reverse charge." });
      if (input.gst?.mode === "transport" && tdsType !== "contract") throw new TRPCError({ code: "BAD_REQUEST", message: "Reverse charge here is for goods transport." });
      const tax = input.paidFor === "expense" ? await this.expenseTaxIn(tx, { tdsType, headKey: place.key, payee: paid, gst: input.gst, amount: input.amount, dateTime: input.dateTime, rentMonths: input.rentMonths }) : null;
      // interest on a loan we took: who gave it, told when it was registered, decides its TDS
      const interest =
        input.paidFor === "interestPaid"
          ? await this.interestTdsIn(tx, { ledgerId: to.id, partyId: party?.id ?? null, hasPan: !!(party?.pan || lender?.pan || input.pan), lenderType: loan!.due.lenderType, amount: input.amount, dateTime: input.dateTime })
          : null;
      const tds = supplierTds?.tds ?? tax?.tds?.tds ?? interest?.tds?.tds ?? 0;
      const tdsRate = supplierTds?.rate ?? tax?.tds?.rate ?? interest?.tds?.rate ?? 0;
      const toLedger = Math.round((input.amount + tds) * 100) / 100;
      const rcm = tax?.rcm ?? null;
      const bill = tax?.bill ?? null;
      // only the amount leaves cash or the bank (TDS and reverse-charge GST are owed to the government, paid later): never
      // more than cash or the bank account holds today; paid from both, each part fits what it holds and the whole fits both
      const now = await this.accounts.balances([src.cashLedger, src.bankLedger, ...src.more.map((b) => b.ledger)].filter((l) => l !== null));
      const cashHeld = src.cashLedger ? toPaise(held(now.get(src.cashLedger)?.today)) : 0;
      const bankHeld = src.bankLedger ? toPaise(held(now.get(src.bankLedger)?.today)) : 0;
      if (src.cashPart > cashHeld) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That's more than there is in cash." });
      if (src.bankPart > bankHeld) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That's more than there is in the bank account." });
      // each more account pays no more than it holds
      let moreHeld = 0;
      for (const b of src.more) {
        const has = toPaise(held(now.get(b.ledger)?.today));
        if (b.part > has) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That's more than there is in one of the bank accounts." });
        moreHeld += has;
      }
      if (toPaise(input.amount) > cashHeld + bankHeld + moreHeld) {
        const where = input.settledIn === "cash" ? "cash" : input.settledIn === "bank" ? "the bank account" : "cash and the bank account";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `That's more than there is in ${where}.` });
      }
      if ((rcm || bill) && (await this.transactions.filed(tx, "gstr3b", input.dateTime))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That month's GSTR-3B is filed; a payment with GST can't go into it." });
      }

      // what it posts: the party or head up by what was paid (and the TDS), or Interest paid for interest; cash or
      // bank (and TDS payable) down
      const lines: PostingLine[] = [
        { ledgerId: input.paidFor === "interestPaid" ? await this.accounts.ledgerId(tx, "interestPaid") : to.id, side: "debit", amount: Math.round((toLedger - (bill?.gst ?? 0) + (rcm?.gst ?? 0)) * 100) / 100 },
      ];
      if (src.cashLedger && src.cashPart > 0) lines.push({ ledgerId: src.cashLedger, side: "credit", amount: src.cashPart / 100 });
      if (src.bankLedger && src.bankPart > 0) lines.push({ ledgerId: src.bankLedger, side: "credit", amount: src.bankPart / 100 });
      for (const b of src.more) lines.push({ ledgerId: b.ledger, side: "credit", amount: b.part / 100 });
      if (tds > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "tdsPayable"), side: "credit", amount: tds });
      // a bill's GST goes to input credit, not the expense
      if (bill) {
        for (const [key, amount] of [["inputCgst", bill.cgst], ["inputSgst", bill.sgst], ["inputIgst", bill.igst]] as const) {
          if (amount > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, key), side: "debit", amount });
        }
      }
      // reverse charge: until it's paid the GST is part of the expense (on the line above), owed in its own payable
      // ledger, apart from output GST
      if (rcm) {
        for (const [i, s] of RCM_SPLITS.entries()) {
          const amount = [rcm.cgst, rcm.sgst, rcm.igst][i]!;
          if (amount > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, s.payable), side: "credit", amount });
        }
      }
      // paying it: never more than is owed, and what's paid moves out of the expense it sat in, oldest first, to input
      // credit
      if (input.paidFor === "taxPaid") {
        for (const s of RCM_SPLITS) {
          if (to.id !== (await this.accounts.ledgerId(tx, s.payable))) continue;
          const heads = await this.rcmWaitingIn(tx, s, to.id);
          if (toPaise(input.amount) > heads.reduce((sum, h) => sum + h.left, 0)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That's more reverse-charge GST than is owed." });
          lines.push({ ledgerId: await this.accounts.ledgerId(tx, s.input), side: "debit", amount: input.amount });
          let rest = toPaise(input.amount);
          for (const h of heads) {
            const take = Math.min(rest, h.left);
            if (take > 0) lines.push({ ledgerId: h.ledgerId, side: "credit", amount: take / 100 });
            rest -= take;
          }
        }
      }

      const t = await this.transactions.create(tx, { type: "payment", dateTime: input.dateTime, amount: input.amount, remarks: input.remarks, lines }, actor);

      // the party's (or an expense's payee's) default address and the bank account as they are now, kept with the
      // payment so its voucher reads the same on any later date
      const hasAddress = party ?? payee ?? landlord;
      const shown = hasAddress;
      const [[address], [bank], moreBanks] = await Promise.all([
        hasAddress
          ? tx
              .select()
              .from(partyAddressesTable)
              .where(and(eq(partyAddressesTable.partyId, hasAddress.id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)))
          : Promise.resolve([]),
        src.bankLedger && input.bankDetailsId
          ? tx
              .select({ bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
              .from(bankDetailsTable)
              .where(eq(bankDetailsTable.id, input.bankDetailsId))
          : Promise.resolve([]),
        src.more.length > 0
          ? tx
              .select({ id: bankDetailsTable.id, bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
              .from(bankDetailsTable)
              .where(inArray(bankDetailsTable.id, src.more.map((b) => b.bankDetailsId)))
          : Promise.resolve([]),
      ]);
      // reverse charge: the voucher is our self-invoice, so a copy is kept as a file
      if (rcm) await queueDocument(tx, t.id, "rcmSelfInvoice");
      const [row] = await tx.insert(paymentsTable).values({
        transactionId: t.id,
        paidToLedgerId: to.id,
        paidToNameSnapshot: (party ? (party.shortName ?? party.name) : to.name).slice(0, 150),
        partyCountryCodeSnapshot: shown?.phone ? shown.countryCode : null,
        partyPhoneSnapshot: shown?.phone ?? null,
        partyEmailSnapshot: shown?.email ?? null,
        partyNameSnapshot: shown ? shown.name.slice(0, 150) : null,
        partyShortNameSnapshot: shown?.shortName?.slice(0, 20) ?? null,
        partyAddressLine1Snapshot: address ? address.addressLine1.slice(0, 200) : null,
        partyAddressLine2Snapshot: address?.addressLine2?.slice(0, 200) ?? null,
        partyCitySnapshot: address ? address.city.slice(0, 100) : null,
        partyPostalCodeSnapshot: address ? address.postalCode.slice(0, 6) : null,
        partyStateSnapshot: address ? address.state.slice(0, 100) : null,
        partyStateCodeSnapshot: address?.stateCode ?? null,
        partyGstinSnapshot: (input.gst?.gstin ?? address?.gstin ?? landlord?.gstin)?.slice(0, 15) ?? null,
        payeePartyId: payee?.id ?? null,
        payeeLandlordId: landlord?.id ?? null,
        paidFor: PAID_FOR_DB[input.paidFor],
        settledIn: SETTLED_IN_DB[input.settledIn],
        referenceNumber: input.settledIn === "bank" ? null : input.cashReferenceNumber,
        amount: fromPaise(Math.round(input.amount * 100)),
        interestOnDueId: input.paidFor === "interestPaid" ? loan!.due.id : null,
        tdsApplicable: tds > 0,
        tdsRate: tds > 0 ? tdsRate.toFixed(2) : null,
        tdsAmount: tds > 0 ? fromPaise(Math.round(tds * 100)) : null,
        // reverse charge: our self-invoice is the payment itself (its number and day)
        ...(rcm
          ? {
              supplierGstinSnapshot: input.gst?.gstin ?? null,
              supplierInvoiceNumber: t.assignedId.slice(0, 16),
              supplierInvoiceDate: new Date(input.dateTime.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10),
              supplyType: rcm.igst > 0 ? ("inter" as const) : ("intra" as const),
              taxableAmount: fromPaise(Math.round(rcm.taxable * 100)),
              gstRate: rcm.rate,
              gstAmount: fromPaise(Math.round(rcm.gst * 100)),
              rcmApplicable: true,
            }
          : {}),
        // GST on the supplier's bill, as printed on it
        ...(bill && input.gst?.mode === "bill"
          ? {
              supplierGstinSnapshot: input.gst.gstin,
              supplierInvoiceNumber: input.gst.billNumber,
              supplierInvoiceDate: input.gst.billDate,
              supplyType: bill.igst > 0 ? ("inter" as const) : ("intra" as const),
              taxableAmount: fromPaise(Math.round(bill.taxable * 100)),
              gstRate: bill.rate,
              gstAmount: fromPaise(Math.round(bill.gst * 100)),
            }
          : {}),
      }).returning({ id: paymentsTable.id });

      // the bank's part: which account, how much, the UTR or cheque, and the account as it is now
      // each row a millisecond apart, so they read back in the order saved (the first account, then the others)
      const savedAt = Date.now();
      if (bank && input.bankDetailsId) {
        await tx.insert(transactionBankDetailsTable).values({
          createdAt: new Date(savedAt),
          transactionId: t.id,
          bankDetailsId: input.bankDetailsId,
          amount: fromPaise(src.bankPart),
          mode: BANK_MODE_DB[input.bankMode!],
          referenceNumber: input.referenceNumber,
          bankNameSnapshot: bank.bankName.slice(0, 100),
          bankAccountLast4Snapshot: bank.accountNumber.slice(-4),
          bankIfscSnapshot: bank.ifsc?.slice(0, 11) ?? null,
        });
      }
      // and each more account's part, in the order given
      for (const [i, b] of input.moreBankParts.entries()) {
        const acc = moreBanks.find((m) => m.id === b.bankDetailsId);
        if (!acc) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the bank account." });
        await tx.insert(transactionBankDetailsTable).values({
          createdAt: new Date(savedAt + i + 1),
          transactionId: t.id,
          bankDetailsId: b.bankDetailsId,
          amount: fromPaise(src.more[i]!.part),
          mode: BANK_MODE_DB[b.mode],
          referenceNumber: b.referenceNumber,
          bankNameSnapshot: acc.bankName.slice(0, 100),
          bankAccountLast4Snapshot: acc.accountNumber.slice(-4),
          bankIfscSnapshot: acc.ifsc?.slice(0, 11) ?? null,
        });
      }

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

  // a supplier's TDS under section 194Q for a payment: in a year turned on in Settings (last year's turnover above ₹10
  // crore), 0.1% (5% with no PAN) of the part of this year's payments to them above ₹50 lakh; null when it doesn't apply
  private async tdsIn(tx: Tx, p: { ledgerId: string | null; hasPan: boolean; amount: number; dateTime: Date }): Promise<SupplierTdsModel> {
    const year = financialYear(p.dateTime);
    if (!(await this.settings.get("tds194qYears", tx)).includes(year.name)) return null;
    // what they were paid this year before it, with the TDS taken then (cancelled payments left out)
    const [row] = p.ledgerId
      ? await tx
          .select({ total: sql<string>`coalesce(sum(${paymentsTable.amount} + coalesce(${paymentsTable.tdsAmount}, 0)), 0)` })
          .from(paymentsTable)
          .innerJoin(transactionsTable, eq(transactionsTable.id, paymentsTable.transactionId))
          .where(
            and(
              eq(paymentsTable.paidToLedgerId, p.ledgerId),
              eq(paymentsTable.paidFor, PAID_FOR_DB.supplier),
              eq(transactionsTable.status, "active"),
              gte(transactionsTable.dateTime, year.start),
              lte(transactionsTable.dateTime, p.dateTime),
            ),
          )
      : [{ total: "0" }];
    // and what they were paid that year outside this website, as typed on the party
    const [outside] = p.ledgerId
      ? await tx
          .select({ paid: partyPaidBeforeTable.paid })
          .from(partyPaidBeforeTable)
          .innerJoin(ledgersTable, and(eq(ledgersTable.referenceTable, "parties"), eq(ledgersTable.referenceId, partyPaidBeforeTable.partyId)))
          .where(and(eq(ledgersTable.id, p.ledgerId), eq(partyPaidBeforeTable.financialYear, year.name)))
      : [];
    const before = Number(row?.total ?? 0) + Number(outside?.paid ?? 0);
    const rate = p.hasPan ? 0.1 : 5;
    return { rate, before, ...tds194Q(p.amount, before, rate) };
  }

  // the reverse-charge GST of one tax still sitting in each expense head, in paise, oldest first: what its active
  // payments booked, less what active Tax paid payments of that tax have moved out of it
  private async rcmWaitingIn(tx: Tx, s: (typeof RCM_SPLITS)[number], payableId: string) {
    const share = s.part === "half" ? sql`${paymentsTable.gstAmount} / 2` : sql`${paymentsTable.gstAmount}`;
    const booked = await tx
      .select({ ledgerId: paymentsTable.paidToLedgerId, amount: sql<string>`sum(${share})`, first: sql<string>`min(${transactionsTable.dateTime})` })
      .from(paymentsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, paymentsTable.transactionId))
      .where(and(eq(paymentsTable.rcmApplicable, true), eq(paymentsTable.supplyType, s.supply), eq(transactionsTable.status, "active")))
      .groupBy(paymentsTable.paidToLedgerId)
      .orderBy(sql`min(${transactionsTable.dateTime})`);
    const moved = await tx
      .select({ ledgerId: ledgerEntriesTable.ledgerId, amount: sql<string>`sum(${ledgerEntriesTable.amount})` })
      .from(ledgerEntriesTable)
      .innerJoin(paymentsTable, eq(paymentsTable.transactionId, ledgerEntriesTable.transactionId))
      .innerJoin(transactionsTable, eq(transactionsTable.id, ledgerEntriesTable.transactionId))
      .where(and(eq(paymentsTable.paidToLedgerId, payableId), eq(ledgerEntriesTable.transactionType, "credit"), eq(ledgerEntriesTable.isReversal, false), eq(transactionsTable.status, "active")))
      .groupBy(ledgerEntriesTable.ledgerId);
    const out = new Map(moved.map((m) => [m.ledgerId, toPaise(Number(m.amount))]));
    return booked.map((b) => ({ ledgerId: b.ledgerId, left: toPaise(Number(b.amount)) - (out.get(b.ledgerId) ?? 0) })).filter((b) => b.left > 0);
  }

  // TDS on a loan's interest: only in a year after turnover above ₹1 crore, never to a bank; it adds up the interest paid
  // to this lender this year, here and as typed on the party
  private async interestTdsIn(
    tx: Tx,
    p: { ledgerId: string; partyId: string | null; hasPan: boolean; lenderType: "bank" | "nbfc" | "individual" | null; amount: number; dateTime: Date },
  ): Promise<InterestTdsModel> {
    if (!p.lenderType || p.lenderType === "bank" || !(await this.settings.taxAuditIn(tx, p.dateTime))) return { applies: false, panMissing: false, tds: null };
    const year = financialYear(p.dateTime);
    const [row] = await tx
      .select({ owed: sql<string>`coalesce(sum(${paymentsTable.amount} + coalesce(${paymentsTable.tdsAmount}, 0)), 0)`, tds: sql<string>`coalesce(sum(coalesce(${paymentsTable.tdsAmount}, 0)), 0)` })
      .from(paymentsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, paymentsTable.transactionId))
      .where(
        and(
          eq(paymentsTable.paidToLedgerId, p.ledgerId),
          eq(paymentsTable.paidFor, PAID_FOR_DB.interestPaid),
          eq(transactionsTable.status, "active"),
          gte(transactionsTable.dateTime, year.start),
          lte(transactionsTable.dateTime, p.dateTime),
        ),
      );
    const [outside] = p.partyId
      ? await tx
          .select({ paid: partyPaidBeforeTable.paid, tds: partyPaidBeforeTable.tds })
          .from(partyPaidBeforeTable)
          .where(and(eq(partyPaidBeforeTable.partyId, p.partyId), eq(partyPaidBeforeTable.financialYear, year.name)))
      : [];
    const before = { owed: Number(row?.owed ?? 0) + Number(outside?.paid ?? 0), tds: Number(row?.tds ?? 0) + Number(outside?.tds ?? 0) };
    const rate = p.hasPan ? 10 : 20;
    const worked = expenseTds("interest", p.amount, before, rate);
    return { applies: true, panMissing: !p.hasPan, tds: worked.tds > 0 ? { rate, tds: worked.tds, on: worked.on } : null };
  }

  // TDS on a loan's interest as the form fills in (the save works it out again)
  async interestTds(rawInput: InterestTdsInputModel): Promise<InterestTdsModel> {
    const input = interestTdsInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const loan = await this.dues.loanIn(tx, input.dueId, "loanTaken");
      const { party, lender } = await counterLedger(tx, this.accounts, loan.ledgerId);
      return this.interestTdsIn(tx, {
        ledgerId: loan.ledgerId,
        partyId: party?.id ?? null,
        hasPan: !!(party?.pan || lender?.pan || input.pan),
        lenderType: loan.due.lenderType,
        amount: input.amount,
        dateTime: input.dateTime,
      });
    });
  }

  // what an expense's tax needs to know about who was paid: their PAN, whether they have a GSTIN, a transporter's
  // declaration, and their id (to add up what they were paid before)
  private async payeeOf(tx: Tx, partyId: string) {
    const [p] = await tx.select({ pan: partiesTable.pan, transportDeclaration: partiesTable.transportDeclaration }).from(partiesTable).where(eq(partiesTable.id, partyId));
    const [gstin] = await tx
      .select({ gstin: partyAddressesTable.gstin })
      .from(partyAddressesTable)
      .where(and(eq(partyAddressesTable.partyId, partyId), eq(partyAddressesTable.isActive, true), isNotNull(partyAddressesTable.gstin)))
      .limit(1);
    return { id: partyId, pan: p?.pan ?? null, hasGstin: !!gstin, transportDeclaration: p?.transportDeclaration ?? false };
  }

  // a rent payment's landlord (a party of type landlord), who must be active; their GSTIN is on their address
  private async landlordOf(tx: Tx, id: string) {
    const [landlord] = await tx
      .select()
      .from(partiesTable)
      .where(and(eq(partiesTable.id, id), eq(partiesTable.type, "landlord")));
    if (!landlord?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the landlord." });
    const [address] = await tx
      .select({ gstin: partyAddressesTable.gstin })
      .from(partyAddressesTable)
      .where(and(eq(partyAddressesTable.partyId, id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)));
    return { ...landlord, gstin: address?.gstin ?? null };
  }

  // an expense's GST on top of its TDS: reverse charge on rent with no GSTIN or on goods transport, or the GST in a bill
  private gstOn(p: { tdsType: TdsType | null; service: "legal" | null; hasGstin: boolean; gst: ExpenseGstModel | null; amount: number }, tds: number, taxable: number, ourState: string) {
    const whole = Math.round((p.amount + tds) * 100) / 100;
    if (p.service) return { rcm: rcmOn(whole, RCM_SERVICE_RATE), bill: null };
    const otherState = !!p.gst?.gstin && p.gst.gstin.slice(0, 2) !== ourState;
    if (p.gst?.mode === "bill") return { rcm: null, bill: gstInBill(whole, taxable, p.gst.rate, otherState) };
    if (p.gst?.mode === "transport") return { rcm: rcmOn(whole, RCM_TRANSPORT_RATE, otherState), bill: null };
    return { rcm: p.tdsType === "rent" && !p.hasGstin ? rcmOn(whole, RCM_RENT_RATE) : null, bill: null };
  }

  private landlordPayee(l: { id: string; pan: string | null; gstin: string | null }) {
    return { id: l.id, pan: l.pan, hasGstin: !!l.gstin, transportDeclaration: false };
  }

  // an expense's TDS and GST. TDS only in a year our last year's turnover was above ₹1 crore; it adds up what this payee
  // was paid before under the same kind of head, this month for rent, this year otherwise
  private async expenseTaxIn(
    tx: Tx,
    p: { tdsType: TdsType | null; headKey: string | null; payee: { id: string | null; pan: string | null; hasGstin: boolean; transportDeclaration: boolean } | null; gst: ExpenseGstModel | null; rentMonths: number; amount: number; dateTime: Date },
  ): Promise<ExpenseTaxModel> {
    const billRate = p.gst?.mode === "bill" ? p.gst.rate : 0;
    const ourState = (await this.settings.get("company", tx)).stateCode;
    const service = p.payee ? rcmServiceOf(p.headKey) : null;
    const gstOf = (tds: number, taxable: number) => this.gstOn({ ...p, service, hasGstin: !!p.payee?.hasGstin }, tds, taxable, ourState);
    const noTds = Math.round((p.amount / (1 + billRate / 100)) * 100) / 100;
    const audit = await this.settings.taxAuditIn(tx, p.dateTime);
    // no head with TDS, or nobody picked yet: whether TDS can apply is known, what it comes to isn't, and reverse charge
    // on rent waits for the landlord
    if (!p.tdsType || !p.payee) {
      return { tdsType: p.tdsType, tds: null, declared: false, applies: !!p.tdsType && audit, panMissing: false, ...(p.gst ? gstOf(0, noTds) : { rcm: null, bill: null }) };
    }
    const tdsType = p.tdsType;
    const payee = p.payee;
    // the 10-trucks declaration is about carrying goods, so it doesn't touch labour
    const rate = expenseTdsRate(tdsType, payee.pan, payee.transportDeclaration && p.headKey !== "labour");
    const declared = rate === null;
    if (rate === null || !audit) return { tdsType, tds: null, declared, applies: false, panMissing: false, ...gstOf(0, noTds) };
    // the period: this month (India) for rent, this financial year otherwise
    const year = financialYear(p.dateTime);
    const day = new Date(p.dateTime.getTime() + 5.5 * 3_600_000);
    const monthStart = new Date(`${day.toISOString().slice(0, 7)}-01T00:00:00+05:30`);
    const from = tdsType === "rent" ? monthStart : year.start;
    const before = { owed: 0, tds: 0 };
    if (payee.id) {
      const rows = await tx
        .select({ ledgerId: paymentsTable.paidToLedgerId, owed: sql<string>`sum(${paymentsTable.amount} + coalesce(${paymentsTable.tdsAmount}, 0) - case when ${paymentsTable.rcmApplicable} then 0 else coalesce(${paymentsTable.gstAmount}, 0) end)`, tds: sql<string>`sum(coalesce(${paymentsTable.tdsAmount}, 0))` })
        .from(paymentsTable)
        .innerJoin(transactionsTable, eq(transactionsTable.id, paymentsTable.transactionId))
        .where(
          and(
            eq(tdsType === "rent" ? paymentsTable.payeeLandlordId : paymentsTable.payeePartyId, payee.id),
            eq(paymentsTable.paidFor, PAID_FOR_DB.expense),
            eq(transactionsTable.status, "active"),
            gte(transactionsTable.dateTime, from),
            lte(transactionsTable.dateTime, p.dateTime),
          ),
        )
        .groupBy(paymentsTable.paidToLedgerId);
      for (const r of rows) {
        if ((await this.accounts.placeIn(tx, r.ledgerId)).tdsType !== tdsType) continue;
        before.owed += Number(r.owed);
        before.tds += Number(r.tds);
      }
      // what a party was paid that year outside this website, as typed on it (rent's limit is monthly, and a landlord
      // isn't a party)
      if (tdsType !== "rent") {
        const [outside] = await tx
          .select({ paid: partyPaidBeforeTable.paid, tds: partyPaidBeforeTable.tds })
          .from(partyPaidBeforeTable)
          .where(and(eq(partyPaidBeforeTable.partyId, payee.id), eq(partyPaidBeforeTable.financialYear, year.name)));
        before.owed += Number(outside?.paid ?? 0);
        before.tds += Number(outside?.tds ?? 0);
      }
    }
    const worked = expenseTds(tdsType, p.amount, before, rate, billRate, tdsType === "rent" ? p.rentMonths : 1);
    return { tdsType, tds: worked.tds > 0 ? { rate, tds: worked.tds, on: worked.on } : null, declared, applies: true, panMissing: !payee.pan, ...gstOf(worked.tds, worked.taxable) };
  }

  // an expense's tax as the form fills in (the save works it out again): its head's TDS type, and who was paid
  async expenseTax(rawInput: ExpenseTaxInputModel): Promise<ExpenseTaxModel> {
    const input = expenseTaxInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const place = input.paidToLedgerId ? await this.accounts.placeIn(tx, input.paidToLedgerId) : null;
      const tdsType = place ? place.tdsType : input.newHeadTdsType;
      const party = tdsType && input.payeeLedgerId ? (await counterLedger(tx, this.accounts, input.payeeLedgerId)).party : null;
      const payee = !tdsType
        ? null
        : input.payeeLandlordId
        ? this.landlordPayee(await this.landlordOf(tx, input.payeeLandlordId))
        : party
        ? await this.payeeOf(tx, party.id)
        : input.newPayee
          ? { id: null, pan: input.newPayeePan || null, hasGstin: input.newPayeeHasGstin, transportDeclaration: input.newPayeeDeclared }
          : null;
      return this.expenseTaxIn(tx, { tdsType, headKey: place?.key ?? null, payee: payee && { ...payee, pan: payee.pan ?? input.pan }, gst: input.gst, amount: input.amount, dateTime: input.dateTime, rentMonths: input.rentMonths });
    });
  }

  // a supplier's TDS for a payment as it's being filled in (the save works it out again)
  async supplierTds(rawInput: SupplierTdsInputModel): Promise<SupplierTdsModel> {
    const input = supplierTdsInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const party = input.paidToLedgerId ? (await counterLedger(tx, this.accounts, input.paidToLedgerId)).party : null;
      const hasPan = input.paidToLedgerId ? !!(party?.pan || input.pan) : input.newPartyHasPan;
      return this.tdsIn(tx, { ledgerId: input.paidToLedgerId, hasPan, amount: input.amount, dateTime: input.dateTime });
    });
  }

  // what's been paid in cash that day (India time) to the same person, by active payments: a party whether paid as a
  // supplier or as an expense's payee, a landlord, or the ledger itself (a lender). Nothing known yet is ₹0
  async cashToday(rawInput: CashTodayInputModel): Promise<{ paid: number }> {
    const input = cashTodayInputModel.parse(rawInput);
    const start = new Date(`${input.day}T00:00:00+05:30`);
    const end = new Date(start.getTime() + 86_400_000);
    return db.transaction(async (tx) => {
      const ledgerId = input.payeeLedgerId ?? input.paidToLedgerId ?? (input.dueId ? (await this.dues.loanIn(tx, input.dueId, "loanTaken")).ledgerId : null);
      const party = ledgerId && !input.payeeLandlordId ? (await counterLedger(tx, this.accounts, ledgerId)).party : null;
      const partyLedger = party ? (await this.accounts.ledgerOf(tx, "parties", party.id)).id : null;
      const who = input.payeeLandlordId
        ? eq(paymentsTable.payeeLandlordId, input.payeeLandlordId)
        : party && partyLedger
          ? or(eq(paymentsTable.paidToLedgerId, partyLedger), eq(paymentsTable.payeePartyId, party.id))
          : ledgerId
            ? eq(paymentsTable.paidToLedgerId, ledgerId)
            : null;
      if (!who) return { paid: 0 };
      // each payment's cash part: the whole amount less what the bank paid
      const [row] = await tx
        .select({
          paid: sql<string>`coalesce(sum(${paymentsTable.amount} - coalesce((select sum(${transactionBankDetailsTable.amount}) from ${transactionBankDetailsTable} where ${transactionBankDetailsTable.transactionId} = ${paymentsTable.transactionId}), 0)), 0)`,
        })
        .from(paymentsTable)
        .innerJoin(transactionsTable, eq(transactionsTable.id, paymentsTable.transactionId))
        .where(and(who, ne(paymentsTable.settledIn, "bank"), eq(transactionsTable.status, "active"), gte(transactionsTable.dateTime, start), lt(transactionsTable.dateTime, end)));
      return { paid: Number(row?.paid ?? 0) };
    });
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
    const src = await db.transaction((tx) => moneyPartsIn(tx, this.accounts, input));
    const now = await this.accounts.balances([src.cashLedger, src.bankLedger, ...src.more.map((b) => b.ledger)].filter((l) => l !== null));
    const cashFits = !src.cashLedger || src.cashPart <= toPaise(held(now.get(src.cashLedger)?.today));
    const bankFits = !src.bankLedger || (src.bankPart > 0 && src.bankPart <= toPaise(held(now.get(src.bankLedger)?.today)));
    const moreFit = src.more.every((b) => b.part <= toPaise(held(now.get(b.ledger)?.today)));
    return { fits: cashFits && bankFits && moreFit };
  }

  // the ledgers a payment moved (cash or the bank, TDS payable, Interest paid, the party or head), each with its
  // balance now
  async balances(input: PaymentIdInputModel): Promise<LedgerSummaryModel[]> {
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

  private async tdsPanOf(tx: Tx, p: { payeeLandlordId: string | null; payeePartyId: string | null; paidToLedgerId: string }) {
    const payeeId = p.payeeLandlordId ?? p.payeePartyId;
    if (payeeId) return (await tx.select({ pan: partiesTable.pan }).from(partiesTable).where(eq(partiesTable.id, payeeId)))[0]?.pan ?? null;
    const { party, lender } = await counterLedger(tx, this.accounts, p.paidToLedgerId);
    return party?.pan ?? lender?.pan ?? null;
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
    // its bank rows in the order they were saved: the first account, then any more
    const [b, ...more] = await db
      .select()
      .from(transactionBankDetailsTable)
      .where(eq(transactionBankDetailsTable.transactionId, p.transactionId))
      .orderBy(asc(transactionBankDetailsTable.createdAt), asc(transactionBankDetailsTable.id));
    // what came from the bank accounts, and the rest from cash
    const bankAmount = [b, ...more].reduce((sum, x) => (x ? sum + toPaise(Number(x.amount)) : sum), 0) / 100;
    const [loan] = await db.select({ interestRate: duesTable.interestRate, frequency: duesTable.frequency }).from(duesTable).where(eq(duesTable.transactionId, p.transactionId));
    // a supplier's payment: what it settled of what we owed them, the rest an advance (only when there is one)
    const [settled] = await db.select({ amount: sql<string>`coalesce(sum(${dueSettlementsTable.amount}), 0)` }).from(dueSettlementsTable).where(eq(dueSettlementsTable.transactionId, p.transactionId));
    const duePart = Number(settled?.amount ?? 0);
    const advancePart = Math.round((Number(p.amount) + Number(p.tdsAmount ?? 0) - duePart) * 100) / 100;
    // the PAN of whoever the TDS was taken from: the landlord, the expense's payee, or the party paid
    const tdsPan = p.tdsAmount !== null ? await db.transaction((tx) => this.tdsPanOf(tx, p)) : null;
    // which service its reverse charge is on, from who was paid and the head
    const headKey = p.rcmApplicable ? (await db.transaction((tx) => this.accounts.placeIn(tx, p.paidToLedgerId))).key : null;
    const service = p.payeeLandlordId ? ("rent" as const) : headKey === "legalFees" ? ("legal" as const) : ("transport" as const);
    return {
      transactionId: p.transactionId,
      assignedId: t.assignedId,
      dateTime: t.dateTime,
      remarks: t.remarks,
      status: t.status,
      paidFor: KIND_OF[p.paidFor]!,
      createdByName: t.createdByName,
      bank: b ? { name: b.bankNameSnapshot, last4: b.bankAccountLast4Snapshot, ifsc: b.bankIfscSnapshot } : null,
      paidToLedgerId: p.paidToLedgerId,
      paidToName: p.paidToNameSnapshot,
      partyPhone: p.partyPhoneSnapshot,
      party: p.partyNameSnapshot
        ? {
            name: p.partyNameSnapshot,
            shortName: p.partyShortNameSnapshot,
            address: p.partyAddressLine1Snapshot !== null
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
      company: t.companySnapshot ?? (await this.settings.get("company")),
      settledIn: SETTLED_OF[p.settledIn]!,
      cashAmount: (toPaise(Number(p.amount)) - toPaise(bankAmount)) / 100,
      bankAmount,
      bankDetailsId: b?.bankDetailsId ?? null,
      bankMode: b ? MODE_OF[b.mode]! : null,
      referenceNumber: b?.referenceNumber ?? null,
      cashReferenceNumber: p.referenceNumber,
      moreBankParts: more.map((x) => ({
        bankDetailsId: x.bankDetailsId,
        name: x.bankNameSnapshot,
        last4: x.bankAccountLast4Snapshot,
        ifsc: x.bankIfscSnapshot,
        amount: Number(x.amount),
        mode: MODE_OF[x.mode]!,
        referenceNumber: x.referenceNumber,
      })),
      amount: Number(p.amount),
      tdsRate: p.tdsRate === null ? null : Number(p.tdsRate),
      tdsAmount: p.tdsAmount === null ? null : Number(p.tdsAmount),
      split: KIND_OF[p.paidFor] === "supplier" && advancePart > 0 ? { due: duePart, advance: advancePart } : null,
      tdsPan,
      rcm: p.rcmApplicable
        ? {
            service,
            sac: RCM_SAC[service],
            taxable: Number(p.taxableAmount),
            rate: p.gstRate ?? 0,
            gst: Number(p.gstAmount),
            otherState: p.supplyType === "inter",
            supplierGstin: p.supplierGstinSnapshot,
          }
        : null,
      bill:
        !p.rcmApplicable && p.gstAmount !== null
          ? { number: p.supplierInvoiceNumber ?? "", gstin: p.supplierGstinSnapshot ?? "", taxable: Number(p.taxableAmount), rate: p.gstRate ?? 0, gst: Number(p.gstAmount) }
          : null,
    };
  }
}
