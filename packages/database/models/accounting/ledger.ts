// ledger.ts

import { pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";

import { ledgerMastersTable } from "./ledger-master";
import { transactionsTable } from "../transaction/transaction";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ledgerTransactionTypeEnum = pgEnum("ledger_transaction_type", ["debit", "credit"]);

export const ledgersTable = pgTable(
  "ledgers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, {
        onDelete: "restrict",
      }),

    ledgerMasterId: uuid("ledger_master_id")
      .notNull()
      .references(() => ledgerMastersTable.id, {
        onDelete: "restrict",
      }),

    dateTime: timestamp("date_time", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    amount: money("amount").notNull(),

    transactionType: ledgerTransactionTypeEnum("transaction_type"),

    balance: money("balance").notNull(),
    ...timestamps,
  },
  (table) => [
    index("ledger_table_ledger_id_idx").on(table.ledgerMasterId),
    index("ledgers_ledger_master_datetime_idx").on(table.ledgerMasterId, table.dateTime),
    check(
      "ledger_amount_and_balance_non_negative",
      sql`${table.amount} >= 0 AND ${table.balance} >= 0`,
    ),
  ],
);

export type LedgersType = typeof ledgersTable.$inferSelect;

export type InsertLedgersType = typeof ledgersTable.$inferInsert;
