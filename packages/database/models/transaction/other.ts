import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { money, timestamps } from "../../utils/common/column-type";
import { ledgersTable } from "../accounting/ledger";
import { transactionsTable } from "./transaction";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// a journal entry for anything no other page covers: one debit and one credit of the
// same amount (multi-line journals later). Never cash or bank ledgers; the service checks that.
export const othersTable = pgTable("others", {
  id: uuid("id").primaryKey().defaultRandom(),

  transactionId: uuid("transaction_id")
    .references(() => transactionsTable.id, {
      onDelete: "restrict"
    })
    .notNull(),

  debitLedgerId: uuid("debit_ledger_id")
    .notNull()
    .references(() => ledgersTable.id, {
      onDelete: "restrict"
    }),

  debitLedgerNameSnapshot: varchar("debit_ledger_name_snapshot", { length: 150 }).notNull(),

  creditLedgerId: uuid("credit_ledger_id")
    .notNull()
    .references(() => ledgersTable.id, {
      onDelete: "restrict"
    }),

  creditLedgerNameSnapshot: varchar("credit_ledger_name_snapshot", { length: 150 }).notNull(),

  // remarks live on the transaction
  total: money("total").notNull(),
  ...timestamps,
},
  (table) => [
    index("others_transaction_id_idx").on(table.transactionId),

    index("others_debit_ledger_id_idx").on(table.debitLedgerId),

    index("others_credit_ledger_id_idx").on(table.creditLedgerId),

    check("others_total_positive", sql`${table.total} > 0`),

    check(
      "others_distinct_debit_credit_ledgers",
      sql`${table.debitLedgerId} <> ${table.creditLedgerId}`,
    ),
  ],);

export type OthersType = typeof othersTable.$inferSelect;

export type InsertOthersType = typeof othersTable.$inferInsert;
