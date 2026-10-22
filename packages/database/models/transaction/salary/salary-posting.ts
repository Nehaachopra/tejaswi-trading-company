// salary_posting.ts

import { check, index, pgTable, smallint, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../../utils/common/column-type";
import { employeesTable } from "../../employee/employee";
import { transactionsTable } from "../transaction";

// a month's salary booked as owed when the admin presses "Post salaries":
// debit Salary expense, credit the employee's ledger
export const salaryPostingsTable = pgTable(
  "salary_postings",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "restrict" }),

    year: smallint("year").notNull(),
    month: smallint("month").notNull(),

    grossAmount: money("gross_amount").notNull(),

    advanceDeducted: money("advance_deducted").notNull().default("0.00"),

    netAmount: money("net_amount").notNull(),

    // set when this month's salary is paid (in full)
    paidTransactionId: uuid("paid_transaction_id").references(() => transactionsTable.id, {
      onDelete: "restrict",
    }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("salary_postings_employee_month_unique").on(
      table.employeeId,
      table.year,
      table.month,
    ),

    index("salary_postings_transaction_id_idx").on(table.transactionId),

    check("salary_postings_month_range", sql`${table.month} BETWEEN 1 AND 12`),

    check(
      "salary_postings_amounts_valid",
      sql`${table.grossAmount} > 0
        AND ${table.advanceDeducted} >= 0
        AND ${table.netAmount} >= 0
        AND ${table.netAmount} = ${table.grossAmount} - ${table.advanceDeducted}`,
    ),
  ],
);

export type SalaryPostingsType = typeof salaryPostingsTable.$inferSelect;

export type InsertSalaryPostingsType = typeof salaryPostingsTable.$inferInsert;
