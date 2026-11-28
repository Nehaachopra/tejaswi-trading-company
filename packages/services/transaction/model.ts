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
  // a sale or purchase with goods back on it: Returned, or (a purchase) Pending while replaced packs are still to
  // come; none: null
  returned: z.enum(["returned", "pending"]).nullable(),
  // a sale or purchase: Cash or Credit, as saved; other types: null
  transactedIn: z.enum(["cash", "credit"]).nullable(),
  // a salary paid (not an advance): History tags its Payment row Salary
  salaryPaid: z.boolean(),
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
      // a purchase return with replaced items: packs sent to be replaced, and how many have come back (none: null)
      replaced: z.object({ sent: z.number().int(), back: z.number().int() }).nullable(),
    }),
  ),
  // a return's replacements: a purchase return's, each purchase the replaced packs came back on; a sale return's, the
  // sale it made for the items it replaced. A purchase return's (its ID, bill day, total, status),
  // oldest first, and how many packs are still to come (0: none)
  replacements: z.array(z.object({ transactionId: idModel, assignedId: z.string(), date: z.string(), total: z.number(), status: z.enum(["active", "cancelled"]) })),
  replacementsOwed: z.number().int(),
  // a purchase return's packs sent to be replaced (0: none)
  replacementsSent: z.number().int(),
  // a sale or purchase: what share of its packs went back on returns still in place (replaced ones too), 0 to 100;
  // other types: null
  returnedShare: z.number().nullable(),
  // a sale or purchase: how many of each product went back on returns still in place (none back: left out); others: []
  // a sale or purchase whose every pack came back (refunded or replaced): not edited any more
  allReturned: z.boolean(),
  returnedLines: z.array(z.object({ productId: idModel, quantity: z.number().int() })),
  // a sale or purchase made as a return's replacement: that return (back goes to it); none: null
  replacementFor: z.object({ transactionId: idModel, assignedId: z.string() }).nullable(),
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
