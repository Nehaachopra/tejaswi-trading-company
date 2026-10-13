// sale-order-products.ts

import { sql } from "drizzle-orm";
import { integer, pgTable, uuid, text, check, index } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../../utils/common/column-type";
import { productsTable } from "../../product/product";
import { saleOrdersTable } from "./sale-order";
import { partyAddressesTable } from "../../party/party-address";

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

    partyAddressId: uuid("party_address_id").references(() => partyAddressesTable.id, {
      onDelete: "set null",
    }),

    quantityOrdered: integer("quantity_ordered").notNull(),

    grossProductPrice: money("gross_product_price").notNull(),

    discountAmount: money("discount_amount").default("0.00").notNull(),

    gstRate: integer("gst_rate").notNull(),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    remarks: text("remarks"),

    ...timestamps,
  },
  (table) => [
    index("sale_order_products_order_id_idx").on(table.saleOrderId),

    index("sale_order_products_product_id_idx").on(table.productId),

    check(
      "sale_order_products_quantity_ordered_positive",
      sql`${table.quantityOrdered} > 0`,
    ),

    check(
      "sale_order_products_sale_price_non_negative",
      sql`${table.grossProductPrice} >= 0`,
    ),

    check(
      "sale_order_products_sale_price_non_negative",
      sql`${table.discountAmount} <= ${table.grossProductPrice}`,
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
