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

// who is saving
export type ActorModel = { id: string; name: string };
