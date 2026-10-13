// drawing_product.ts

import { integer, pgTable, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "../../../utils/common/column-type";

import { drawingsTable } from "./drawing";
import { productGodownsTable } from "../../godown/product-godown";
import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { index } from "drizzle-orm/pg-core";

export const drawingProductsTable = pgTable("drawing_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  drawingId: uuid("drawing_id").notNull().references(() => drawingsTable.id, {
    onDelete: "restrict"
  }),
  productGodownId: uuid("product_godown_id")
    .notNull()
    .references(() => productGodownsTable.id, {
      onDelete: "restrict"
    }),

  quantity: integer("quantity").notNull(),
  ...timestamps,
},
  (table) => [
    index("drawing_products_drawing_id_idx").on(table.drawingId),

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
  ]);

export type DrawingProductsType = typeof drawingProductsTable.$inferSelect;

export type InsertDrawingProductsType = typeof drawingProductsTable.$inferInsert;
