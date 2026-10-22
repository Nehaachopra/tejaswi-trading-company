import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  uuid,
  varchar,
  text,
  check,
  index,
} from "drizzle-orm/pg-core";

import { money, timestamps } from "../../../utils/common/column-type";import { purchasesTable } from "./purchase";
import { productGodownsTable } from "../../godown/product-godown";
import { productsTable } from "../../product/product";

export const purchaseProductsTable = pgTable(
  "purchase_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchasesTable.id, { onDelete: "restrict" }),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),

    // category + sub-category + brand + pack quantity, as it read when bought
    productNameSnapshot: varchar("product_name_snapshot", { length: 200 }).notNull(),

    productGodownId: uuid("product_godown_id").references(() => productGodownsTable.id, {
      onDelete: "set null"
    }),

    godownName: varchar("godown_name", {length: 20}).notNull(),

    quantity: integer("quantity").notNull().default(0),

    grossProductPrice: money("gross_product_price").notNull(),

    discountAmount: money("discount_amount").notNull().default("0.00"),

    gstRate: integer("gst_rate").notNull(),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    remarks: text("remarks"),

    ...timestamps,
  },
  (table) => [
    index("purchase_products_purchase_id_idx").on(table.purchaseId),
    index("purchase_products_product_id_idx").on(table.productId),
    index("purchase_products_product_godown_id_idx").on(table.productGodownId),

    check(
      "purchase_products_quantity_positive",
      sql`${table.quantity} > 0`,
    ),

    check(
      "purchase_products_gross_price_non_negative",
      sql`${table.grossProductPrice} >= 0`,
    ),

    check(
      "purchase_products_discount_within_price",
      sql`${table.discountAmount} <= ${table.grossProductPrice}`,
    ),

    check(
      "purchase_products_gst_amount_non_negative",
      sql`${table.gstAmount} >= 0`,
    ),

    check(
      "purchase_products_gst_rate_valid",
      sql`${table.gstRate} >= 0 AND ${table.gstRate} <= 100`,
    ),
  ],
);

export type PurchaseProductsType = typeof purchaseProductsTable.$inferSelect;

export type InsertPurchaseProductsType = typeof purchaseProductsTable.$inferInsert;