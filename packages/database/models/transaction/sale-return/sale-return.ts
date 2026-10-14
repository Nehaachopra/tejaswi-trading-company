import { pgTable, uuid, varchar, text, date, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../../utils/common/column-type";
import { salesTable } from "../sale/sale";
import { transactionsTable } from "../transaction";
import { uniqueIndex } from "drizzle-orm/pg-core";

export const saleReturnsTable = pgTable(
  "sale_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id").references(() => transactionsTable.id, {
      onDelete: "restrict"
    }).notNull(),

    saleId: uuid("sale_id")
      .notNull()
      .references(() => salesTable.id, {
        onDelete: "restrict",
      }),

    returnDate: date("return_date").notNull(),

    subtotal: money("subtotal").notNull().default("0.00"),

    discountAmount: money("discount_amount").notNull().default("0.00"),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    reason: varchar("reason", { length: 500 }),

    noteUrl: text("note_url").notNull(),

    remark: varchar("remark", { length: 500 }),

    ...timestamps,
  },
  (table) => [
    index("sale_returns_original_transaction_idx").on(
      table.saleId,
    ),

    check(
      "sale_returns_amounts_non_negative",
      sql`${table.subtotal} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0`
    ),

    check(
      "sale_returns_discount_within_subtotal",
      sql`${table.discountAmount} <= ${table.subtotal}`,
    ),
  ],
);

export type SaleReturnsType = typeof saleReturnsTable.$inferSelect;

export type InsertSaleReturnsType = typeof saleReturnsTable.$inferInsert;