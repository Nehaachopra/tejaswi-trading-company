// salary.ts

import { check, index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../../utils/common/column-type";
import { salaryKindEnum, settledInEnum } from "../../../utils/common/enum";
import { employeesTable } from "../../employee/employee";
import { transactionsTable } from "../transaction";
import { salaryPostingsTable } from "./salary-posting";

// money paid to an employee, from cash or one bank account: a posted month's salary (in one go or in parts), or an
// advance, taken back in full from the next posted month (salary_advance_deductions). Its voucher is drawn when asked
// for, never stored
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

    // no longer set: a salary payment settles the months owed oldest first (worked out when read)
    salaryPostingId: uuid("salary_posting_id").references(() => salaryPostingsTable.id, {
      onDelete: "restrict",
    }),

    settledIn: settledInEnum("settled_in").notNull(),

    // the cash voucher no.; a bank payment's account, mode and UTR are in transaction_bank_details
    referenceNumber: varchar("reference_number", { length: 30 }),

    amount: money("amount").notNull(),

    remarks: varchar("remarks", { length: 100 }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("salaries_transaction_id_unique").on(table.transactionId),

    index("salaries_employee_id_idx").on(table.employeeId),

    index("salaries_salary_posting_id_idx").on(table.salaryPostingId),

    check("salaries_amount_positive", sql`${table.amount} > 0`),




  ],
);

export type SalariesType = typeof salariesTable.$inferSelect;

export type InsertSalariesType = typeof salariesTable.$inferInsert;
