import { z } from "zod";

import { balanceModel, sideModel, transactionTypeModel } from "../accounts/model";

const idModel = z.string().uuid();

export type TransactionType = z.infer<typeof transactionTypeModel>;

// the transaction's own remarks; 100 characters, like transactions.remarks
export const remarksModel = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

// /history: every transaction, newest first, narrowed by types, status, a date range, an amount range and a search over
// the number and remarks; a page at a time (`before` is the last one shown)
export const listTransactionsInputModel = z.object({
  types: z.array(transactionTypeModel).max(13).default([]),
  status: z.enum(["active", "cancelled"]).nullable().default(null),
  from: z.coerce.date().nullable().default(null),
  to: z.coerce.date().nullable().default(null),
  minAmount: z.number().nonnegative().max(9_999_999_999_999).nullable().default(null),
  maxAmount: z.number().nonnegative().max(9_999_999_999_999).nullable().default(null),
  search: z.string().trim().max(50).default(""),
  // the next page: rows older than the last one shown (its date and id); flat, so it fits a GET query
  beforeDateTime: z.coerce.date().nullable().default(null),
  beforeId: idModel.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(50),
});

export type ListTransactionsInputModel = z.infer<typeof listTransactionsInputModel>;

// a row in /history: when, what, how much, and whether it was cancelled
export const transactionSummaryModel = z.object({
  id: idModel,
  type: transactionTypeModel,
  assignedId: z.string(),
  dateTime: z.date(),
  amount: z.number(),
  remarks: z.string().nullable(),
  status: z.enum(["active", "cancelled"]),
  createdByName: z.string(),
  createdAt: z.date(),
});

export type TransactionSummaryModel = z.infer<typeof transactionSummaryModel>;

export const transactionIdInputModel = z.object({ id: idModel });

export type TransactionIdInputModel = z.infer<typeof transactionIdInputModel>;

// one transaction in full: what /history/[id] shows for every type (the lines it posted, and the cancel), the details
// each type adds come with that type
export const transactionModel = transactionSummaryModel.extend({
  cancelledAt: z.date().nullable(),
  cancelledByName: z.string().nullable(),
  cancelReason: z.string().nullable(),
  // every debit and credit it posted, reversals included, with the ledger's name
  lines: z.array(
    z.object({
      ledgerId: idModel,
      ledgerName: z.string(),
      ledgerKey: z.string().nullable(),
      side: sideModel,
      amount: z.number(),
      isReversal: z.boolean(),
      dateTime: z.date(),
    }),
  ),
  // why it can't be cancelled, if it can't (already cancelled, a filed GST month ...)
  cancelBlockedBy: z.enum(["cancelled", "gstFiled", "openingBalance"]).nullable(),
});

export type TransactionModel = z.infer<typeof transactionModel>;

// cancelling: a reason is required (200 characters, like transactions.cancel_reason)
export const cancelTransactionInputModel = z.object({
  id: idModel,
  reason: z.string().trim().min(1).max(200),
});

export type CancelTransactionInputModel = z.infer<typeof cancelTransactionInputModel>;

export { balanceModel };
