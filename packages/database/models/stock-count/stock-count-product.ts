// stock_count_product.ts

import { pgTable, varchar, uuid, unique } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { productsTable } from "../product/product";
import { integer } from "drizzle-orm/pg-core";
import { stockCountsTable } from "./stock-count";
import { godownsTable } from "../godown/godown";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const stockCountProductsTable = pgTable(
  "stock_count_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    stockCountId: uuid("stock_count_id")
      .notNull()
      .references(() => stockCountsTable.id, {
        onDelete: "restrict",
      }),

    godownId: uuid("godown_id").references(() => godownsTable.id, {
      onDelete: "no action",
    }),

    godownName: varchar("godown_name", { length: 20 }).notNull(),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, {
        onDelete: "restrict",
      }),

    systemQuantity: integer("system_quantity").notNull(),

    countedQuantity: integer("counted_quantity").notNull(),

    remarks: varchar("remarks", { length: 100 }),

    ...timestamps,
  },
  (table) => [
    unique("stock_count_godown_product_unique").on(
      table.stockCountId,
      table.godownId,
      table.productId,
    ),
    check(
      "stock_count_quantities_non_negative",
      sql`${table.systemQuantity} >= 0
    AND ${table.countedQuantity} >= 0`,
    ),
  ],
);

export type StockCountProductsType = typeof stockCountProductsTable.$inferSelect;

export type InsertStockCountProductsType = typeof stockCountProductsTable.$inferInsert;
