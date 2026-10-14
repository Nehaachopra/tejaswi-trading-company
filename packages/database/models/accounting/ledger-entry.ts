// ledger-entry.ts

import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { ledgerTransactionTypeEnum } from "../../utils/common/enum";

import { ledgersTable } from "./ledger";
import { transactionsTable } from "../transaction/transaction";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { boolean } from "drizzle-orm/pg-core";

export const ledgerEntriesTable = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, {
        onDelete: "restrict",
      }),

    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgersTable.id, {
        onDelete: "restrict",
      }),

    dateTime: timestamp("date_time", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    amount: money("amount").notNull(),

    transactionType: ledgerTransactionTypeEnum("transaction_type").notNull(),

    isContra: boolean("is_contra").default(false).notNull(),

    // the ledger's running balance after this entry
    balance: money("balance").notNull(),

    balanceType: ledgerTransactionTypeEnum("balance_type").notNull(),

    ...timestamps,
  },
  (table) => [
    index("ledger_entries_transaction_id_idx").on(table.transactionId),
    index("ledger_entries_ledger_datetime_idx").on(table.ledgerId, table.dateTime),
    check(
      "ledger_entries_amount_and_balance_non_negative",
      sql`${table.amount} >= 0 AND ${table.balance} >= 0`,
    ),
  ],
);

export type LedgerEntriesType = typeof ledgerEntriesTable.$inferSelect;

export type InsertLedgerEntriesType = typeof ledgerEntriesTable.$inferInsert;
