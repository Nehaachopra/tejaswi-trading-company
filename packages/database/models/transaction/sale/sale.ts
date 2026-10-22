import {
  boolean,
  date,
  pgTable,
  text,
  uuid,
  varchar,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../../utils/common/column-type";
import { partiesTable } from "../../party/party";
import {
  gstPlaceOfSupplyEnum,
  invoiceTypeEnum,
  supplyTypeEnum,
  transactedInEnum,
} from "../../../utils/common/enum";
import { partyAddressesTable } from "../../party/party-address";
import { transactionsTable } from "../transaction";
import { saleOrdersTable } from "../../order/sale/sale-order";

export const salesTable = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderId: uuid("order_id").references(
      () => saleOrdersTable.id,
      { onDelete: "no action" },
    ),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    partyId: uuid("party_id")
      .references(() => partiesTable.id, { onDelete: "set null" }),

    partyNameSnapshot: varchar("party_name_snapshot", {
      length: 150,
    }).notNull(),

    partyCountryCodeSnapshot: varchar("party_country_code_snapshot", {
      length: 5,
    }).default("+91"),

    partyPhoneSnapshot: varchar("party_phone_snapshot", { length: 20 }),

    partyEmailSnapshot: varchar("party_email_snapshot", { length: 254 }),

    // bill to: the recipient on the invoice; empty for an unregistered customer
    billToAddressId: uuid("bill_to_address_id").references(
      () => partyAddressesTable.id,
      { onDelete: "set null" },
    ),

    billToGstinSnapshot: varchar("bill_to_gstin_snapshot", { length: 15 }),

    billToAddressLine1Snapshot: varchar("bill_to_address_line_1_snapshot", {
      length: 200,
    }),

    billToAddressLine2Snapshot: varchar("bill_to_address_line_2_snapshot", {
      length: 200,
    }),

    billToCitySnapshot: varchar("bill_to_city_snapshot", { length: 100 }),

    billToDistrictSnapshot: varchar("bill_to_district_snapshot", { length: 100 }),

    billToStateSnapshot: varchar("bill_to_state_snapshot", { length: 100 }),

    billToStateCodeSnapshot: gstPlaceOfSupplyEnum("bill_to_state_code_snapshot"),

    billToPostalCodeSnapshot: varchar("bill_to_postal_code_snapshot", {
      length: 10,
    }),

    // ship to: where this trip's goods go; same as bill to by default
    shipToAddressId: uuid("ship_to_address_id").references(
      () => partyAddressesTable.id,
      { onDelete: "set null" },
    ),

    shipToAddressLine1Snapshot: varchar("ship_to_address_line_1_snapshot", {
      length: 200,
    }).notNull(),

    shipToAddressLine2Snapshot: varchar("ship_to_address_line_2_snapshot", {
      length: 200,
    }),

    shipToCitySnapshot: varchar("ship_to_city_snapshot", {
      length: 100,
    }).notNull(),

    shipToDistrictSnapshot: varchar("ship_to_district_snapshot", {
      length: 100,
    }).notNull(),

    shipToStateSnapshot: varchar("ship_to_state_snapshot", {
      length: 100,
    }).notNull(),

    shipToStateCodeSnapshot: gstPlaceOfSupplyEnum(
      "ship_to_state_code_snapshot",
    ).notNull(),

    shipToPostalCodeSnapshot: varchar("ship_to_postal_code_snapshot", {
      length: 10,
    }).notNull(),

    supplyType: supplyTypeEnum("supply_type").notNull(),

    vehicleNumber: varchar("vehicle_number", { length: 15 }),

    subtotal: money("subtotal").notNull().default("0"),
    discountAmount: money("discount_amount").notNull().default("0.00"),
    gstAmount: money("gst_amount").notNull().default("0.00"),
    shippingAmount: money("shipping_amount").notNull().default("0.00"),
    packagingAmount: money("packaging_amount").notNull().default("0.00"),
    handlingAmount: money("handling_amount").notNull().default("0.00"),
    otherAmount: money("other_amount").notNull().default("0.00"),

    // money received now is in transaction_payments, credit terms in sale_purchase_credit_details
    transactedIn: transactedInEnum("transacted_in").notNull(),

    remarks: varchar("remarks", { length: 1000 }),

    invoiceDate: date("invoice_date").notNull().defaultNow(),

    invoiceType: invoiceTypeEnum("invoice_type")
      .default("regular")
      .notNull(),

    invoiceUrl: text("invoice_url").notNull(),

    rcmApplicable: boolean("rcm_applicable").default(false).notNull(),

    isReported: boolean("is_reported").default(true),

    ...timestamps,
  },
  (table) => [
    index("sales_transaction_id_index").on(table.transactionId),
    index("sales_party_id_idx").on(table.partyId),

    check(
      "sales_amounts_non_negative",
      sql`
        ${table.subtotal} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0
        AND ${table.shippingAmount} >= 0
        AND ${table.packagingAmount} >= 0
        AND ${table.handlingAmount} >= 0
        AND ${table.otherAmount} >= 0
      `,
    ),

    check(
      "sales_discount_within_subtotal",
      sql`${table.discountAmount} <= ${table.subtotal}`,
    ),

  ],
);

export type SalesType = typeof salesTable.$inferSelect;
export type InsertSalesType = typeof salesTable.$inferInsert;