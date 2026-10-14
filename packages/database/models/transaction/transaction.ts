// transaction.ts

import { pgEnum, pgTable, timestamp, uuid, varchar, index } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";
import { usersTable } from "../auth/user";
import { text } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";
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
  "other",
]);

export const transactionsTable = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    type: transactionTypeEnum("type").notNull(),

    subType: varchar("sub_type", { length: 30 }),

    dateTime: timestamp("date_time", {
      withTimezone: true,
    }),

    assignedId: varchar("assigned_id", { length: 30 }).notNull(),

    remarks: varchar("remarks", { length: 100 }),

    createdById: uuid("created_by_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "no action"
      }),

    createdByName: varchar("created_by_name", {length: 30})
      .notNull(),

    ...timestamps,
  },
  (table) => [
  index("transaction_type_idx").on(table.type),
  uniqueIndex("transaction_type_assigned_id_unique").on(table.type, table.assignedId)
  ],
);

export type TransactionsType = typeof transactionsTable.$inferSelect;

export type InsertTransactionsType = typeof transactionsTable.$inferInsert;
