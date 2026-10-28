// loan.ts

import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { percent, timestamps } from "../../utils/common/column-type";

import { partiesTable } from "../party/party";
import { transactionsTable } from "../transaction/transaction";

// how often the interest is paid
export const loanFrequencyEnum = pgEnum("loan_frequency", ["monthly", "quarterly", "half_yearly", "yearly"]);

// a loan received from a party (credited to the party's own ledger): one row per loan, made with the receipt that
// brought the money in. Loans only carry interest: its rate and how often it's paid. The party's address and
// contacts live on the party; its name and phone are copied here as they were
export const loansTable = pgTable(
  "loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    partyId: uuid("party_id")
      .notNull()
      .references(() => partiesTable.id, { onDelete: "restrict" }),

    partyName: varchar("party_name", { length: 150 }).notNull(),

    partyPhone: varchar("party_phone", { length: 20 }),

    // the receipt the money came in with
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    // % a year; 0 when it is interest-free
    interestRate: percent("interest_rate").notNull(),

    frequency: loanFrequencyEnum("frequency").notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("loans_transaction_id_unique").on(table.transactionId),

    index("loans_party_id_idx").on(table.partyId),

    check("loans_interest_rate_valid", sql`${table.interestRate} >= 0 AND ${table.interestRate} <= 100`),
  ],
);

export type LoansType = typeof loansTable.$inferSelect;

export type InsertLoansType = typeof loansTable.$inferInsert;
