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
import { invoiceTypeEnum, transactedInEnum } from "../../../utils/common/enum";
import { transactionsTable } from "../transaction";
import { purchaseOrdersTable } from "../../order//purchase/purchase-order";

export const purchasesTable = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    assignedId: varchar("assigned_id", { length: 30 }).notNull(),

    orderId: varchar("order_id", { length: 30 }).references(
      () => purchaseOrdersTable.orderId,
      { onDelete: "set null" },
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

    subtotal: money("subtotal").notNull().default("0"),
    discountAmount: money("discount_amount").notNull().default("0.00"),
    gstAmount: money("gst_amount").notNull().default("0.00"),
    shippingAmount: money("shipping_amount").notNull().default("0.00"),
    otherAmount: money("other_amount").notNull().default("0.00"),
    
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
    index("purchases_transaction_id_index").on(table.transactionId),

    index("purchases_party_id_idx").on(table.partyId),

    check(
      "purchases_amounts_non_negative",
      sql`
        ${table.subtotal} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0
        AND ${table.shippingAmount} >= 0
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