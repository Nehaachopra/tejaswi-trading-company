// stock_count_godown.ts

import { pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar, index } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { godownsTable } from "../godown/godown";
import { stockCountsTable } from "./stock-count";

export const stockCountGodownStatusEnum = pgEnum("stock_count_godown_status", [
  "counting",
  "submitted",
]);

// one godown within a day's count; while it is "counting" the godown is locked:
// no sale, purchase, return, drawing or stock move may use it
export const stockCountGodownsTable = pgTable(
  "stock_count_godowns",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    stockCountId: uuid("stock_count_id")
      .notNull()
      .references(() => stockCountsTable.id, {
        onDelete: "restrict",
      }),

    godownId: uuid("godown_id")
      .notNull()
      .references(() => godownsTable.id, {
        onDelete: "restrict",
      }),

    godownName: varchar("godown_name", { length: 20 }).notNull(),

    status: stockCountGodownStatusEnum("status").default("counting").notNull(),

    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),

    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("stock_count_godowns_count_godown_unique").on(table.stockCountId, table.godownId),

    index("stock_count_godowns_godown_status_idx").on(table.godownId, table.status),
  ],
);

export type StockCountGodownsType = typeof stockCountGodownsTable.$inferSelect;

export type InsertStockCountGodownsType = typeof stockCountGodownsTable.$inferInsert;
