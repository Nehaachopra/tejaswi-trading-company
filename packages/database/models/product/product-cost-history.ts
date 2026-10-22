// product_cost_history.ts

import { check, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money } from "../../utils/common/column-type";

import { transactionsTable } from "../transaction/transaction";
import { productsTable } from "./product";

// each change to a pack size's weighted average cost (landed cost, before GST), and the
// transaction that caused it; the cost line on the price history graph
export const productCostHistoryTable = pgTable(
  "product_cost_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),

    weightedAverageCost: money("weighted_average_cost").notNull(),

    // total quantity across godowns right after the change
    quantityAfter: integer("quantity_after").notNull(),

    transactionId: uuid("transaction_id").references(() => transactionsTable.id, {
      onDelete: "restrict",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("product_cost_history_product_created_idx").on(table.productId, table.createdAt),

    check(
      "product_cost_history_values_valid",
      sql`${table.weightedAverageCost} >= 0 AND ${table.quantityAfter} >= 0`,
    ),
  ],
);

export type ProductCostHistoryType = typeof productCostHistoryTable.$inferSelect;

export type InsertProductCostHistoryType = typeof productCostHistoryTable.$inferInsert;
