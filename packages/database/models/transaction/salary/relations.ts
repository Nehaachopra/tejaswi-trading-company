import { relations } from "drizzle-orm";

import { bankDetailsTable } from "../../bank-detail";
import { employeesTable } from "../../employee/employee";
import { transactionsTable } from "../transaction";
import { salariesTable } from "./salary";
import { salaryAdvanceDeductionsTable } from "./salary-advance-deduction";
import { salaryPostingsTable } from "./salary-posting";

export const salaryPostingsRelations = relations(salaryPostingsTable, ({ one }) => ({
  transaction: one(transactionsTable, {
    fields: [salaryPostingsTable.transactionId],
    references: [transactionsTable.id],
    relationName: "salary_posting_transaction",
  }),

  paidTransaction: one(transactionsTable, {
    fields: [salaryPostingsTable.paidTransactionId],
    references: [transactionsTable.id],
    relationName: "salary_posting_paid_transaction",
  }),

  employee: one(employeesTable, {
    fields: [salaryPostingsTable.employeeId],
    references: [employeesTable.id],
  }),

  salary: one(salariesTable),
}));

export const salariesRelations = relations(salariesTable, ({ one, many }) => ({
  transaction: one(transactionsTable, {
    fields: [salariesTable.transactionId],
    references: [transactionsTable.id],
  }),

  employee: one(employeesTable, {
    fields: [salariesTable.employeeId],
    references: [employeesTable.id],
  }),

  salaryPosting: one(salaryPostingsTable, {
    fields: [salariesTable.salaryPostingId],
    references: [salaryPostingsTable.id],
  }),

  bankDetails: one(bankDetailsTable, {
    fields: [salariesTable.bankDetailsId],
    references: [bankDetailsTable.id],
  }),

  advanceDeductions: many(salaryAdvanceDeductionsTable),
}));

export const salaryAdvanceDeductionsRelations = relations(salaryAdvanceDeductionsTable, ({ one }) => ({
  advance: one(salariesTable, {
    fields: [salaryAdvanceDeductionsTable.salaryId],
    references: [salariesTable.id],
  }),
}));
