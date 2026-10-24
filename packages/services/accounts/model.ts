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

// a ledger the admin adds under a head, with what it stood at on a date
export const createLedgerInputModel = z.object({
  head: customHeadModel,
  name: z.string().trim().min(1).max(150),
  openingBalance: openingBalanceModel.nullable().default(null),
});

export type CreateLedgerInputModel = z.infer<typeof createLedgerInputModel>;

// a ledger's opening balance (any ledger of its own: Cash, Drawings, a loan ...), and a new name for one the
// admin added
export const updateLedgerInputModel = z.object({
  id: idModel,
  name: z.string().trim().min(1).max(150).optional(),
  openingBalance: openingBalanceModel.nullable().default(null),
});

export type UpdateLedgerInputModel = z.infer<typeof updateLedgerInputModel>;

export const setLedgerActiveInputModel = z.object({ id: idModel, isActive: z.boolean() });

export type SetLedgerActiveInputModel = z.infer<typeof setLedgerActiveInputModel>;

// who is saving
export type ActorModel = { id: string; name: string };
