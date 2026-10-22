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
import { purchaseOrdersTable } from "../../order//purchase/purchase-order";

export const purchasesTable = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderId: uuid("order_id").references(
      () => purchaseOrdersTable.id,
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

    // bill from: the supplier's address on its invoice; its state decides the supply type
    billFromAddressId: uuid("bill_from_address_id").references(
      () => partyAddressesTable.id,
      { onDelete: "set null" },
    ),

    billFromGstinSnapshot: varchar("bill_from_gstin_snapshot", { length: 15 }),

    billFromAddressLine1Snapshot: varchar("bill_from_address_line_1_snapshot", {
      length: 200,
    }).notNull(),

    billFromAddressLine2Snapshot: varchar("bill_from_address_line_2_snapshot", {
      length: 200,
    }),

    billFromCitySnapshot: varchar("bill_from_city_snapshot", {
      length: 100,
    }).notNull(),

    billFromDistrictSnapshot: varchar("bill_from_district_snapshot", {
      length: 100,
    }).notNull(),

    billFromStateSnapshot: varchar("bill_from_state_snapshot", {
      length: 100,
    }).notNull(),

    billFromStateCodeSnapshot: gstPlaceOfSupplyEnum(
      "bill_from_state_code_snapshot",
    ).notNull(),

    billFromPostalCodeSnapshot: varchar("bill_from_postal_code_snapshot", {
      length: 10,
    }).notNull(),

    supplyType: supplyTypeEnum("supply_type").notNull(),

    vehicleNumber: varchar("vehicle_number", { length: 15 }),

    // charges all go into the products' weighted average cost
    subtotal: money("subtotal").notNull().default("0"),
    discountAmount: money("discount_amount").notNull().default("0.00"),
    gstAmount: money("gst_amount").notNull().default("0.00"),
    packagingAmount: money("packaging_amount").notNull().default("0.00"),
    freightAmount: money("freight_amount").notNull().default("0.00"),
    handlingAmount: money("handling_amount").notNull().default("0.00"),
    otherAmount: money("other_amount").notNull().default("0.00"),

    // money paid now is in transaction_payments, credit terms in sale_purchase_credit_details
    transactedIn: transactedInEnum("transacted_in").notNull(),

    remarks: varchar("remarks", { length: 1000 }),

    // the supplier's own bill number, matched against GSTR-2B
    supplierInvoiceNumber: varchar("supplier_invoice_number", { length: 16 }).notNull(),

    // the supplier's invoice date; dates the purchase and is checked against the GSTR-3B lock
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
    index("purchases_transaction_id_index").on(table.transactionId),

    index("purchases_party_id_idx").on(table.partyId),

    check(
      "purchases_amounts_non_negative",
      sql`
        ${table.subtotal} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0
        AND ${table.packagingAmount} >= 0
        AND ${table.freightAmount} >= 0
        AND ${table.handlingAmount} >= 0
        AND ${table.otherAmount} >= 0
      `,
    ),

    check(
      "purchases_discount_within_subtotal",
      sql`${table.discountAmount} <= ${table.subtotal}`,
    ),
  ],
);

export type PurchasesType = typeof purchasesTable.$inferSelect;
export type InsertPurchasesType = typeof purchasesTable.$inferInsert;