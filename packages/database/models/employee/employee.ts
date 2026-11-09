// employee.ts

import { check, date, pgTable, smallint, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../utils/common/column-type";
import { usersTable } from "../auth/user";
import { partiesTable } from "../party/party";

// a party who works for us on fixed monthly pay (a party with the employee type): what only an employee has. Their
// name, phone, address, ledger and whether they're still active are the party's; salary postings and payments point
// here. Linked to a user account only when they log in
export const employeesTable = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    partyId: uuid("party_id")
      .notNull()
      .references(() => partiesTable.id, { onDelete: "restrict" }),

    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),

    joiningDate: date("joining_date").notNull(),

    monthlySalary: money("monthly_salary").notNull(),

    // day of the month salary falls due
    payDay: smallint("pay_day").notNull(),

    ...timestamps,
  },
  (table) => [
    // one employee record per party
    uniqueIndex("employees_party_id_unique").on(table.partyId),

    uniqueIndex("employees_user_id_unique")
      .on(table.userId)
      .where(sql`${table.userId} IS NOT NULL`),

    check("employees_monthly_salary_positive", sql`${table.monthlySalary} > 0`),

    check("employees_pay_day_range", sql`${table.payDay} BETWEEN 1 AND 31`),
  ],
);

export type EmployeesType = typeof employeesTable.$inferSelect;

export type InsertEmployeesType = typeof employeesTable.$inferInsert;
