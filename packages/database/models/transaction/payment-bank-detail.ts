// payment-bank-detail.ts

import { sql } from "drizzle-orm";
import { check, index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { bankModeEnum } from "../../utils/common/enum";
import { bankDetailsTable } from "../bank-detail";
import { paymentsTable } from "./payment";

// the bank's part of a payment paid from a bank, or from cash and a bank together: which account, how much left it,
// the UTR or cheque, and the account as it was when paid (so the voucher can be drawn again unchanged). A cash
// payment has no row; a payment no one account can cover has a row per account, each account once
export const paymentBankDetailsTable = pgTable(
  "payment_bank_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    paymentId: uuid("payment_id")
      .notNull()
      .references(() => paymentsTable.id, { onDelete: "restrict" }),

    bankDetailsId: uuid("bank_details_id")
      .notNull()
      .references(() => bankDetailsTable.id, { onDelete: "restrict" }),

    // what left the bank: the whole amount for a bank payment, the bank's part when cash paid the rest
    amount: money("amount").notNull(),

    // how it was paid: UPI, IMPS, NEFT or RTGS, or a cheque
    mode: bankModeEnum("mode").notNull(),

    // the UTR, IMPS reference or cheque number, shaped as the mode has it
    referenceNumber: varchar("reference_number", { length: 30 }),

    // the bank account as it was when paid: its bank, the last 4 digits and IFSC
    bankNameSnapshot: varchar("bank_name_snapshot", { length: 100 }).notNull(),

    bankAccountLast4Snapshot: varchar("bank_account_last4_snapshot", { length: 4 }).notNull(),

    bankIfscSnapshot: varchar("bank_ifsc_snapshot", { length: 11 }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("payment_bank_details_payment_account_unique").on(table.paymentId, table.bankDetailsId),

    index("payment_bank_details_payment_id_idx").on(table.paymentId),

    index("payment_bank_details_bank_details_id_idx").on(table.bankDetailsId),

    check("payment_bank_details_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type PaymentBankDetailsType = typeof paymentBankDetailsTable.$inferSelect;

export type InsertPaymentBankDetailsType = typeof paymentBankDetailsTable.$inferInsert;
