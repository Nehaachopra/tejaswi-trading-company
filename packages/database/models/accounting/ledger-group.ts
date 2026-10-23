// ledger_group.ts

import { pgEnum, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";
import { uniqueIndex } from "drizzle-orm/pg-core";

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

  // no balance here: a group's total is the sum of its ledgers, added up when read

  ...timestamps,
},
  (table) => [
    uniqueIndex("ledger_groups_type_name_unique").on(
      table.type,
      table.name,
    ),
  ],);

export type LedgerGroupsType = typeof ledgerGroupsTable.$inferSelect;

export type InsertLedgerGroupsType = typeof ledgerGroupsTable.$inferInsert;
