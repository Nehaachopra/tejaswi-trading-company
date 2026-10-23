// ledger_master.ts

import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { ledgerGroupsTable } from "./ledger-group";
import { index } from "drizzle-orm/pg-core";

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

    // no balance here: a master's total is the sum of its ledgers, added up when read

    ...timestamps,
  },
  (table) => [
    index("ledger_master_table_ledger_group_id_idx").on(table.ledgerGroupId),
  ],
);

export type LedgerMastersType = typeof ledgerMastersTable.$inferSelect;

export type InsertLedgerMastersType = typeof ledgerMastersTable.$inferInsert;
