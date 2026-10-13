// transaction.ts

import { pgEnum, pgTable, timestamp, uuid, varchar, index } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";
import { user } from "../auth";
import { text } from "drizzle-orm/pg-core";
export const transactionTypeEnum = pgEnum("transaction_type", [
  "sale",
  "purchase",
  "sale_return",
  "purchase_return",
  "payment",
  "receipt",
  "drawing",
  "deposit",
  "withdrawl",
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

    remarks: varchar("remarks", { length: 100 }),

    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, {
        onDelete: "no action"
      }),

    ...timestamps,
  },
  (table) => [
  index("transaction_type_idx").on(table.type)
  ],
);

export type TransactionsType = typeof transactionsTable.$inferSelect;

export type InsertTransactionsType = typeof transactionsTable.$inferInsert;
