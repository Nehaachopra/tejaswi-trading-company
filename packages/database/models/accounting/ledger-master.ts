// ledger_master.ts

import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { ledgerTransactionTypeEnum } from "../../utils/common/enum";

import { ledgerGroupsTable } from "./ledger-group";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ledgerMastersTable = pgTable(
  "ledger_masters",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: varchar("name", { length: 30 }).notNull(),

    ledgerGroupId: uuid("ledger_group_id")
      .notNull()
      .references(() => ledgerGroupsTable.id, {
        onDelete: "restrict",
      }),

    balance: money("balance").notNull(),

    balanceType: ledgerTransactionTypeEnum("balance_type").notNull().default("debit"),

    ...timestamps,
  },
  (table) => [
    index("ledger_master_table_ledger_group_id_idx").on(table.ledgerGroupId),
    check("ledger_master_balance_non_negative", sql`${table.balance} >= 0`),
  ],
);

export type LedgerMastersType = typeof ledgerMastersTable.$inferSelect;

export type InsertLedgerMastersType = typeof ledgerMastersTable.$inferInsert;
