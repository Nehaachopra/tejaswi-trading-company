// transaction_edit_log.ts

import { index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { usersTable } from "../auth/user";
import { transactionsTable } from "./transaction";

export type TransactionEditChange = {
  field: string;
  old: unknown;
  new: unknown;
};

// one row per edit, however many fields it changed; shown as the edit log on /history/[id]
export const transactionEditLogsTable = pgTable(
  "transaction_edit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    editedById: uuid("edited_by_id").references(() => usersTable.id, { onDelete: "no action" }),

    editedByName: varchar("edited_by_name", { length: 30 }).notNull(),

    changes: jsonb("changes").$type<TransactionEditChange[]>().notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("transaction_edit_logs_transaction_id_idx").on(table.transactionId, table.createdAt)],
);

export type TransactionEditLogsType = typeof transactionEditLogsTable.$inferSelect;

export type InsertTransactionEditLogsType = typeof transactionEditLogsTable.$inferInsert;
