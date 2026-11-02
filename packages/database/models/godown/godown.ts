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
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { landlordsTable } from "../landlord/landlord";
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

  // who it's rented from; their details live with them, in Entities. The service asks for one on a rented godown
  landlordId: uuid("landlord_id").references(() => landlordsTable.id, {
    onDelete: "set null"
  }),

  ...timestamps,
}, 
(table) => [
  // two godowns can't share a name, whatever the case
  uniqueIndex("godowns_name_unique").on(sql`lower(${table.godownName})`),

  check(
    "godowns_rented_requires_rent",
    sql`${table.ownership} <> 'rented'
      OR (${table.rent} IS NOT NULL AND ${table.rent} > 0)`,
  ),

  check(
    "godowns_owned_has_no_rental_details",
    sql`${table.ownership} <> 'owned'
      OR (
        ${table.rent} IS NULL
        AND ${table.rentTimingInMonths} IS NULL
        AND ${table.landlordId} IS NULL
      )`,
  ),

  check(
    "godowns_rent_duration_positive",
    sql`${table.rentTimingInMonths} IS NULL
      OR ${table.rentTimingInMonths} > 0`,
  ),
]
);

export type GodownsType = typeof godownsTable.$inferSelect;

export type InsertGodownsType = typeof godownsTable.$inferInsert;
