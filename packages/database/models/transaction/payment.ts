// payment.ts

import { boolean, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { money, percent, timestamps } from "../../utils/common/column-type";

import { bankDetailsTable } from "../bank-detail";
import { partiesTable } from "../party/party";
import { transactionsTable } from "./transaction";
import { settledInEnum } from "../../utils/common/enum";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const paymentsTable = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),

  assignedId: varchar("assigned_id", { length: 30 }).notNull(),

  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactionsTable.id, {
      onDelete: "restrict"
    }),

  towards: varchar("towards", { length: 100 }).notNull(),

  partyId: uuid("party_id")
    .notNull()
    .references(() => partiesTable.id, {
      onDelete: "no action"
    }),

  partyNameSnapshot: varchar("party_name_snapshot", {
      length: 150,
    }).notNull(),

    partyCountryCodeSnapshot: varchar("party_country_code_snapshot", { length: 5 }).default("+91"),

    partyPhoneSnapshot: varchar("party_phone_snapshot", { length: 20 }),

    partyEmailSnapshot: varchar("party_email_snapshot", { length: 254 }),

  settledIn: settledInEnum("settled_in").notNull(),

  bankDetailsId: uuid("bank_details_id")
    .references(() => bankDetailsTable.id, {
      onDelete: "restrict"
    }),

  amount: money("amount").default("0.00").notNull(),

  tdsApplicable: boolean("tds_applicable").notNull().default(false),

  tdsRate: percent("tds_rate"),

  tdsAmount: money("tds_amount"),

  remarks: varchar("remarks", { length: 100 }),

  voucherUrl: text("voucher_url").notNull(),

  ...timestamps,
}, (table) => [
  uniqueIndex("payments_assigned_id_unique").on(table.assignedId),

  uniqueIndex("payments_transaction_id_unique").on(table.transactionId),

  index("payments_party_id_idx").on(table.partyId),

  index("payments_bank_details_id_idx").on(table.bankDetailsId),

  check(
    "payments_amount_non_negative",
    sql`${table.amount} >= 0`,
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
