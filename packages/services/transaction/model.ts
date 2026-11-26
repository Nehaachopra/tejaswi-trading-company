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
  // the next page: rows older than the last one shown, as "<its date, ISO>|<its id>"; one value, so it fits a GET query
  // and a paged list
  cursor: z
    .string()
    .max(80)
    .regex(/^[^|]+\|[0-9a-f-]{36}$/)
    .nullable()
    .default(null),
  limit: z.number().int().min(1).max(100).default(50),
});

export type ListTransactionsInputModel = z.infer<typeof listTransactionsInputModel>;

// a row in /history: when, what, how much, whether it was cancelled, and its last edit
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
  // the last edit, when it was edited (none: never)
  lastEditedAt: z.date().nullable(),
  lastEditedByName: z.string().nullable(),
  // a sale: whether goods came back on it (all of it, some of it; none: null)
  returned: z.enum(["all", "part"]).nullable(),
});

export type TransactionSummaryModel = z.infer<typeof transactionSummaryModel>;

// the months /history can be narrowed to: each month (in India) holding a transaction the viewer can see, newest first
export const historyMonthModel = z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) });

export type HistoryMonthModel = z.infer<typeof historyMonthModel>;

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
  // a sale's returns, oldest first: each one's ID, day, how many items, total, how it was settled, and whether cancelled
  returns: z.array(
    z.object({
      transactionId: idModel,
      assignedId: z.string(),
      returnDate: z.string(),
      items: z.number().int(),
      total: z.number(),
      settledIn: z.enum(["cash", "credit", "both", "exchange"]),
      status: z.enum(["active", "cancelled"]),
      // the sale it made for the items it replaced (none: nothing replaced)
      replacement: z.object({ transactionId: idModel, assignedId: z.string(), dateTime: z.date(), total: z.number() }).nullable(),
    }),
  ),
  // a purchase's replaced items, by the return they went back on: each pack size, how many were replaced, and each
  // delivery they came back on (its purchase, its bill day, how many)
  replacements: z.array(
    z.object({
      returnTransactionId: idModel,
      assignedId: z.string(),
      returnDate: z.string(),
      items: z.array(
        z.object({
          productId: idModel,
          name: z.string(),
          replaced: z.number().int(),
          deliveries: z.array(z.object({ transactionId: idModel, assignedId: z.string(), date: z.string(), quantity: z.number().int() })),
        }),
      ),
    }),
  ),
  // its edits, newest first: when, by whom, and each field changed from what to what
  edits: z.array(
    z.object({
      at: z.date(),
      byName: z.string(),
      changes: z.array(z.object({ field: z.string(), old: z.unknown(), new: z.unknown() })),
    }),
  ),
  // why it can't be cancelled, if it can't (already cancelled, a filed GST month, reverse-charge GST already paid ...)
  cancelBlockedBy: z.enum(["cancelled", "gstFiled", "openingBalance", "rcmPaid", "salePaid", "purchasePaid", "saleReturned", "exchangeSale", "purchaseReturned", "replacementPurchase"]).nullable(),
});

export type TransactionModel = z.infer<typeof transactionModel>;

// cancelling: a reason is required (200 characters, like transactions.cancel_reason)
export const cancelTransactionInputModel = z.object({
  id: idModel,
  reason: z.string().trim().min(1).max(200),
});

export type CancelTransactionInputModel = z.infer<typeof cancelTransactionInputModel>;

export { balanceModel };
