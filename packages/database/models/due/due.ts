// due.ts

import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { money, percent, timestamps } from "../../utils/common/column-type";

import { partiesTable } from "../party/party";
import { transactionsTable } from "../transaction/transaction";

// who owes whom: a debtor owes us (a sale on credit), we owe a creditor (a purchase on credit), a loan we gave, a
// loan we took
export const dueKindEnum = pgEnum("due_kind", ["debtor", "creditor", "loan_given", "loan_taken"]);

// how often a loan's interest is paid
export const loanFrequencyEnum = pgEnum("loan_frequency", ["monthly", "quarterly", "half_yearly", "yearly"]);

// one amount owed, to or by a party: made by the transaction that created it (a sale or purchase on credit, the receipt
// a loan came in with, the payment it went out with) or, for one from before the app, by an "old due" transaction
// against Capital. Debtors and creditors are one running amount per party, settled oldest first; a loan is settled by
// picking it. What's left is the amount less its settlements. The party's name and phone are copied as they were
export const duesTable = pgTable(
  "dues",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    kind: dueKindEnum("kind").notNull(),

    partyId: uuid("party_id")
      .notNull()
      .references(() => partiesTable.id, { onDelete: "restrict" }),

    partyName: varchar("party_name", { length: 150 }).notNull(),

    partyPhone: varchar("party_phone", { length: 20 }),

    // the transaction that made it; its date is the due's date
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    amount: money("amount").notNull(),

    // when it should be paid by; past it, the due shows as overdue
    dueOn: date("due_on"),

    // a loan only: % a year (0 = interest-free) and how often the interest is paid
    interestRate: percent("interest_rate"),

    frequency: loanFrequencyEnum("frequency"),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("dues_transaction_id_unique").on(table.transactionId),

    index("dues_party_id_idx").on(table.partyId),

    check("dues_amount_positive", sql`${table.amount} > 0`),

    check(
      "dues_loan_terms",
      sql`(${table.kind} IN ('loan_given', 'loan_taken')) = (${table.interestRate} IS NOT NULL AND ${table.frequency} IS NOT NULL)`,
    ),

    check("dues_interest_rate_valid", sql`${table.interestRate} IS NULL OR (${table.interestRate} >= 0 AND ${table.interestRate} <= 100)`),
  ],
);

// how much of a due a payment or receipt settled; one payment can settle several dues (oldest first), and a due can
// be settled over several. A cancelled payment's settlements stop counting with it
export const dueSettlementsTable = pgTable(
  "due_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    dueId: uuid("due_id")
      .notNull()
      .references(() => duesTable.id, { onDelete: "restrict" }),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    amount: money("amount").notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("due_settlements_due_transaction_unique").on(table.dueId, table.transactionId),

    index("due_settlements_transaction_id_idx").on(table.transactionId),

    check("due_settlements_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type DuesType = typeof duesTable.$inferSelect;

export type InsertDuesType = typeof duesTable.$inferInsert;

export type DueSettlementsType = typeof dueSettlementsTable.$inferSelect;

export type InsertDueSettlementsType = typeof dueSettlementsTable.$inferInsert;
