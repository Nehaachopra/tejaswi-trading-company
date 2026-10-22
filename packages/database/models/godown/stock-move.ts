// stock_move.ts

import { check, index, integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { timestamps } from "../../utils/common/column-type";
import { usersTable } from "../auth/user";
import { productsTable } from "../product/product";
import { godownsTable } from "./godown";

// stock moved from one godown to another: same business and GSTIN, so no GST and no
// ledger entry; only the two godowns' quantities change
export const stockMovesTable = pgTable(
  "stock_moves",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),

    productNameSnapshot: varchar("product_name_snapshot", { length: 200 }).notNull(),

    fromGodownId: uuid("from_godown_id")
      .notNull()
      .references(() => godownsTable.id, { onDelete: "restrict" }),

    toGodownId: uuid("to_godown_id")
      .notNull()
      .references(() => godownsTable.id, { onDelete: "restrict" }),

    quantity: integer("quantity").notNull(),

    vehicleNumber: varchar("vehicle_number", { length: 15 }),

    movedById: uuid("moved_by_id").references(() => usersTable.id, { onDelete: "set null" }),

    movedByName: varchar("moved_by_name", { length: 30 }).notNull(),

    remarks: varchar("remarks", { length: 100 }),

    ...timestamps,
  },
  (table) => [
    index("stock_moves_product_id_idx").on(table.productId),
    index("stock_moves_from_godown_id_idx").on(table.fromGodownId),
    index("stock_moves_to_godown_id_idx").on(table.toGodownId),

    check("stock_moves_quantity_positive", sql`${table.quantity} > 0`),

    check("stock_moves_godowns_differ", sql`${table.fromGodownId} <> ${table.toGodownId}`),
  ],
);

export type StockMovesType = typeof stockMovesTable.$inferSelect;

export type InsertStockMovesType = typeof stockMovesTable.$inferInsert;
