import {
  pgTable,
  uuid,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../../utils/common/column-type";
import { saleReturnsTable } from "./sale-return";import { productGodownsTable } from "../../godown/product-godown";

export const saleReturnReplacementsTable = pgTable(
  "sale_return_replacements",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    returnId: uuid("return_id")
      .notNull()
      .references(() => saleReturnsTable.id, {
        onDelete: "restrict",
      }),

    productGodownId: uuid("product_godown_id")
      .notNull()
      .references(() => productGodownsTable.id, {
        onDelete: "restrict",
      }),

    quantity: integer("quantity").notNull(),

    grossProductPrice: money("gross_product_price").notNull(),

    discountAmount: money("discount_amount").notNull().default("0.00"),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    ...timestamps,
  },
  (table) => [
    index("sale_return_replacements_return_id_idx").on(
      table.returnId,
    ),

    index("sale_return_replacements_product_godown_id_idx").on(
      table.productGodownId,
    ),

    check(
      "sale_return_replacements_quantity_positive",
      sql`${table.quantity} > 0`,
    ),

    check(
      "sale_return_replacements_amounts_non_negative",
      sql`${table.grossProductPrice} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0`,
    ),

    check(
      "sale_return_replacements_discount_within_amount",
      sql`${table.discountAmount} <= ${table.grossProductPrice}`,
    ),
  ],
);

export type SaleReturnReplacementsType = typeof saleReturnReplacementsTable.$inferSelect;

export type InsertSaleReturnReplacementsType = typeof saleReturnReplacementsTable.$inferInsert;