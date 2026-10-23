// party.ts

import { pgEnum, pgTable, text, uuid, varchar, boolean } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

// decides the party's one ledger: customer → Debtors, supplier → Creditors, both → Debtor-creditors
// (one net balance). Sales are made to customers and both, purchases from suppliers and both
export const partyTypeEnum = pgEnum("party_type", ["customer", "supplier", "both"]);

export const partiesTable = pgTable(
  "parties",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),

    name: varchar("name", { length: 150 })
      .notNull(),

    type: partyTypeEnum("type").notNull(),
    
    countryCode: varchar("country_code", {
      length: 5
    }).default("+91").notNull(),

    phone: varchar("phone", { length: 20 }),

    email: varchar("email", { length: 254 }),

    pan: varchar("pan", { length: 10 }),

    isActive: boolean("is_active")
      .notNull()
      .default(true),

    remarks: text("remarks"),

    ...timestamps,
  },
);

export type PartiesType = typeof partiesTable.$inferSelect;
export type InsertPartiesType = typeof partiesTable.$inferInsert;

