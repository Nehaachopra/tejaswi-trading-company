// transaction_payment.ts

import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, index, check } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { paymentModeEnum } from "../../utils/common/enum";
import { bankDetailsTable } from "../bank-detail";
import { transactionsTable } from "./transaction";

// money paid at the time of a sale or purchase; one row per mode, so a sale can be
// part cash and part UPI. The service keeps the total within the bill and none on a
// pure credit transaction.
export const transactionPaymentsTable = pgTable(
  "transaction_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    paymentMode: paymentModeEnum("payment_mode").notNull(),

    amount: money("amount").notNull(),

    bankDetailsId: uuid("bank_details_id").references(() => bankDetailsTable.id, {
      onDelete: "restrict",
    }),

    referenceNumber: varchar("reference_number", { length: 30 }),

    ...timestamps,
  },
  (table) => [
    index("transaction_payments_transaction_id_idx").on(table.transactionId),
    index("transaction_payments_bank_details_id_idx").on(table.bankDetailsId),

    check("transaction_payments_amount_positive", sql`${table.amount} > 0`),

    check(
      "transaction_payments_bank_for_non_cash_mode",
      sql`${table.paymentMode} = 'cash' OR ${table.bankDetailsId} IS NOT NULL`,
    ),
  ],
);

export type TransactionPaymentsType = typeof transactionPaymentsTable.$inferSelect;

export type InsertTransactionPaymentsType = typeof transactionPaymentsTable.$inferInsert;
