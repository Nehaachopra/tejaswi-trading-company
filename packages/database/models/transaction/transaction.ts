// transaction.ts

import { check, pgEnum, pgTable, timestamp, uuid, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../utils/common/column-type";
import { usersTable } from "../auth/user";
import { text } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";

// a cancelled transaction is kept with its number; its effect is reversed by entries dated on the cancel day
export const transactionStatusEnum = pgEnum("transaction_status", ["active", "cancelled"]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "sale",
  "purchase",
  "sale_return",
  "purchase_return",
  "payment",
  "receipt",
  "drawing",
  "deposit",
  "withdrawal",
  "transfer",
  "salary",
  "other",
  // created automatically when a bank account, party or other ledger is added with an opening balance
  "opening_balance",
]);

export const transactionsTable = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    type: transactionTypeEnum("type").notNull(),

    subType: varchar("sub_type", { length: 30 }),

    // the date the transaction is for (it may be pre- or post-dated)
    dateTime: timestamp("date_time", {
      withTimezone: true,
    }).notNull(),

    // the amount it involves, for listing and filtering every type together in History
    amount: money("amount").notNull().default("0.00"),

    assignedId: varchar("assigned_id", { length: 30 }).notNull(),

    remarks: varchar("remarks", { length: 100 }),

    createdById: uuid("created_by_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "no action"
      }),

    createdByName: varchar("created_by_name", {length: 30})
      .notNull(),

    status: transactionStatusEnum("status").default("active").notNull(),

    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    cancelledById: uuid("cancelled_by_id").references(() => usersTable.id, {
      onDelete: "no action"
    }),

    cancelledByName: varchar("cancelled_by_name", { length: 30 }),

    cancelReason: varchar("cancel_reason", { length: 200 }),

    ...timestamps,
  },
  (table) => [
  index("transaction_type_idx").on(table.type),
  index("transaction_status_idx").on(table.status),
  check(
    "transactions_cancel_fields_by_status",
    sql`(
      ${table.status} = 'active'
      AND ${table.cancelledAt} IS NULL
      AND ${table.cancelledById} IS NULL
      AND ${table.cancelledByName} IS NULL
      AND ${table.cancelReason} IS NULL
    ) OR (
      ${table.status} = 'cancelled'
      AND ${table.cancelledAt} IS NOT NULL
      AND ${table.cancelledById} IS NOT NULL
      AND ${table.cancelledByName} IS NOT NULL
      AND ${table.cancelReason} IS NOT NULL
    )`,
  ),
  uniqueIndex("transaction_type_assigned_id_unique").on(table.type, table.assignedId)
  ],
);

export type TransactionsType = typeof transactionsTable.$inferSelect;

export type InsertTransactionsType = typeof transactionsTable.$inferInsert;
