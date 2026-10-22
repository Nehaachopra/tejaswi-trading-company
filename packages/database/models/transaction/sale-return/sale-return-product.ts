import { pgTable, uuid, varchar, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps} from "../../../utils/common/column-type";
import { saleReturnsTable } from "./sale-return";import { integer } from "drizzle-orm/pg-core";import { saleProductsTable } from "../sale/sale-product";
import { productGodownsTable } from "../../godown/product-godown";

export const saleReturnProductsTable = pgTable(
  "sale_return_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    returnId: uuid("return_id")
      .notNull()
      .references(() => saleReturnsTable.id, {
        onDelete: "restrict",
      }),

    saleProductId: uuid("sale_product_id")
      .notNull()
      .references(() => saleProductsTable.id, {
        onDelete: "restrict",
      }),

    // godown the returned goods go back into; one row per godown
    productGodownId: uuid("product_godown_id").references(() => productGodownsTable.id, {
      onDelete: "no action",
    }),

    godownName: varchar("godown_name", { length: 20 }).notNull(),

    quantity: integer("quantity").notNull(),

    grossProductPrice: money("gross_product_price").notNull(),

    discountAmount: money("discount_amount").notNull().default("0.00"),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    ...timestamps,
  },
  (table) => [
    index("sale_return_products_return_id_idx").on(
      table.returnId,
    ),

    index("sale_return_products_original_product_idx").on(
      table.saleProductId,
    ),

    check(
      "sale_return_products_quantity_positive",
      sql`${table.quantity} > 0`,
    ),

    check(
      "sale_return_products_amounts_non_negative",
      sql`${table.grossProductPrice} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0`,
    ),

    check(
      "sale_return_products_discount_within_amount",
      sql`${table.discountAmount} <= ${table.quantity} * ${table.grossProductPrice}`,
    ),
  ],
);

export type SaleReturnProductsType = typeof saleReturnProductsTable.$inferSelect;

export type InsertSaleReturnProductsType = typeof saleReturnProductsTable.$inferInsert;