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

import { money, timestamps } from "../../../utils/common/column-type";
import { productsTable } from "../../product/product";
import { salesTable } from "./sale";
import { productGodownsTable } from "../../godown/product-godown";

export const saleProductsTable = pgTable(
  "sale_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    saleId: uuid("sale_id")
      .notNull()
      .references(() => salesTable.id, { onDelete: "restrict" }),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),

    // category + sub-category + brand + pack quantity, as it read when sold
    productNameSnapshot: varchar("product_name_snapshot", { length: 200 }).notNull(),

    quantity: integer("quantity").notNull().default(0),

    productGodownId: uuid("product_godown_id").references(
      () => productGodownsTable.id,
      { onDelete: "no action" },
    ),

    godownName: varchar("godown_name", {length: 20}).notNull(),

    grossProductPrice: money("gross_product_price").notNull(),

    discountAmount: money("discount_amount").notNull().default("0.00"),

    gstRate: integer("gst_rate").notNull(),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    remarks: text("remarks"),

    ...timestamps,
  },
  (table) => [
    index("sale_products_sale_id_idx").on(table.saleId),
    index("sale_products_product_id_idx").on(table.productId),

    check("sale_products_quantity_positive", sql`${table.quantity} > 0`),

    check(
      "sale_products_gross_price_non_negative",
      sql`${table.grossProductPrice} >= 0`,
    ),

    check(
      "sale_products_discount_within_price",
      sql`${table.discountAmount} <= ${table.grossProductPrice}`,
    ),

    check(
      "sale_products_gst_amount_non_negative",
      sql`${table.gstAmount} >= 0`,
    ),

    check(
      "sale_products_gst_rate_valid",
      sql`${table.gstRate} >= 0 AND ${table.gstRate} <= 100`,
    ),
  ],
);

export type SaleProductsType = typeof saleProductsTable.$inferSelect;
export type InsertSaleProductsType = typeof saleProductsTable.$inferInsert;