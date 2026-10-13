// withdrawal.ts

import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";

import { bankDetailsTable } from "../bank-detail";
import { transactionsTable } from "./transaction";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const withdrawalsTable = pgTable("withdrawals", {
  id: uuid("id").primaryKey().defaultRandom(),

  assignedId: varchar("assigned_id", { length: 30 }).notNull(),

  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactionsTable.id, {
      onDelete: "restrict"
    }),

  referenceNumber: varchar("reference_number", { length: 30 }),

  bankDetailsId: uuid("bank_details_id")
    .notNull()
    .references(() => bankDetailsTable.id, {
      onDelete: "no action"
    }),

  amount: money("amount").notNull(),

  remarks: varchar("remarks", { length: 100 }),

  referenceUrl: text("reference_url"),

  ...timestamps,
},
(table) => [
  uniqueIndex("deposits_assigned_id_unique").on(table.assignedId),

  uniqueIndex("deposits_transaction_id_unique").on(table.transactionId),

  index("deposits_bank_details_id_idx").on(table.bankDetailsId),

  check(
    "deposits_amount_non_negative",
    sql`${table.amount} >= 0`,
  ),
]);

export type WithdrawalsType = typeof withdrawalsTable.$inferSelect;

export type InsertWithdrawalsType = typeof withdrawalsTable.$inferInsert;
