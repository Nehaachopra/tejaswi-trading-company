import { relations } from "drizzle-orm";

import { usersTable } from "../auth/user";
import { partiesTable } from "../party/party";
import { salariesTable } from "../transaction/salary/salary";
import { salaryPostingsTable } from "../transaction/salary/salary-posting";
import { employeesTable } from "./employee";

export const employeesRelations = relations(employeesTable, ({ one, many }) => ({
  party: one(partiesTable, {
    fields: [employeesTable.partyId],
    references: [partiesTable.id],
  }),

  user: one(usersTable, {
    fields: [employeesTable.userId],
    references: [usersTable.id],
  }),

  salaryPostings: many(salaryPostingsTable),
  salaries: many(salariesTable),
}));
