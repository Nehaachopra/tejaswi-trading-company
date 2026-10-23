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

export const statementInputModel = z.object({
  ledgerId: idModel,
  from: z.coerce.date().nullable().default(null),
  to: z.coerce.date().nullable().default(null),
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
});

export type StatementModel = z.infer<typeof statementModel>;

// who is saving
export type ActorModel = { id: string; name: string };
