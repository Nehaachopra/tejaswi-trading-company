// godown.ts

import {
  boolean,
  pgEnum,
  pgTable,
  text,
  check,
  uuid,
  integer,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { partiesTable } from "../party/party";
import { sql } from "drizzle-orm";

export const godownOwnershipEnum = pgEnum("godown_ownership", ["rented", "owned"]);

export const godownsTable = pgTable("godowns", {
  id: uuid("id").primaryKey().defaultRandom(),

  godownName: varchar("godown_name", { length: 20 }).notNull(),

  address: text("address"),

  // a godown can be made inactive only once it holds no stock; the service checks that
  isActive: boolean("is_active").default(true).notNull(),

  ownership: godownOwnershipEnum("ownership").notNull().default("rented"),

  rent: money("rent"),

  rentTimingInMonths: integer("rent_timing_in_months"),

  usedFrom: timestamp("used_from", {
    withTimezone: true,
  }),

  landlordId: uuid("landlord_id").references(() => partiesTable.id, {
    onDelete: "set null"
  }),

 landlordName: varchar("landlord_name", {length: 255}),

 landlordCountryCode: varchar("landlord_country_code", { length: 5 }),
landlordNumber: varchar("landlord_number", { length: 20 }),

  ...timestamps,
}, 
(table) => [
  check(
    "godowns_rented_requires_rent",
    sql`${table.ownership} <> 'rented'
      OR (${table.rent} IS NOT NULL AND ${table.rent} > 0 AND ${table.landlordName} IS NOT NULL)`,
  ),

  check(
    "godowns_owned_has_no_rental_details",
    sql`${table.ownership} <> 'owned'
      OR (
        ${table.rent} IS NULL
        AND ${table.rentTimingInMonths} IS NULL
        AND ${table.landlordId} IS NULL
        AND ${table.landlordName} IS NULL
      )`,
  ),

  check(
    "godowns_rent_duration_positive",
    sql`${table.rentTimingInMonths} IS NULL
      OR ${table.rentTimingInMonths} > 0`,
  ),

  check(
  "landlord_contact_fields_together",
  sql`
    (${table.landlordCountryCode} IS NULL)
    = (${table.landlordNumber} IS NULL)
  `,
),
]
);

export type GodownsType = typeof godownsTable.$inferSelect;

export type InsertGodownsType = typeof godownsTable.$inferInsert;
