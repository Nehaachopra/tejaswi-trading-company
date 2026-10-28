// receipt.ts

import { boolean, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { money, percent, timestamps } from "../../utils/common/column-type";

import { bankDetailsTable } from "../bank-detail";
import { ledgersTable } from "../accounting/ledger";
import { transactionsTable } from "./transaction";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gstPlaceOfSupplyEnum, receivedForEnum, settledInEnum } from "../../utils/common/enum";

export const receiptsTable = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, {
        onDelete: "restrict",
      }),

    // where the money came from: a party, a loan, an income head or any other ledger;
    // a party is reached through its ledger
    receivedFromLedgerId: uuid("received_from_ledger_id")
      .notNull()
      .references(() => ledgersTable.id, {
        onDelete: "restrict",
      }),

    receivedFromNameSnapshot: varchar("received_from_name_snapshot", {
      length: 150,
    }).notNull(),

    // filled only when the money came from a party
    partyCountryCodeSnapshot: varchar("party_country_code_snapshot", { length: 5 }),

    partyPhoneSnapshot: varchar("party_phone_snapshot", { length: 20 }),

    partyEmailSnapshot: varchar("party_email_snapshot", { length: 254 }),

    // the party as it was when received, so the voucher can be drawn again unchanged on any later date: its full and
    // short name and its default address (null when it came from a plain ledger, or saved before these were kept)
    partyNameSnapshot: varchar("party_name_snapshot", { length: 150 }),

    partyShortNameSnapshot: varchar("party_short_name_snapshot", { length: 20 }),

    partyAddressLine1Snapshot: varchar("party_address_line_1_snapshot", { length: 200 }),

    partyAddressLine2Snapshot: varchar("party_address_line_2_snapshot", { length: 200 }),

    partyCitySnapshot: varchar("party_city_snapshot", { length: 100 }),

    partyPostalCodeSnapshot: varchar("party_postal_code_snapshot", { length: 6 }),

    partyStateSnapshot: varchar("party_state_snapshot", { length: 100 }),

    partyStateCodeSnapshot: gstPlaceOfSupplyEnum("party_state_code_snapshot"),

    partyGstinSnapshot: varchar("party_gstin_snapshot", { length: 15 }),

    // what it was for (the voucher's "Received for" and its particulars); receipts saved before it was kept count
    // as a customer's payment
    receivedFor: receivedForEnum("received_for").notNull().default("customer"),

    settledIn: settledInEnum("settled_in").notNull(),

    bankDetailsId: uuid("bank_details_id").references(() => bankDetailsTable.id, {
      onDelete: "restrict",
    }),

    referenceNumber: varchar("reference_number", { length: 30 }),

    // the bank account as it was when received: its bank, the last 4 digits and IFSC
    bankNameSnapshot: varchar("bank_name_snapshot", { length: 100 }),

    bankAccountLast4Snapshot: varchar("bank_account_last4_snapshot", { length: 4 }),

    bankIfscSnapshot: varchar("bank_ifsc_snapshot", { length: 11 }),

    amount: money("amount").notNull().default("0.00"),

    tdsApplicable: boolean("tds_applicable").default(false),

    tdsRate: percent("tds_rate"),

    tdsAmount: money("tds_amount"),

    // remarks and the company block live on the transaction; the voucher is drawn from all of these whenever someone
    // asks for it, never stored

    ...timestamps,
  },
  (table) => [
    uniqueIndex("receipts_transaction_id_unique").on(table.transactionId),

    index("receipts_received_from_ledger_id_idx").on(table.receivedFromLedgerId),

    index("receipts_bank_details_id_idx").on(table.bankDetailsId),

    check(
      "receipts_amounts_valid",
      sql`${table.amount} > 0
        AND (${table.tdsAmount} IS NULL OR ${table.tdsAmount} >= 0)`,
    ),

    check(
      "receipts_bank_account_for_bank",
      sql`${table.settledIn} = 'cash' OR ${table.bankDetailsId} IS NOT NULL`,
    ),

    check(
      "receipts_tds_rate_valid",
      sql`${table.tdsRate} IS NULL
        OR (${table.tdsRate} >= 0 AND ${table.tdsRate} <= 100)`,
    ),

    check(
      "receipts_tds_fields_consistent",
      sql`(
        ${table.tdsApplicable} = false
        AND (${table.tdsRate} IS NULL OR ${table.tdsRate} = 0)
        AND (${table.tdsAmount} IS NULL OR ${table.tdsAmount} = 0)
      ) OR (
        ${table.tdsApplicable} = true
      )`,
    ),
  ],
);

export type ReceiptsType = typeof receiptsTable.$inferSelect;

export type InsertReceiptsType = typeof receiptsTable.$inferInsert;
