// product_price.ts

import { boolean, pgTable, uuid } from "drizzle-orm/pg-core";

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

    // the selling price: empty only for a product added from a purchase order, until its price is set
    priceBeforeGst: money("price_before_gst"),

    gstPercent: percent("gst_percent").notNull(),

    gstAmount: money("gst_amount"),

    priceAfterGst: money("price_after_gst"),

    // added from a purchase order: the GST % is known, the selling price may come later
    fromPurchase: boolean("from_purchase").default(false).notNull(),

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

    // no selling price only for a product added from a purchase order; otherwise all three are set
    check(
      "product_prices_price_set",
      sql`${table.fromPurchase} OR (${table.priceBeforeGst} IS NOT NULL AND ${table.gstAmount} IS NOT NULL AND ${table.priceAfterGst} IS NOT NULL)`,
    ),

    check(
      "product_prices_total_consistent",
      sql`${table.priceAfterGst} = ${table.priceBeforeGst} + ${table.gstAmount}`,
    ),
  ],
);

export type ProductPricesType = typeof productPricesTable.$inferSelect;

export type InsertProductPricesType = typeof productPricesTable.$inferInsert;
