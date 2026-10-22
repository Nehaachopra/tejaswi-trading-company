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

    // undoes an earlier entry of the same transaction, on a cancel or an edit
    isReversal: boolean("is_reversal").default(false).notNull(),

    // no running balance is stored: entries can be pre- or post-dated, so a statement adds
    // the balance up in (date_time, created_at) order when it is read

    ...timestamps,
  },
  (table) => [
    index("ledger_entries_transaction_id_idx").on(table.transactionId),
    index("ledger_entries_ledger_datetime_idx").on(table.ledgerId, table.dateTime),
    check(
      "ledger_entries_amount_non_negative",
      sql`${table.amount} >= 0`,
    ),
  ],
);

export type LedgerEntriesType = typeof ledgerEntriesTable.$inferSelect;

export type InsertLedgerEntriesType = typeof ledgerEntriesTable.$inferInsert;
