// stock_count.ts

import { pgEnum, pgTable, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { usersTable } from "../auth/user";
import { text } from "drizzle-orm/pg-core";

export const stockCountStatusEnum = pgEnum("stock_count_status", [
  "in_progress",
  "completed",
  "cancelled",
]);

export const stockCountsTable = pgTable("stock_counts", {
  id: uuid("id").primaryKey().defaultRandom(),

  status: stockCountStatusEnum("status").default("in_progress").notNull(),

  countedBy: uuid("counted_by").references(() => usersTable.id, {
    onDelete: "no action"
  }),

  ...timestamps,
});

export type StockCountsType = typeof stockCountsTable.$inferSelect;

export type InsertStockCountsType = typeof stockCountsTable.$inferInsert;
