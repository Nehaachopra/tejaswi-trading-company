// stock_count_product.ts

import { pgEnum, pgTable, timestamp, varchar, uuid, unique } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { productsTable } from "../product/product";
import { integer } from "drizzle-orm/pg-core";
import { stockCountsTable } from "./stock-count";
import { godownsTable } from "../godown/godown";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "../auth/user";
import { transactionsTable } from "../transaction/transaction";

export const discrepancyReasonEnum = pgEnum("discrepancy_reason", [
  "physical_damage",
  "theft",
  "other",
]);

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

    // a shortage needs a reason; an excess needs none (treated as an accounting mismatch)
    discrepancyReason: discrepancyReasonEnum("discrepancy_reason"),

    remarks: varchar("remarks", { length: 100 }),

    // stock changes only once the admin approves; approval posts an "others" transaction
    approvedById: uuid("approved_by_id").references(() => usersTable.id, {
      onDelete: "no action",
    }),

    approvedAt: timestamp("approved_at", { withTimezone: true }),

    transactionId: uuid("transaction_id").references(() => transactionsTable.id, {
      onDelete: "restrict",
    }),

    ...timestamps,
  },
  (table) => [
    check(
      "stock_count_shortage_needs_reason",
      sql`${table.countedQuantity} >= ${table.systemQuantity}
        OR ${table.discrepancyReason} IS NOT NULL`,
    ),
    check(
      "stock_count_approval_fields_together",
      sql`(${table.approvedAt} IS NULL) = (${table.approvedById} IS NULL)`,
    ),
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
