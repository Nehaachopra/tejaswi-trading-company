// ledger.ts

import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { ledgerTransactionTypeEnum } from "../../utils/common/enum";

import { ledgerGroupsTable } from "./ledger-group";
import { ledgerMastersTable } from "./ledger-master";
import { index } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ledgersTable = pgTable(
  "ledgers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: varchar("name", { length: 150 }).notNull(),

    ledgerGroupId: uuid("ledger_group_id")
      .notNull()
      .references(() => ledgerGroupsTable.id, {
        onDelete: "restrict",
      }),

    ledgerMasterId: uuid("ledger_master_id")
      .references(() => ledgerMastersTable.id, {
        onDelete: "restrict",
      }),

    referenceTable: varchar("reference_table", { length: 30 }),

    referenceId: uuid("reference_id"),

    // total of every entry, post-dated ones included, kept in step with each entry in the
    // same database transaction; "as of today" leaves out entries dated after today
    balance: money("balance").notNull(),

    balanceType: ledgerTransactionTypeEnum("balance_type").notNull().default("debit"),

    ...timestamps,
  },
  (table) => [
    index("ledgers_ledger_group_id_idx").on(table.ledgerGroupId),
    index("ledgers_ledger_master_id_idx").on(table.ledgerMasterId),
    // one ledger per party under a master (e.g. one debtor ledger and one creditor ledger)
    uniqueIndex("ledgers_master_reference_unique")
      .on(table.ledgerMasterId, table.referenceTable, table.referenceId)
      .where(sql`${table.referenceId} IS NOT NULL`),
    // fixed ledgers (sale, cash, cgst ...) are unique by name within a group
    uniqueIndex("ledgers_group_name_unique")
      .on(table.ledgerGroupId, table.name)
      .where(sql`${table.referenceId} IS NULL`),
    check("ledgers_balance_non_negative", sql`${table.balance} >= 0`),
    check(
      "ledgers_reference_both_or_neither",
      sql`(${table.referenceTable} IS NULL) = (${table.referenceId} IS NULL)`,
    ),
  ],
);

export type LedgersType = typeof ledgersTable.$inferSelect;

export type InsertLedgersType = typeof ledgersTable.$inferInsert;
