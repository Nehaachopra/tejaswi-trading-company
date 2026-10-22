// salary.ts

import { check, index, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../../utils/common/column-type";
import { salaryKindEnum, settledInEnum } from "../../../utils/common/enum";
import { bankDetailsTable } from "../../bank-detail";
import { employeesTable } from "../../employee/employee";
import { transactionsTable } from "../transaction";
import { salaryPostingsTable } from "./salary-posting";

// money paid to an employee: a posted month's salary in full, or an advance
// spread over later months (salary_advance_deductions)
export const salariesTable = pgTable(
  "salaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "restrict" }),

    kind: salaryKindEnum("kind").notNull(),

    // the posted month this pays; only for kind salary
    salaryPostingId: uuid("salary_posting_id").references(() => salaryPostingsTable.id, {
      onDelete: "restrict",
    }),

    settledIn: settledInEnum("settled_in").notNull(),

    bankDetailsId: uuid("bank_details_id").references(() => bankDetailsTable.id, {
      onDelete: "restrict",
    }),

    referenceNumber: varchar("reference_number", { length: 30 }),

    amount: money("amount").notNull(),

    remarks: varchar("remarks", { length: 100 }),

    voucherUrl: text("voucher_url").notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("salaries_transaction_id_unique").on(table.transactionId),

    // a posted month is paid once, in full
    uniqueIndex("salaries_salary_posting_id_unique")
      .on(table.salaryPostingId)
      .where(sql`${table.salaryPostingId} IS NOT NULL`),

    index("salaries_employee_id_idx").on(table.employeeId),

    check("salaries_amount_positive", sql`${table.amount} > 0`),

    check(
      "salaries_posting_by_kind",
      sql`(${table.kind} = 'salary' AND ${table.salaryPostingId} IS NOT NULL)
        OR (${table.kind} = 'advance' AND ${table.salaryPostingId} IS NULL)`,
    ),

    check(
      "salaries_bank_account_for_bank",
      sql`${table.settledIn} = 'cash' OR ${table.bankDetailsId} IS NOT NULL`,
    ),
  ],
);

export type SalariesType = typeof salariesTable.$inferSelect;

export type InsertSalariesType = typeof salariesTable.$inferInsert;
