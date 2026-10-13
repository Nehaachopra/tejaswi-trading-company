// drawing.ts

import { pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../../utils/common/column-type";

import { bankDetailsTable } from "../../bank-detail";
import { transactionsTable } from "../transaction";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const drawingType = pgEnum("drawing_type_enum", ["cash", "product"]);

export const drawingsTable = pgTable("drawings", {
  id: uuid("id").primaryKey().defaultRandom(),

  assignedId: varchar("assigned_id", { length: 30 }).notNull(),

  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactionsTable.id, {
      onDelete: "restrict"
    }),

  drawingType: drawingType("drawing_type").notNull(),

  bankDetailsId: uuid("bank_details_id").references(() => bankDetailsTable.id, {
    onDelete: "restrict"
  }),

  total: money("total"),

  remarks: varchar("remarks", { length: 100 }),

  voucherUrl: text("voucher_url"),

  ...timestamps,
},
(table) => [
    uniqueIndex("drawings_assigned_id_unique").on(table.assignedId),

    uniqueIndex("drawings_transaction_id_unique").on(table.transactionId),

    index("drawings_bank_details_id_idx").on(table.bankDetailsId),

    check(
      "drawings_total_non_negative",
      sql`${table.total} >= 0`,
    ),

    check(
      "drawings_bank_details_by_type",
      sql`(${table.drawingType} = 'cash')
        OR (${table.drawingType} = 'product' AND ${table.bankDetailsId} IS NULL)`,
    ),
  ],
);

export type DrawingsType = typeof drawingsTable.$inferSelect;

export type InsertDrawingsType = typeof drawingsTable.$inferInsert;
