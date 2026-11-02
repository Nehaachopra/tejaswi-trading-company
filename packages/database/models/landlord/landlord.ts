// landlord.ts

import { boolean, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

// someone we pay rent to: added in Entities, picked on a rented godown and on a rent payment. Never a party: someone
// who is also a debtor or creditor has a separate party entry. No ledger of their own, as rent posts to the Rent ledger
export const landlordsTable = pgTable(
  "landlords",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),

    name: varchar("name", { length: 150 })
      .notNull(),

    // optional, and only ever typed in; in capitals
    shortName: varchar("short_name", { length: 20 }),

    countryCode: varchar("country_code", {
      length: 5
    }).default("+91").notNull(),

    phone: varchar("phone", { length: 20 }),

    email: varchar("email", { length: 254 }),

    pan: varchar("pan", { length: 10 }),

    // with one, they're GST registered; without one we pay reverse-charge GST on their rent
    gstin: varchar("gstin", { length: 15 }),

    isActive: boolean("is_active")
      .notNull()
      .default(true),

    remarks: text("remarks"),

    ...timestamps,
  },
  (table) => [
    // two landlords can't share a short name, a phone or a GSTIN; a party with the same ones doesn't clash
    uniqueIndex("landlords_short_name_unique").on(table.shortName),
    uniqueIndex("landlords_phone_unique").on(table.phone),
    uniqueIndex("landlords_gstin_unique").on(table.gstin),
  ],
);

export type LandlordsType = typeof landlordsTable.$inferSelect;
export type InsertLandlordsType = typeof landlordsTable.$inferInsert;
