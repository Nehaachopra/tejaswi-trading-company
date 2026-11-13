// sale_order.ts

import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../../utils/common/column-type";

import { partiesTable } from "../../party/party";
import { usersTable } from "../../auth/user";
import { gstPlaceOfSupplyEnum, orderStatusEnum } from "../../../utils/common/enum";
import { date } from "drizzle-orm/pg-core";import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uniqueIndex } from "drizzle-orm/pg-core";

export const saleOrdersTable = pgTable(
  "sale_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderId: varchar("order_id", { length: 30 }).notNull(),

    // the customer when one is picked; someone not yet a customer is kept by name (and phone) on the order instead, and
    // becomes a customer only if the sale is on credit
    partyId: uuid("party_id")
      .references(() => partiesTable.id, {
        onDelete: "no action",
      }),

    customerName: varchar("customer_name", { length: 150 }),

    customerPhone: varchar("customer_phone", { length: 10 }),

    // where to deliver for someone kept by name (a customer's own address is on the party): the line and landmark
    // optional, the town, district, state and PIN as a party's address has them
    customerAddressLine1: varchar("customer_address_line_1", { length: 200 }),

    customerLandmark: varchar("customer_landmark", { length: 150 }),

    customerCity: varchar("customer_city", { length: 100 }),

    customerDistrict: varchar("customer_district", { length: 100 }),

    customerState: varchar("customer_state", { length: 100 }),

    customerStateCode: gstPlaceOfSupplyEnum("customer_state_code"),

    customerPostalCode: varchar("customer_postal_code", { length: 6 }),

    orderedById: uuid("ordered_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),

    orderedByName: varchar("ordered_by_name", {length: 255}).notNull(),

    expectedDeliveryDate: date("expected_delivery_date"),

    status: orderStatusEnum("status").default("pending").notNull(),

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
    index("sale_orders_status_idx").on(table.status),

    check(
      "sale_orders_amounts_non_negative",
      sql`
        ${table.subtotal} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0
        AND ${table.totalAmount} >= 0
      `,
    ),

    // a customer picked, or a name given (never both, never neither)
    check(
      "sale_orders_customer_or_name",
      sql`(${table.partyId} IS NULL) <> (${table.customerName} IS NULL)`,
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