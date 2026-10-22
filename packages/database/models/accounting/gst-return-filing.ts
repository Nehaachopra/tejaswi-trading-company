import {
  check,
  date,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { gstReturnTypeEnum } from "../../utils/common/enum";
import { usersTable } from "../auth/user";

// a row means that month's return is filed: no sale or sale return may be dated
// in a gstr1-filed month, no purchase or purchase return in a gstr3b-filed month
export const gstReturnFilingsTable = pgTable(
  "gst_return_filings",
  {
    returnType: gstReturnTypeEnum("return_type").notNull(),

    year: smallint("year").notNull(),
    month: smallint("month").notNull(),

    filedOn: date("filed_on").notNull(),

    filedById: uuid("filed_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "no action" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "gst_return_filings_pk",
      columns: [table.returnType, table.year, table.month],
    }),

    check("gst_return_filings_month_range", sql`${table.month} BETWEEN 1 AND 12`),
  ],
);

export type GstReturnFilingsType = typeof gstReturnFilingsTable.$inferSelect;
export type InsertGstReturnFilingsType = typeof gstReturnFilingsTable.$inferInsert;
