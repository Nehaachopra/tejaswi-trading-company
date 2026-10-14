// ledger_group.ts

import { pgEnum, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";
import { ledgerTransactionTypeEnum } from "../../utils/common/enum";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ledgerGroupTypeEnum = pgEnum("ledger_group_type", [
  "asset",
  "expense",
  "loss",
  "liability",
  "income",
  "profit",
]);

export const ledgerGroupsTable = pgTable("ledger_groups", {
  id: uuid("id").primaryKey().defaultRandom(),

  type: ledgerGroupTypeEnum("type").notNull(),

  name: varchar("name", { length: 30 }).notNull(),

  balance: money("balance").notNull(),

  balanceType: ledgerTransactionTypeEnum("balance_type").notNull().default("debit"),

  ...timestamps,
},
  (table) => [
    uniqueIndex("ledger_groups_type_name_unique").on(
      table.type,
      table.name,
    ),
    check(
      "ledger_groups_balance_non_negative",
      sql`${table.balance} >= 0`,
    ),
  ],);

export type LedgerGroupsType = typeof ledgerGroupsTable.$inferSelect;

export type InsertLedgerGroupsType = typeof ledgerGroupsTable.$inferInsert;
