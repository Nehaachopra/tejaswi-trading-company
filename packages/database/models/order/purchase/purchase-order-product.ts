// purchase-order-products.ts

import { sql } from "drizzle-orm";
import { integer, pgTable, uuid, text, check, index } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../../utils/common/column-type";
import { productsTable } from "../../product/product";
import { purchaseOrdersTable } from "./purchase-order";
import { partyAddressesTable } from "../../party/party-address";
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

    productGodownId: uuid("product_id")
      .notNull()
      .references(() => productGodownsTable.id, {
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
    index("purchase_order_products_order_id_idx").on(table.purchaseOrderId),

    index("purchase_order_product_godown_id_idx").on(table.productGodownId),

    check(
      "purchase_order_products_quantity_ordered_positive",
      sql`${table.quantityOrdered} > 0`,
    ),

    check(
      "purchase_order_products_purchase_price_non_negative",
      sql`${table.grossProductPrice} >= 0`,
    ),

    check(
      "purchase_order_products_discount_amount_valid",
      sql`${table.discountAmount} <= ${table.grossProductPrice}`,
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
