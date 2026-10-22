import { relations } from "drizzle-orm";

import { usersTable } from "../auth/user";
import { salariesTable } from "../transaction/salary/salary";
import { salaryPostingsTable } from "../transaction/salary/salary-posting";
import { employeesTable } from "./employee";

export const employeesRelations = relations(employeesTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [employeesTable.userId],
    references: [usersTable.id],
  }),

  salaryPostings: many(salaryPostingsTable),
  salaries: many(salariesTable),
}));
