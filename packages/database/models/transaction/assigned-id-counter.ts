
import {
  check,
  integer,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// one row per prefix (SA, PU, SO, PO ...) and invoice month; incremented inside
// the transaction that saves the record, so numbers are never skipped or reused
export const assignedIdCountersTable = pgTable(
  "assigned_id_counters",
  {
    prefix: varchar("prefix", { length: 2 }).notNull(),

    // calendar year and month of the invoice date, not the save date
    year: smallint("year").notNull(),
    month: smallint("month").notNull(),

    lastNumber: integer("last_number").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "assigned_id_counters_pk",
      columns: [table.prefix, table.year, table.month],
    }),

    check("assigned_id_counters_month_range", sql`${table.month} BETWEEN 1 AND 12`),

    check("assigned_id_counters_last_number_range", sql`${table.lastNumber} BETWEEN 0 AND 9999`),
  ],
);

export type AssignedIdCountersType = typeof assignedIdCountersTable.$inferSelect;
export type InsertAssignedIdCountersType = typeof assignedIdCountersTable.$inferInsert;
