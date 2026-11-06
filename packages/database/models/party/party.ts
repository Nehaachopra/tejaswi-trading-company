// party.ts

import { sql } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

// what the party has done with us, set by its transactions (never picked): a sale makes it a customer, a purchase a
// supplier, both make it customer_supplier. It decides the party's one ledger: customer → Debtors, supplier →
// Creditors, customer_supplier → Debtor-creditors (one net balance); a party with no sale or purchase yet (type null)
// sits in Parties. A loan to or from a party goes through that same ledger (its interest terms are in loans).
// landlord is the one type set when they're added (in Entities → Landlords), never by a sale or purchase: their ledger
// sits in Rent payable, and they never become a customer or supplier (someone who is also one has a separate party)
export const partyTypeEnum = pgEnum("party_type", ["customer", "supplier", "customer_supplier", "landlord"]);

export const partiesTable = pgTable(
  "parties",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),

    name: varchar("name", { length: 150 })
      .notNull(),

    // the short name the business uses for a party ("Sri Ramswamy Traders" → "SRT"), in capitals; when there is one
    // it is the ledger's name and what lists and ledgers show. Optional (a party added from a sale or purchase must
    // have one); without it the ledger goes by the full name
    shortName: varchar("short_name", { length: 20 }),

    type: partyTypeEnum("type"),
    
    countryCode: varchar("country_code", {
      length: 5
    }).default("+91").notNull(),

    phone: varchar("phone", { length: 20 }),

    email: varchar("email", { length: 254 }),

    pan: varchar("pan", { length: 10 }),

    // a transporter with 10 or fewer goods carriages who gave their PAN and a declaration: no TDS on transport
    // (section 194C(6))
    transportDeclaration: boolean("transport_declaration").notNull().default(false),

    isActive: boolean("is_active")
      .notNull()
      .default(true),

    remarks: text("remarks"),

    ...timestamps,
  },
  (table) => [
    // two parties can't share a short name
    uniqueIndex("parties_short_name_unique").on(table.shortName),

    // one phone, one party (a party may have none); it's also how a party is found first. Landlords are counted apart,
    // as someone who is also a customer or supplier has a separate party with the same phone
    uniqueIndex("parties_phone_unique").on(table.phone).where(sql`${table.type} IS DISTINCT FROM 'landlord'`),
    uniqueIndex("parties_landlord_phone_unique").on(table.phone).where(sql`${table.type} = 'landlord'`),

    // finding a party by a name like the one typed, misspelt or not (trigrams; needs the pg_trgm extension)
    index("parties_name_trgm_idx").using("gin", sql`lower(${table.name}) gin_trgm_ops`),
  ],
);

export type PartiesType = typeof partiesTable.$inferSelect;
export type InsertPartiesType = typeof partiesTable.$inferInsert;

