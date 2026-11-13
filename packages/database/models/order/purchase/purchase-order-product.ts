// purchase-order-products.ts

import { sql } from "drizzle-orm";
import { integer, pgTable, uuid, text, check, index, uniqueIndex } from "drizzle-orm/pg-core";

import { money, percent, timestamps } from "../../../utils/common/column-type";
import { productsTable } from "../../product/product";
import { purchaseOrdersTable } from "./purchase-order";
import { productGodownsTable } from "../../godown/product-godown";

export const purchaseOrderProductsTable = pgTable(
  "purchase_order_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrdersTable.id, {
        onDelete: "restrict",
      }),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, {
        onDelete: "restrict",
      }),

    quantityOrdered: integer("quantity_ordered").notNull(),

    // the agreed rate per pack before GST (typed, or worked out from the price with GST)
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
    uniqueIndex("purchase_order_products_order_product_unique").on(
      table.purchaseOrderId,
      table.productId,
    ),

    index("purchase_order_products_order_id_idx").on(table.purchaseOrderId),

    index("purchase_order_product_id_idx").on(table.productId),

    check(
      "purchase_order_products_quantity_ordered_positive",
      sql`${table.quantityOrdered} > 0`,
    ),

    check(
      "purchase_order_products_purchase_price_non_negative",
      sql`${table.rateBeforeGst} >= 0`,
    ),

    check(
      "purchase_order_products_discount_amount_valid",
      sql`${table.discountAmount} <= ${table.quantityOrdered} * ${table.rateBeforeGst}`,
    ),

    check("purchase_order_products_gst_amount_non_negative", sql`${table.gstAmount} >= 0`),

    check(
      "purchase_order_products_gst_rate_valid",
      sql`${table.gstRate} >= 0 AND ${table.gstRate} <= 100`,
    ),
  ],
);

export type PurchaseOrderProductsType = typeof purchaseOrderProductsTable.$inferSelect;

export type InsertPurchaseOrderProductsType = typeof purchaseOrderProductsTable.$inferInsert;
