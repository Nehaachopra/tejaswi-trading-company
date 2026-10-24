// contra.ts

import { pgTable, text, uuid, varchar, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../utils/common/column-type";

import { bankDetailsTable } from "../bank-detail";
import { transactionsTable } from "./transaction";

// business money moving from one form to another; an empty side is cash in hand.
// cash → bank is a deposit, bank → cash a withdrawal, bank → bank a transfer
// (the transaction's type says which)
export const contrasTable = pgTable("contras", {
  id: uuid("id").primaryKey().defaultRandom(),

  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactionsTable.id, {
      onDelete: "restrict"
    }),

  fromBankDetailsId: uuid("from_bank_details_id")
    .references(() => bankDetailsTable.id, {
      onDelete: "restrict"
    }),

  toBankDetailsId: uuid("to_bank_details_id")
    .references(() => bankDetailsTable.id, {
      onDelete: "restrict"
    }),

  amount: money("amount").notNull(),

  referenceNumber: varchar("reference_number", { length: 30 }),

  // remarks live on the transaction

  referenceUrl: text("reference_url"),

  ...timestamps,
},
(table) => [
  uniqueIndex("contras_transaction_id_unique").on(table.transactionId),

  index("contras_from_bank_details_id_idx").on(table.fromBankDetailsId),

  index("contras_to_bank_details_id_idx").on(table.toBankDetailsId),

  check(
    "contras_amount_positive",
    sql`${table.amount} > 0`,
  ),

  // cash to cash is not a contra
  check(
    "contras_one_side_is_bank",
    sql`${table.fromBankDetailsId} IS NOT NULL OR ${table.toBankDetailsId} IS NOT NULL`,
  ),

  check(
    "contras_sides_differ",
    sql`${table.fromBankDetailsId} IS NULL
      OR ${table.toBankDetailsId} IS NULL
      OR ${table.fromBankDetailsId} <> ${table.toBankDetailsId}`,
  ),
]);

export type ContrasType = typeof contrasTable.$inferSelect;

export type InsertContrasType = typeof contrasTable.$inferInsert;
