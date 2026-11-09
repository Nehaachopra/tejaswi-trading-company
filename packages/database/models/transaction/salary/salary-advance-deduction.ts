// salary_advance_deduction.ts

import { check, pgTable, smallint, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../../utils/common/column-type";
import { salariesTable } from "./salary";

// a share of an advance taken back: in a salary payment, when the user chose to take it (payment_salary_id; the cash
// paid is the salary settled less this). Older ones were taken off a posted month (year, month) by the app
export const salaryAdvanceDeductionsTable = pgTable(
  "salary_advance_deductions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    salaryId: uuid("salary_id")
      .notNull()
      .references(() => salariesTable.id, { onDelete: "restrict" }),

    // the salary payment it was taken back in
    paymentSalaryId: uuid("payment_salary_id").references(() => salariesTable.id, { onDelete: "restrict" }),

    // older ones: the posted month it was taken off
    year: smallint("year"),
    month: smallint("month"),

    amount: money("amount").notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("salary_advance_deductions_advance_month_unique").on(
      table.salaryId,
      table.year,
      table.month,
    ),

    uniqueIndex("salary_advance_deductions_advance_payment_unique").on(table.salaryId, table.paymentSalaryId),

    check("salary_advance_deductions_month_range", sql`${table.month} IS NULL OR ${table.month} BETWEEN 1 AND 12`),

    // taken in a payment, or off a posted month
    check(
      "salary_advance_deductions_payment_or_month",
      sql`(${table.paymentSalaryId} IS NOT NULL AND ${table.year} IS NULL AND ${table.month} IS NULL)
        OR (${table.paymentSalaryId} IS NULL AND ${table.year} IS NOT NULL AND ${table.month} IS NOT NULL)`,
    ),

    check("salary_advance_deductions_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type SalaryAdvanceDeductionsType = typeof salaryAdvanceDeductionsTable.$inferSelect;

export type InsertSalaryAdvanceDeductionsType = typeof salaryAdvanceDeductionsTable.$inferInsert;
