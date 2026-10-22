// payment.ts

import { boolean, date, integer, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { money, percent, timestamps } from "../../utils/common/column-type";

import { bankDetailsTable } from "../bank-detail";
import { ledgersTable } from "../accounting/ledger";
import { transactionsTable } from "./transaction";
import { settledInEnum, supplyTypeEnum } from "../../utils/common/enum";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const paymentsTable = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),

  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactionsTable.id, {
      onDelete: "restrict"
    }),

  // where the money went: a party, a loan, an expense head or any other ledger;
  // a party is reached through its ledger
  paidToLedgerId: uuid("paid_to_ledger_id")
    .notNull()
    .references(() => ledgersTable.id, {
      onDelete: "restrict"
    }),

  paidToNameSnapshot: varchar("paid_to_name_snapshot", {
      length: 150,
    }).notNull(),

    // filled only when the money went to a party
    partyCountryCodeSnapshot: varchar("party_country_code_snapshot", { length: 5 }),

    partyPhoneSnapshot: varchar("party_phone_snapshot", { length: 20 }),

    partyEmailSnapshot: varchar("party_email_snapshot", { length: 254 }),

  settledIn: settledInEnum("settled_in").notNull(),

  bankDetailsId: uuid("bank_details_id")
    .references(() => bankDetailsTable.id, {
      onDelete: "restrict"
    }),

  amount: money("amount").default("0.00").notNull(),

  // optional GST on an expense bill (rent, services): the GST part is booked to input GST
  // and is checked against the GSTR-3B lock; all set together or none
  supplierGstinSnapshot: varchar("supplier_gstin_snapshot", { length: 15 }),

  supplierInvoiceNumber: varchar("supplier_invoice_number", { length: 16 }),

  supplierInvoiceDate: date("supplier_invoice_date"),

  supplyType: supplyTypeEnum("supply_type"),

  taxableAmount: money("taxable_amount"),

  gstRate: integer("gst_rate"),

  gstAmount: money("gst_amount"),

  // reverse charge, e.g. rent from an unregistered landlord: we pay the GST ourselves,
  // so the supplier may have no GSTIN and the invoice number is our self-invoice
  rcmApplicable: boolean("rcm_applicable").notNull().default(false),

  tdsApplicable: boolean("tds_applicable").notNull().default(false),

  tdsRate: percent("tds_rate"),

  tdsAmount: money("tds_amount"),

  remarks: varchar("remarks", { length: 100 }),

  voucherUrl: text("voucher_url").notNull(),

  ...timestamps,
}, (table) => [

  uniqueIndex("payments_transaction_id_unique").on(table.transactionId),

  index("payments_paid_to_ledger_id_idx").on(table.paidToLedgerId),

  index("payments_bank_details_id_idx").on(table.bankDetailsId),

  check(
    "payments_amount_positive",
    sql`${table.amount} > 0`,
  ),

  check(
    "payments_bank_account_for_bank",
    sql`${table.settledIn} = 'cash' OR ${table.bankDetailsId} IS NOT NULL`,
  ),

  check(
    "payments_gst_fields_together",
    sql`(
      ${table.gstAmount} IS NULL
      AND ${table.gstRate} IS NULL
      AND ${table.taxableAmount} IS NULL
      AND ${table.supplyType} IS NULL
      AND ${table.supplierGstinSnapshot} IS NULL
      AND ${table.supplierInvoiceNumber} IS NULL
      AND ${table.supplierInvoiceDate} IS NULL
    ) OR (
      ${table.gstAmount} IS NOT NULL
      AND ${table.gstRate} IS NOT NULL
      AND ${table.taxableAmount} IS NOT NULL
      AND ${table.supplyType} IS NOT NULL
      AND (${table.supplierGstinSnapshot} IS NOT NULL OR ${table.rcmApplicable} = true)
      AND ${table.supplierInvoiceNumber} IS NOT NULL
      AND ${table.supplierInvoiceDate} IS NOT NULL
    )`,
  ),

  check(
    "payments_rcm_needs_gst",
    sql`${table.rcmApplicable} = false OR ${table.gstAmount} IS NOT NULL`,
  ),

  check(
    "payments_gst_values_valid",
    sql`${table.gstAmount} IS NULL OR (
      ${table.gstAmount} >= 0
      AND ${table.taxableAmount} >= 0
      AND ${table.gstRate} >= 0 AND ${table.gstRate} <= 100
    )`,
  ),

  check(
    "payments_tds_amount_non_negative",
    sql`${table.tdsAmount} IS NULL OR ${table.tdsAmount} >= 0`,
  ),

  check(
    "payments_tds_rate_valid",
    sql`${table.tdsRate} IS NULL OR (${table.tdsRate} >= 0 AND ${table.tdsRate} <= 100)`,
  ),

  check(
    "payments_tds_fields_consistent",
    sql`(
      ${table.tdsApplicable} = false
      AND (${table.tdsRate} IS NULL OR ${table.tdsRate} = 0)
      AND (${table.tdsAmount} IS NULL OR ${table.tdsAmount} = 0)
    ) OR ${table.tdsApplicable} = true`,
  ),
]);

export type PaymentsType = typeof paymentsTable.$inferSelect;

export type InsertPaymentsType = typeof paymentsTable.$inferInsert;
