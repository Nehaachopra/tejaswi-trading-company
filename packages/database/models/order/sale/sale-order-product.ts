// sale-order-products.ts

import { sql } from "drizzle-orm";
import { integer, pgTable, uuid, text, check, index, uniqueIndex } from "drizzle-orm/pg-core";

import { money, percent, timestamps } from "../../../utils/common/column-type";
import { productsTable } from "../../product/product";
import { saleOrdersTable } from "./sale-order";

export const saleOrderProductsTable = pgTable(
  "sale_order_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    saleOrderId: uuid("sale_order_id")
      .notNull()
      .references(() => saleOrdersTable.id, {
        onDelete: "restrict",
      }),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, {
        onDelete: "restrict",
      }),

    quantityOrdered: integer("quantity_ordered").notNull(),

    // the agreed rate per pack before GST (from the product's price with GST, or typed)
    rateBeforeGst: money("rate_before_gst").notNull(),

    // this line's own discount, in rupees, for the whole quantity
    discountAmount: money("discount_amount").default("0.00").notNull(),

    // the product's GST %, as when ordered
    gstRate: percent("gst_rate").notNull(),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    remarks: text("remarks"),

    ...timestamps,
  },
  (table) => [
    // an order lists each product once
    uniqueIndex("sale_order_products_order_product_unique").on(
      table.saleOrderId,
      table.productId,
    ),

    index("sale_order_products_order_id_idx").on(table.saleOrderId),

    index("sale_order_products_product_id_idx").on(table.productId),

    check(
      "sale_order_products_quantity_ordered_positive",
      sql`${table.quantityOrdered} > 0`,
    ),

    check(
      "sale_order_products_sale_price_non_negative",
      sql`${table.rateBeforeGst} >= 0`,
    ),

    check(
      "sale_order_products_discount_amount_valid",
      sql`${table.discountAmount} <= ${table.quantityOrdered} * ${table.rateBeforeGst}`,
    ),

    check("sale_order_products_gst_amount_non_negative", sql`${table.gstAmount} >= 0`),

    check(
      "sale_order_products_gst_rate_valid",
      sql`${table.gstRate} >= 0 AND ${table.gstRate} <= 100`,
    ),
  ],
);

export type SaleOrderProductsType = typeof saleOrderProductsTable.$inferSelect;

export type InsertSaleOrderProductsType = typeof saleOrderProductsTable.$inferInsert;
