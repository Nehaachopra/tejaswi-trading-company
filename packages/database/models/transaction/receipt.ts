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
import { settledInEnum } from "../../utils/common/enum";

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

    settledIn: settledInEnum("settled_in").notNull(),

    bankDetailsId: uuid("bank_details_id").references(() => bankDetailsTable.id, {
      onDelete: "restrict",
    }),

    referenceNumber: varchar("reference_number", { length: 30 }),

    amount: money("amount").notNull().default("0.00"),

    tdsApplicable: boolean("tds_applicable").default(false),

    tdsRate: percent("tds_rate"),

    tdsAmount: money("tds_amount"),

    remarks: varchar("remarks", { length: 100 }),

    voucherUrl: text("voucher_url").notNull(),

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
