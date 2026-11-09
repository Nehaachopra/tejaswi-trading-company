import { z } from "zod";

const idModel = z.string().uuid();

export const sideModel = z.enum(["debit", "credit"]);

export type Side = z.infer<typeof sideModel>;

// rupees and paise; numeric(15,2) holds up to 13 digits before the point
export const amountModel = z.number().positive().max(9_999_999_999_999).multipleOf(0.01);

// one debit or credit line of a transaction
export const postingLineModel = z.object({ ledgerId: idModel, side: sideModel, amount: amountModel });

export type PostingLine = z.infer<typeof postingLineModel>;

// everything a transaction posts, all on its date
export type Posting = { transactionId: string; dateTime: Date; lines: PostingLine[]; isContra?: boolean };

export type Reversal = { transactionId: string; dateTime: Date };

// an opening balance: what the ledger stood at on a date, and which side (debit: it owes us or we hold it)
export const openingBalanceModel = z.object({
  amount: amountModel,
  side: sideModel,
  date: z.coerce.date(),
});

export type OpeningBalanceModel = z.infer<typeof openingBalanceModel>;

// an amount and its side, as lists and details show a balance
export const balanceModel = z.object({ amount: z.number(), side: sideModel });

export type BalanceModel = z.infer<typeof balanceModel>;

// a ledger's balance as of today, and what post-dated entries will add (null when there are none)
export const ledgerBalanceModel = z.object({ today: balanceModel, postDated: balanceModel.nullable() });

export type LedgerBalanceModel = z.infer<typeof ledgerBalanceModel>;

// the opening balance as saved, with its OB number
export const savedOpeningBalanceModel = openingBalanceModel.extend({ assignedId: z.string() });

export type SavedOpeningBalanceModel = z.infer<typeof savedOpeningBalanceModel>;

export const transactionTypeModel = z.enum(["sale", "purchase", "sale_return", "purchase_return", "payment", "receipt", "drawing", "deposit", "withdrawal", "transfer", "salary", "other", "opening_balance"]);

// a statement for a date range (all of it when none is given), narrowed down if asked: some transaction types,
// an amount range, and a search over the transaction's number and remarks
export const statementInputModel = z.object({
  ledgerId: idModel,
  from: z.coerce.date().nullable().default(null),
  to: z.coerce.date().nullable().default(null),
  types: z.array(transactionTypeModel).max(13).default([]),
  minAmount: z.number().nonnegative().max(9_999_999_999_999).nullable().default(null),
  maxAmount: z.number().nonnegative().max(9_999_999_999_999).nullable().default(null),
  search: z.string().trim().max(50).default(""),
});

export type StatementInputModel = z.infer<typeof statementInputModel>;

// one line of a ledger statement, with the balance after it
export const statementLineModel = z.object({
  id: idModel,
  transactionId: idModel,
  type: z.string(),
  assignedId: z.string(),
  remarks: z.string().nullable(),
  dateTime: z.date(),
  side: sideModel,
  amount: z.number(),
  isReversal: z.boolean(),
  // the other side of this line in its transaction: each ledger and how much, largest first
  // the other side: each ledger, a party's full name (null for any other ledger) and how much
  contras: z.array(z.object({ key: z.string().nullable(), name: z.string(), partyName: z.string().nullable(), amount: z.number() })),
  balance: balanceModel,
});

// a ledger's statement in date order (same date: in the order saved): the balance brought forward from
// before the range, each line with the balance after it, and the balance at the end of the range
export const statementModel = z.object({
  ledgerId: idModel,
  name: z.string(),
  broughtForward: balanceModel,
  lines: z.array(statementLineModel),
  closing: balanceModel,
  // when types, amounts or a search hide some lines: only the lines that match are returned, each still with
  // the true balance after it, and these are their totals
  narrowed: z.object({ debit: z.number(), credit: z.number() }).nullable(),
});

export type StatementModel = z.infer<typeof statementModel>;

export const ledgerIdInputModel = z.object({ id: idModel });

export type LedgerIdInputModel = z.infer<typeof ledgerIdInputModel>;

export const headModel = z.enum(["asset", "liability", "income", "expense", "profit", "loss"]);

// one ledger with where it sits and its balance as of today
// the TDS an expense head's payments carry: rent (194I), contract work like transport, labour and loading (194C),
// brokerage or commission (194H)
export const tdsTypeModel = z.enum(["rent", "contract", "brokerage"]);

// the TDS a head carries: one of those, or professional fees, which only built-in heads have
export const headTdsModel = z.enum(["rent", "contract", "brokerage", "professional"]);

export type TdsType = z.infer<typeof headTdsModel>;

export const ledgerSummaryModel = z.object({
  id: idModel,
  name: z.string(),
  head: headModel,
  // the sub-group it belongs to (Bank, Debtors ...), if any
  masterKey: z.string().nullable(),
  // a built-in ledger's key (cash, sale ...), so screens can show its name in the reader's language;
  // null for ledgers people name themselves
  key: z.string().nullable(),
  // a ledger the admin added (a loan, other income ...): it can be renamed and made inactive
  custom: z.boolean(),
  // the bank account, party or employee it belongs to, if any
  referenceId: idModel.nullable(),
  isActive: z.boolean(),
  // an expense head's TDS (the built-in Rent is rent), null for none
  tdsType: headTdsModel.nullable(),
  balance: ledgerBalanceModel,
});

export type LedgerSummaryModel = z.infer<typeof ledgerSummaryModel>;

// one ledger on its own page: also its opening balance, and whether anything else has been posted (then that is fixed)
export const ledgerModel = ledgerSummaryModel.extend({
  openingBalance: savedOpeningBalanceModel.nullable(),
  hasEntries: z.boolean(),
});

export type LedgerModel = z.infer<typeof ledgerModel>;

// /account: the six heads. Asset, Liability, Income and Expense hold sub-groups (with the total of their
// ledgers) and the ledgers that sit directly under them; Profit and Loss are worked out from income and
// expense, so only one of them has an amount
export const overviewModel = z.object({
  heads: z.array(
    z.object({
      head: headModel,
      total: balanceModel,
      masters: z.array(z.object({ key: z.string(), name: z.string(), total: balanceModel, ledgers: z.number().int() })),
      ledgers: z.array(ledgerSummaryModel),
    }),
  ),
});

export type OverviewModel = z.infer<typeof overviewModel>;

// the sub-groups with no list of their own elsewhere in /account (bank accounts and parties have theirs): bank loans,
// rent payable to landlords, employees
export const GROUP_PAGES = ["lenders", "personalLenders", "agents", "rentPayable", "employees", "gstPayable"] as const;

// the GST owed, gathered on /account as one group under Liability (they stay built-in ledgers under the head itself):
// output GST, then reverse-charge GST
export const GST_PAYABLE_KEYS = ["outputCgst", "outputSgst", "outputIgst", "rcmCgstPayable", "rcmSgstPayable", "rcmIgstPayable"];

export const groupLedgersInputModel = z.object({ master: z.enum(GROUP_PAGES) });

export type GroupLedgersInputModel = z.infer<typeof groupLedgersInputModel>;

// a ledger in such a sub-group: its summary and, for a party (a landlord), its full name
export const groupLedgerModel = ledgerSummaryModel.extend({ fullName: z.string().nullable() });

export type GroupLedgerModel = z.infer<typeof groupLedgerModel>;

// the heads a ledger the admin adds can sit under: all six (a profit or loss ledger counts in the worked-out result)
export const customHeadModel = z.enum(["asset", "liability", "income", "expense", "profit", "loss"]);

// names are stored in lowercase; screens start each word with a capital
export const ledgerNameModel = z.string().trim().toLowerCase().min(1).max(150);

// a ledger the admin adds under a head; its opening balance is set on the Opening balances page
export const createLedgerInputModel = z
  .object({
    head: customHeadModel,
    name: ledgerNameModel,
    tdsType: tdsTypeModel.nullable().default(null),
  })
  .refine((l) => l.tdsType === null || l.head === "expense", { message: "Only an expense head carries TDS.", path: ["tdsType"] });

export type CreateLedgerInputModel = z.input<typeof createLedgerInputModel>;

// a new name for a ledger the admin added; an expense head (built-in ones too) can change its TDS
export const updateLedgerInputModel = z.object({
  id: idModel,
  name: ledgerNameModel,
  tdsType: tdsTypeModel.nullable().optional(),
});

export type UpdateLedgerInputModel = z.infer<typeof updateLedgerInputModel>;

export const setLedgerActiveInputModel = z.object({ id: idModel, isActive: z.boolean() });

export type SetLedgerActiveInputModel = z.infer<typeof setLedgerActiveInputModel>;

// one row of the Opening balances page: a ledger that can have an opening balance (every one but Capital), where it
// sits, and its opening balance; locked once anything else has been posted to it
export const openingRowModel = z.object({
  ledgerId: idModel,
  name: z.string(),
  key: z.string().nullable(),
  head: customHeadModel,
  masterKey: z.string().nullable(),
  isActive: z.boolean(),
  opening: balanceModel.nullable(),
  locked: z.boolean(),
});

// the date the books start on (the opening balances' date, once any are saved) and every row
export const openingSheetModel = z.object({
  date: z.date().nullable(),
  rows: z.array(openingRowModel),
});

export type OpeningSheetModel = z.infer<typeof openingSheetModel>;

// every opening balance at once, all on the date the books start; a ledger left out or locked keeps what it has
export const saveOpeningInputModel = z.object({
  date: z.coerce.date(),
  lines: z
    .array(z.object({ ledgerId: idModel, opening: z.object({ amount: amountModel, side: sideModel }).nullable() }))
    .max(5000),
});

export type SaveOpeningInputModel = z.infer<typeof saveOpeningInputModel>;

// the ledgers a receipt can come from or a payment go to: every active one but cash and the bank accounts (a payment
// also leaves out employees and Drawings, which have their own pages)
// what money comes in for: a customer's payment, a loan received or a loan repaid to us (all three credit the party's
// own ledger), the owner putting money in (Capital), a refund (an asset or expense of our own: TDS, a
// deposit), or other income (scrap sale, insurance claim, interest). A receipt keeps which it was
export const receiptKindModel = z.enum(["customer", "loanTaken", "loanReturned", "interestReceived", "capital", "refund", "otherIncome"]);

export type ReceiptKind = z.infer<typeof receiptKindModel>;

// built-in ledgers that only their own screens post to (a sale, a purchase, their returns, salary, a bad debt written
// off on Dues, a discount given with a sale or receipt), never a receipt or payment: no money moves for them by itself
// the sub-groups a party's ledger can sit in (a landlord's Rent payable aside, which its own pages use)
export const PARTY_MASTERS = ["debtors", "creditors", "debtorCreditors", "parties", "personalLenders", "agents", "employees"];

export const OWN_SCREEN_LEDGERS = ["sale", "purchase", "saleReturn", "purchaseReturn", "salary", "badDebts", "discountGiven", "interestPaid"];

// whether a journal entry (Others) can use a ledger: one of our own heads only. Never cash or a bank account (their
// own pages move money), never a party, lender, landlord or employee (their dues would go out of step), never one only
// its own page posts to, nor Drawings (its own page)
export function fitsJournal(l: { masterKey: string | null; key: string | null; referenceId: string | null }) {
  if (l.masterKey !== null || l.referenceId !== null) return false;
  return l.key === null || !(OWN_SCREEN_LEDGERS.includes(l.key) || l.key === "cash" || l.key === "drawings");
}

// the kinds that come from a party (its own ledger, whatever its type); a loan returned and its interest come from the
// party of the loan picked
export const PARTY_RECEIPT_KINDS: ReceiptKind[] = ["customer", "loanTaken", "loanReturned", "interestReceived"];

// the kinds that name a loan instead of a ledger: the loan given back, or the interest on it
export const LOAN_RECEIPT_KINDS: ReceiptKind[] = ["loanReturned", "interestReceived"];

// whether a ledger can take money in for a kind: a party's ledger for a payment or a loan; Capital for capital; any
// income head of our own for other income; any asset or expense head of our own (not cash) for a refund
export function fitsReceiptKind(kind: ReceiptKind, l: { head: string; masterKey: string | null; key: string | null; referenceId: string | null }) {
  const party = PARTY_MASTERS.includes(l.masterKey ?? "");
  // a loan received can come from a bank or NBFC
  if (kind === "loanTaken" && l.masterKey === "lenders") return true;
  // money from someone buying from us: a customer or a both, never only a supplier
  if (kind === "customer") return l.masterKey === "debtors" || l.masterKey === "debtorCreditors";
  if (PARTY_RECEIPT_KINDS.includes(kind)) return party;
  if (l.masterKey !== null || l.referenceId !== null || (l.key !== null && OWN_SCREEN_LEDGERS.includes(l.key))) return false;
  if (kind === "capital") return l.key === "capital";
  if (kind === "otherIncome") return l.head === "income";
  return (l.head === "asset" || l.head === "expense") && l.key !== "cash";
}

// what a payment can be for: a supplier, a loan we repay, the interest on one, a loan we give, an expense, a tax, a
// customer refunded
export const paymentKindModel = z.enum(["supplier", "loanRepaid", "interestPaid", "loanGiven", "expense", "taxPaid", "refund"]);

export type PaymentKind = z.infer<typeof paymentKindModel>;

// the payment kinds that go to a party's ledger
export const PARTY_PAYMENT_KINDS: PaymentKind[] = ["supplier", "loanRepaid", "interestPaid", "loanGiven", "refund"];

// the kinds that name a loan instead of a ledger: the loan we repay, or the interest on it
export const LOAN_PAYMENT_KINDS: PaymentKind[] = ["loanRepaid", "interestPaid"];

// the built-in ledgers a tax is paid into: TDS we deducted, TCS, output GST and reverse-charge GST
export const TAX_LEDGERS = ["tdsPayable", "tcs", "outputCgst", "outputSgst", "outputIgst", "rcmCgstPayable", "rcmSgstPayable", "rcmIgstPayable"];

// whether a ledger can take money paid out for a kind: a party's ledger for a supplier, a loan or a refund; a tax
// ledger for a tax; any expense head of our own (not salary, purchase or a sale return) for an expense
export function fitsPaymentKind(kind: PaymentKind, l: { head: string; masterKey: string | null; key: string | null; referenceId: string | null }) {
  const party = PARTY_MASTERS.includes(l.masterKey ?? "");
  // a loan from a bank or NBFC, and its interest, go to that lender
  if (LOAN_PAYMENT_KINDS.includes(kind) && l.masterKey === "lenders") return true;
  // money to someone we buy from: a supplier or a both, never only a customer
  if (kind === "supplier") return l.masterKey === "creditors" || l.masterKey === "debtorCreditors";
  if (PARTY_PAYMENT_KINDS.includes(kind)) return party;
  if (kind === "taxPaid") return l.key !== null && TAX_LEDGERS.includes(l.key);
  if (l.masterKey !== null || l.referenceId !== null || (l.key !== null && OWN_SCREEN_LEDGERS.includes(l.key))) return false;
  return l.head === "expense";
}

// what a receipt can come from or a payment go to: the ones used last, or those matching what's typed (a party's
// name, short name or phone); a receipt narrowed to one kind
export const pickLedgersInputModel = z.object({
  purpose: z.enum(["receipt", "payment"]),
  receiptKind: receiptKindModel.nullable().default(null),
  paymentKind: paymentKindModel.nullable().default(null),
  // who an expense was paid to, not customers or suppliers: for rent the landlords, otherwise (a transporter, a broker)
  // parties with no sale or purchase
  // (or "employee": the salary form's search, the ledgers in Employees)
  payee: z.enum(["other", "employee"]).nullable().default(null),
  search: z.string().trim().max(60).default(""),
});

export type PickLedgersInputModel = z.infer<typeof pickLedgersInputModel>;

// the party behind a ledger, so a pick shows who it is: full and short name, phone, town (its default address) and
// type (null until its first sale or purchase)
export const pickedPartyModel = z.object({
  name: z.string(),
  shortName: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  // what it is to us (any of customer, supplier, landlord, lender, agent)
  types: z.array(z.enum(["customer", "supplier", "employee", "landlord", "lender", "agent"])),
  // what they're paid on, for a payment's UPI QR
  upiIds: z.array(z.string()),
});

export type PickedPartyModel = z.infer<typeof pickedPartyModel>;

// a ledger to pick: its party when it has one; its balance only for the admin (staff never see balances)
export const pickedLedgerModel = ledgerSummaryModel.extend({ balance: ledgerBalanceModel.nullable(), party: pickedPartyModel.nullable() });

export type PickedLedgerModel = z.infer<typeof pickedLedgerModel>;

// who is saving
export type ActorModel = { id: string; name: string };
