// drawing_product.ts

import { integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../../utils/common/column-type";

import { drawingsTable } from "./drawing";
import { productGodownsTable } from "../../godown/product-godown";
import { productsTable } from "../../product/product";
import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { index } from "drizzle-orm/pg-core";

export const drawingProductsTable = pgTable("drawing_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  drawingId: uuid("drawing_id").notNull().references(() => drawingsTable.id, {
    onDelete: "restrict"
  }),

  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, {
      onDelete: "restrict"
    }),

  // category + sub-category + brand + pack quantity, as it read when drawn
  productNameSnapshot: varchar("product_name_snapshot", { length: 200 }).notNull(),

  productGodownId: uuid("product_godown_id")
    .notNull()
    .references(() => productGodownsTable.id, {
      onDelete: "restrict"
    }),

  godownName: varchar("godown_name", { length: 20 }).notNull(),

  quantity: integer("quantity").notNull(),

  // weighted average cost on the day, so the value never changes later
  unitCost: money("unit_cost").notNull(),

  // input GST claimed on these goods is reversed when the owner takes them
  gstRate: integer("gst_rate").notNull(),

  itcReversalAmount: money("itc_reversal_amount").notNull().default("0.00"),

  ...timestamps,
},
  (table) => [
    index("drawing_products_drawing_id_idx").on(table.drawingId),

    index("drawing_products_product_id_idx").on(table.productId),

    index("drawing_products_product_godown_id_idx").on(
      table.productGodownId,
    ),

    uniqueIndex("drawing_products_drawing_godown_unique").on(
      table.drawingId,
      table.productGodownId,
    ),

    check(
      "drawing_products_quantity_positive",
      sql`${table.quantity} > 0`,
    ),

    check(
      "drawing_products_amounts_valid",
      sql`${table.unitCost} >= 0
        AND ${table.itcReversalAmount} >= 0
        AND ${table.gstRate} >= 0 AND ${table.gstRate} <= 100`,
    ),
  ]);

export type DrawingProductsType = typeof drawingProductsTable.$inferSelect;

export type InsertDrawingProductsType = typeof drawingProductsTable.$inferInsert;
