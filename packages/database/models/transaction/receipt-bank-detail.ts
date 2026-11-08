// receipt-bank-detail.ts

import { sql } from "drizzle-orm";
import { check, index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { bankModeEnum } from "../../utils/common/enum";
import { bankDetailsTable } from "../bank-detail";
import { receiptsTable } from "./receipt";

// the bank's part of a receipt that came into a bank, or into cash and a bank together: which account, how much came
// in, how (UPI, IMPS, NEFT or RTGS, a cheque) with its UTR or cheque number, and the account as it was when received
// (so the voucher can be drawn again unchanged). A cash receipt has no row; one split over accounts has a row per
// account, each account once
export const receiptBankDetailsTable = pgTable(
  "receipt_bank_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receiptsTable.id, { onDelete: "restrict" }),

    bankDetailsId: uuid("bank_details_id")
      .notNull()
      .references(() => bankDetailsTable.id, { onDelete: "restrict" }),

    // what came into this account: the whole amount for a bank receipt, the bank's part when cash took the rest
    amount: money("amount").notNull(),

    // how it came in: UPI, IMPS, NEFT or RTGS, or a cheque
    mode: bankModeEnum("mode").notNull(),

    // the UTR, IMPS reference or cheque number, shaped as the mode has it
    referenceNumber: varchar("reference_number", { length: 30 }),

    // the bank account as it was when received: its bank, the last 4 digits and IFSC
    bankNameSnapshot: varchar("bank_name_snapshot", { length: 100 }).notNull(),

    bankAccountLast4Snapshot: varchar("bank_account_last4_snapshot", { length: 4 }).notNull(),

    bankIfscSnapshot: varchar("bank_ifsc_snapshot", { length: 11 }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("receipt_bank_details_receipt_account_unique").on(table.receiptId, table.bankDetailsId),

    index("receipt_bank_details_receipt_id_idx").on(table.receiptId),

    index("receipt_bank_details_bank_details_id_idx").on(table.bankDetailsId),

    check("receipt_bank_details_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type ReceiptBankDetailsType = typeof receiptBankDetailsTable.$inferSelect;

export type InsertReceiptBankDetailsType = typeof receiptBankDetailsTable.$inferInsert;
