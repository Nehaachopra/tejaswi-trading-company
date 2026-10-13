// party.ts


// party.ts
import { pgTable, text, uuid, varchar, boolean } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

export const partiesTable = pgTable(
  "parties",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),

    name: varchar("name", { length: 150 })
      .notNull(),
    
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

