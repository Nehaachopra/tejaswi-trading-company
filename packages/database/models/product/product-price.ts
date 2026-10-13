// product_price.ts

import { pgTable, uuid } from "drizzle-orm/pg-core";

import { timestamps, money, percent } from "../../utils/common/column-type";

import { productsTable } from "./product";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const productPricesTable = pgTable(
  "product_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, {
        onDelete: "restrict",
      }),

    priceBeforeGst: money("price_before_gst").notNull(),

    gstPercent: percent("gst_percent").notNull(),

    gstAmount: money("gst_amount").notNull(),

    priceAfterGst: money("price_after_gst").notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_prices_product_id_unique").on(table.productId),

    check("product_prices_before_gst_non_negative", sql`${table.priceBeforeGst} >= 0`),

    check("product_prices_gst_amount_non_negative", sql`${table.gstAmount} >= 0`),

    check("product_prices_after_gst_non_negative", sql`${table.priceAfterGst} >= 0`),

    check(
      "product_prices_gst_rate_valid",
      sql`${table.gstPercent} >= 0 AND ${table.gstPercent} <= 100`,
    ),

    check(
      "product_prices_total_consistent",
      sql`${table.priceAfterGst} = ${table.priceBeforeGst} + ${table.gstAmount}`,
    ),
  ],
);

export type ProductPricesType = typeof productPricesTable.$inferSelect;

export type InsertProductPricesType = typeof productPricesTable.$inferInsert;
