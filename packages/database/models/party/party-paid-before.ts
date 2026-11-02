// party-paid-before.ts

import { sql } from "drizzle-orm";
import { check, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { partiesTable } from "./party";

// what a party was paid in a financial year outside this website, as typed on the party. TDS limits add up the year's
// payments, so these count towards them alongside what's saved here; a new year starts from nothing on its own
export const partyPaidBeforeTable = pgTable(
  "party_paid_before",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),

    partyId: uuid("party_id")
      .notNull()
      .references(() => partiesTable.id, {
        onDelete: "restrict",
      }),

    // as Settings names it: "2026-27"
    financialYear: varchar("financial_year", { length: 7 })
      .notNull(),

    // the whole amount, with the TDS taken from it
    paid: money("paid").default("0.00").notNull(),

    // the TDS already taken on that
    tds: money("tds").default("0.00").notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("party_paid_before_party_year_unique").on(table.partyId, table.financialYear),

    check("party_paid_before_amounts_check", sql`${table.paid} >= 0 AND ${table.tds} >= 0 AND ${table.tds} <= ${table.paid}`),
  ],
);

export type PartyPaidBeforeType = typeof partyPaidBeforeTable.$inferSelect;
export type InsertPartyPaidBeforeType = typeof partyPaidBeforeTable.$inferInsert;
