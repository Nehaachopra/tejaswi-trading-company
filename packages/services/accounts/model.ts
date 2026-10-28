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

export const customHeadModel = z.enum(["asset", "liability", "income", "expense"]);

// names are stored in lowercase; screens start each word with a capital
export const ledgerNameModel = z.string().trim().toLowerCase().min(1).max(150);

// a ledger the admin adds under a head; its opening balance is set on the Opening balances page
export const createLedgerInputModel = z.object({
  head: customHeadModel,
  name: ledgerNameModel,
});

export type CreateLedgerInputModel = z.infer<typeof createLedgerInputModel>;

// a new name for a ledger the admin added
export const updateLedgerInputModel = z.object({
  id: idModel,
  name: ledgerNameModel,
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
// own ledger), the owner putting money in (Capital), a refund (an asset or expense of our own: TDS receivable, a
// deposit), or other income (scrap sale, insurance claim, interest). A receipt keeps which it was
export const receiptKindModel = z.enum(["customer", "loanTaken", "loanReturned", "capital", "refund", "otherIncome"]);

export type ReceiptKind = z.infer<typeof receiptKindModel>;

// built-in ledgers that only their own screens post to (a sale, a purchase, their returns, salary), never a receipt
export const OWN_SCREEN_LEDGERS = ["sale", "purchase", "saleReturn", "purchaseReturn", "salary"];

// the kinds that come from a party (its own ledger, whatever its type)
export const PARTY_RECEIPT_KINDS: ReceiptKind[] = ["customer", "loanTaken", "loanReturned"];

// whether a ledger can take money in for a kind: a party's ledger for a payment or a loan; Capital for capital; any
// income head of our own for other income; any asset or expense head of our own (not cash) for a refund
export function fitsReceiptKind(kind: ReceiptKind, l: { head: string; masterKey: string | null; key: string | null; referenceId: string | null }) {
  const party = l.masterKey === "debtors" || l.masterKey === "creditors" || l.masterKey === "debtorCreditors" || l.masterKey === "parties";
  if (PARTY_RECEIPT_KINDS.includes(kind)) return party;
  if (l.masterKey !== null || l.referenceId !== null || (l.key !== null && OWN_SCREEN_LEDGERS.includes(l.key))) return false;
  if (kind === "capital") return l.key === "capital";
  if (kind === "otherIncome") return l.head === "income";
  return (l.head === "asset" || l.head === "expense") && l.key !== "cash";
}

// what a receipt can come from or a payment go to: the ones used last, or those matching what's typed (a party's
// name, short name or phone); a receipt narrowed to one kind
export const pickLedgersInputModel = z.object({
  purpose: z.enum(["receipt", "payment"]),
  receiptKind: receiptKindModel.nullable().default(null),
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
  type: z.enum(["customer", "supplier", "both"]).nullable(),
});

export type PickedPartyModel = z.infer<typeof pickedPartyModel>;

// a ledger to pick: its party when it has one; its balance only for the admin (staff never see balances)
export const pickedLedgerModel = ledgerSummaryModel.extend({ balance: ledgerBalanceModel.nullable(), party: pickedPartyModel.nullable() });

export type PickedLedgerModel = z.infer<typeof pickedLedgerModel>;

// who is saving
export type ActorModel = { id: string; name: string };
