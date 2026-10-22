// employee.ts

import { boolean, check, date, pgTable, smallint, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../utils/common/column-type";
import { usersTable } from "../auth/user";

// an employee on fixed monthly pay; linked to a user account only when they log in
export const employeesTable = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),

    name: varchar("name", { length: 150 }).notNull(),

    countryCode: varchar("country_code", { length: 5 }).default("+91"),

    phone: varchar("phone", { length: 20 }),

    address: text("address"),

    joiningDate: date("joining_date").notNull(),

    monthlySalary: money("monthly_salary").notNull(),

    // day of the month salary falls due
    payDay: smallint("pay_day").notNull(),

    isActive: boolean("is_active").default(true).notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("employees_user_id_unique")
      .on(table.userId)
      .where(sql`${table.userId} IS NOT NULL`),

    check("employees_monthly_salary_positive", sql`${table.monthlySalary} > 0`),

    check("employees_pay_day_range", sql`${table.payDay} BETWEEN 1 AND 31`),
  ],
);

export type EmployeesType = typeof employeesTable.$inferSelect;

export type InsertEmployeesType = typeof employeesTable.$inferInsert;
