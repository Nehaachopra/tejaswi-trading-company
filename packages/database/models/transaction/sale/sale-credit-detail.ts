// sale_credit_details.ts

import { boolean, integer, pgTable, uuid } from "drizzle-orm/pg-core";

import { percent, timestamps } from "../../../utils/common/column-type";
import { transactionsTable } from "../transaction";

export const saleCreditDetailsTable = pgTable("sale_credit_details", {
  id: uuid("id").primaryKey().defaultRandom(),

  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactionsTable.id, {
      onDelete: "restrict"
    }),

  creditPeriodInDays: integer("credit_period_in_days"),

  interestRate: percent("interest_rate").default("4.50"),

  interestApplicable: boolean("interest_applicable").default(false),

  ...timestamps,
});

export type SaleCreditDetailsType = typeof saleCreditDetailsTable.$inferSelect;

export type InsertSaleCreditDetailsType = typeof saleCreditDetailsTable.$inferInsert;
