// product_price_history.ts

import { check, index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, percent } from "../../utils/common/column-type";

import { usersTable } from "../auth/user";
import { productsTable } from "./product";

// every price a pack size has had, newest last; product_prices holds only the current one.
// Each edit adds a row: it is the edit log (who, when, old → new) and a step on the graph
export const productPriceHistoryTable = pgTable(
  "product_price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),

    priceBeforeGst: money("price_before_gst").notNull(),

    gstPercent: percent("gst_percent").notNull(),

    gstAmount: money("gst_amount").notNull(),

    priceAfterGst: money("price_after_gst").notNull(),

    changedById: uuid("changed_by_id").references(() => usersTable.id, { onDelete: "set null" }),

    changedByName: varchar("changed_by_name", { length: 30 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("product_price_history_product_created_idx").on(table.productId, table.createdAt),

    check(
      "product_price_history_amounts_valid",
      sql`${table.priceBeforeGst} >= 0
        AND ${table.gstAmount} >= 0
        AND ${table.gstPercent} >= 0 AND ${table.gstPercent} <= 100
        AND ${table.priceAfterGst} = ${table.priceBeforeGst} + ${table.gstAmount}`,
    ),
  ],
);

export type ProductPriceHistoryType = typeof productPriceHistoryTable.$inferSelect;

export type InsertProductPriceHistoryType = typeof productPriceHistoryTable.$inferInsert;
