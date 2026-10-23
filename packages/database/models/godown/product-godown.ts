// product_godown.ts

import { integer, pgTable, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { godownsTable } from "./godown";
import { productsTable } from "../product/product";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uniqueIndex } from "drizzle-orm/pg-core";

export const productGodownsTable = pgTable(
  "product_godowns",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    godownId: uuid("godown_id")
      .notNull()
      .references(() => godownsTable.id, {
        onDelete: "restrict"
      }),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, {
        onDelete: "restrict"
      }),

    // whole packs of this pack size held in this godown
    quantity: integer("quantity").default(0).notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_godowns_godown_product_unique").on(
      table.godownId,
      table.productId,
    ),

    check(
      "product_godowns_quantity_non_negative",
      sql`${table.quantity} >= 0`,
    ),

    index("product_godowns_product_id_idx").on(table.productId),
  ],
);

export type ProductGodownsType = typeof productGodownsTable.$inferSelect;

export type InsertProductGodownsType = typeof productGodownsTable.$inferInsert;
