// sale_order.ts

import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../../utils/common/column-type";

import { partiesTable } from "../../party/party";
import { user } from "../../auth";
import { date } from "drizzle-orm/pg-core";import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uniqueIndex } from "drizzle-orm/pg-core";

export const saleOrdersTable = pgTable(
  "sale_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderId: varchar("order_id", { length: 30 }).notNull(),

    partyId: uuid("party_id")
      .notNull()
      .references(() => partiesTable.id, {
        onDelete: "no action",
      }),

    orderedById: text("ordered_by_id").references(() => user.id, {
      onDelete: "set null",
    }),

    orderedByName: varchar("ordered_by_name", {length: 255}).notNull(),

    expectedDeliveryDate: date("expected_delivery_date"),

    subtotal: money("subtotal").notNull().default("0"),

    discountAmount: money("discount_amount").notNull().default("0.00"),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    totalAmount: money("total_amount").notNull().default("0.00"),

    orderDate: date("order_date").notNull().defaultNow(),

    remarks: varchar("remarks", { length: 1000 }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("sale_orders_order_id_unique_idx").on(table.orderId),
    index("sale_orders_party_id_idx").on(table.partyId),

    check(
      "sale_orders_amounts_non_negative",
      sql`
        ${table.subtotal} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0
        AND ${table.totalAmount} >= 0
      `,
    ),

    check(
      "sale_orders_discount_within_subtotal",
      sql`${table.discountAmount} <= ${table.subtotal}`,
    ),

    check(
      "sale_orders_total_consistent",
      sql`
        ${table.totalAmount} =
        ${table.subtotal}
        - ${table.discountAmount}
        + ${table.gstAmount}
      `,
    ),
  ],
);

export type SaleOrdersType = typeof saleOrdersTable.$inferSelect;

export type InsertSaleOrdersType = typeof saleOrdersTable.$inferInsert;