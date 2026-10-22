// salary_advance_deduction.ts

import { check, pgTable, smallint, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../../utils/common/column-type";
import { salariesTable } from "./salary";

// one month's share of an advance; the service keeps the shares adding up to the advance
// and takes each share off that month's salary posting
export const salaryAdvanceDeductionsTable = pgTable(
  "salary_advance_deductions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    salaryId: uuid("salary_id")
      .notNull()
      .references(() => salariesTable.id, { onDelete: "restrict" }),

    year: smallint("year").notNull(),
    month: smallint("month").notNull(),

    amount: money("amount").notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("salary_advance_deductions_advance_month_unique").on(
      table.salaryId,
      table.year,
      table.month,
    ),

    check("salary_advance_deductions_month_range", sql`${table.month} BETWEEN 1 AND 12`),

    check("salary_advance_deductions_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type SalaryAdvanceDeductionsType = typeof salaryAdvanceDeductionsTable.$inferSelect;

export type InsertSalaryAdvanceDeductionsType = typeof salaryAdvanceDeductionsTable.$inferInsert;
