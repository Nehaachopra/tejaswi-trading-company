// transaction-bank-detail.ts

import { sql } from "drizzle-orm";
import { check, index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { bankModeEnum } from "../../utils/common/enum";
import { bankDetailsTable } from "../bank-detail";
import { transactionsTable } from "./transaction";

// the bank's part of any transaction that moved money through a bank (a receipt, a payment, a salary…): which account,
// how much, how (UPI, IMPS, NEFT or RTGS, a cheque) with its UTR or cheque number, and the account as it was then (so
// a voucher can be drawn again unchanged). Cash alone has no row; the cash part is the amount less these. One split
// over accounts has a row per account, each account once
export const transactionBankDetailsTable = pgTable(
  "transaction_bank_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    bankDetailsId: uuid("bank_details_id")
      .notNull()
      .references(() => bankDetailsTable.id, { onDelete: "restrict" }),

    // what went through this account: the whole amount when only the bank was used, its part otherwise
    amount: money("amount").notNull(),

    // how: UPI, IMPS, NEFT or RTGS, or a cheque
    mode: bankModeEnum("mode").notNull(),

    // the UTR, IMPS reference or cheque number, shaped as the mode has it
    referenceNumber: varchar("reference_number", { length: 30 }),

    // the bank account as it was then: its bank, the last 4 digits and IFSC
    bankNameSnapshot: varchar("bank_name_snapshot", { length: 100 }).notNull(),

    bankAccountLast4Snapshot: varchar("bank_account_last4_snapshot", { length: 4 }).notNull(),

    bankIfscSnapshot: varchar("bank_ifsc_snapshot", { length: 11 }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("transaction_bank_details_transaction_account_unique").on(table.transactionId, table.bankDetailsId),

    index("transaction_bank_details_transaction_id_idx").on(table.transactionId),

    index("transaction_bank_details_bank_details_id_idx").on(table.bankDetailsId),

    check("transaction_bank_details_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type TransactionBankDetailsType = typeof transactionBankDetailsTable.$inferSelect;

export type InsertTransactionBankDetailsType = typeof transactionBankDetailsTable.$inferInsert;
