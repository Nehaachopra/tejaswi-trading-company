// sale_purchase_credit_detail.ts

import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { percent, timestamps } from "../../utils/common/column-type";
import { transactionsTable } from "./transaction";

// trade credit on a sale or purchase (or part credit), not financial credit; at most one per transaction
export const salePurchaseCreditDetailsTable = pgTable(
  "sale_purchase_credit_details",
  {
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
  },
  (table) => [
    uniqueIndex("sale_purchase_credit_details_transaction_id_unique").on(table.transactionId),

    check(
      "sale_purchase_credit_details_credit_period_non_negative",
      sql`${table.creditPeriodInDays} IS NULL OR ${table.creditPeriodInDays} >= 0`,
    ),
  ],
);

export type SalePurchaseCreditDetailsType = typeof salePurchaseCreditDetailsTable.$inferSelect;

export type InsertSalePurchaseCreditDetailsType = typeof salePurchaseCreditDetailsTable.$inferInsert;
