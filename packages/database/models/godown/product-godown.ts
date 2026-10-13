// product_godown.ts

import { pgTable, uuid } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";

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

    quantity: money("quantity").default("0.00").notNull(),

    reservedQuantity: money("reserved_quantity").default("0.00").notNull(),

    unreservedQuantity: money("unreserved_quantity").default("0.00").notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_godowns_godown_product_unique").on(
      table.godownId,
      table.productId,
    ),

    check(
      "product_godowns_quantities_non_negative",
      sql`${table.quantity} >= 0
        AND ${table.reservedQuantity} >= 0
        AND ${table.unreservedQuantity} >= 0`,
    ),

    check(
      "product_godowns_quantity_consistency",
      sql`${table.quantity} = ${table.reservedQuantity} + ${table.unreservedQuantity}`,
    ),

    index("product_godowns_product_id_idx").on(table.productId),
  ],
);

export type ProductGodownsType = typeof productGodownsTable.$inferSelect;

export type InsertProductGodownsType = typeof productGodownsTable.$inferInsert;
