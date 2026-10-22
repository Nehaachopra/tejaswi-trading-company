// stock_count.ts

import { date, pgEnum, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { usersTable } from "../auth/user";

// completed once every godown in it is submitted; leaving midway cancels it and the
// day's count restarts from zero
export const stockCountStatusEnum = pgEnum("stock_count_status", [
  "in_progress",
  "completed",
  "cancelled",
]);

export const stockCountsTable = pgTable(
  "stock_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    countDate: date("count_date").notNull(),

    status: stockCountStatusEnum("status").default("in_progress").notNull(),

    countedBy: uuid("counted_by").references(() => usersTable.id, {
      onDelete: "no action"
    }),

    ...timestamps,
  },
  (table) => [
    // one count a day
    uniqueIndex("stock_counts_count_date_unique").on(table.countDate),
  ],
);

export type StockCountsType = typeof stockCountsTable.$inferSelect;

export type InsertStockCountsType = typeof stockCountsTable.$inferInsert;
