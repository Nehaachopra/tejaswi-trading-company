
import { pgTable, uuid, varchar, boolean, index } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";
import { partiesTable } from "./party";

import { addressTypeEnum, gstPlaceOfSupplyEnum } from "../../utils/common/enum";
import { uniqueIndex } from "drizzle-orm/pg-core";

export const partyAddressesTable = pgTable(
  "party_addresses",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),

    partyId: uuid("party_id")
      .notNull()
      .references(() => partiesTable.id, {
        onDelete: "restrict",
      }),

    label: varchar("label", { length: 100 }),

    addressType: addressTypeEnum("address_type")
      .notNull()
      .default("both"),

    addressLine1: varchar("address_line_1", { length: 200 })
      .notNull(),

    addressLine2: varchar("address_line_2", { length: 200 }),

    landmark: varchar("landmark", { length: 150 }),

    city: varchar("city", { length: 100 })
      .notNull(),

    district: varchar("district", { length: 100 }).notNull(),

    state: varchar("state", { length: 100 })
      .notNull(),

    stateCode: gstPlaceOfSupplyEnum("state_code").notNull(),

    postalCode: varchar("postal_code", { length: 6 })
      .notNull(),

    country: varchar("country", { length: 45 })
      .notNull()
      .default("india"),

      gstin: varchar("gstin", { length: 15 }),

    isDefault: boolean("is_default")
      .notNull()
      .default(false),

    isActive: boolean("is_active")
      .notNull()
      .default(true),

    ...timestamps,
  },
  (table) => [
    index("party_addresses_party_id_idx")
      .on(table.partyId),
    uniqueIndex("parties_gstin_unique")
      .on(table.gstin),
  ],
);

export type PartyAddressesType = typeof partyAddressesTable.$inferSelect;

export type InsertPartyAddressesType = typeof partyAddressesTable.$inferInsert;
