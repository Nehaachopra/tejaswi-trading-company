import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { money, timestamps } from "../../utils/common/column-type";
import { transactionsTable } from "./transaction";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const othersTable = pgTable("others", {
  id: uuid("id").primaryKey().defaultRandom(),

  transactionId: uuid("transaction_id")
    .references(() => transactionsTable.id, {
      onDelete: "restrict"
    })
    .notNull(),

  drLedgerName: varchar("dr_ledger_name", { length: 30 }).notNull(),
  crLedgerName: varchar("cr_ledger_name", { length: 30 }).notNull(),

  remark: varchar("remark", { length: 100 }),
  total: money("total"),
  ...timestamps,
},
  (table) => [
    index("others_transaction_id_idx").on(table.transactionId),

    check("others_total_non_negative", sql`${table.total} >= 0`),

    check(
      "others_distinct_debit_credit_ledgers",
      sql`${table.drLedgerName} <> ${table.crLedgerName}`,
    ),
  ],);

export type OthersType = typeof othersTable.$inferSelect;

export type InsertOthersType = typeof othersTable.$inferInsert;
