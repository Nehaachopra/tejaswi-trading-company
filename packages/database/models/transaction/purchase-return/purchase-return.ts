import { pgTable, uuid, varchar, text, date, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps } from "../../../utils/common/column-type";
import { purchasesTable } from "../purchase/purchase";
import { transactionsTable } from "../transaction";
import { transactedInEnum } from "../../../utils/common/enum";
import { uniqueIndex } from "drizzle-orm/pg-core";

export const purchaseReturnsTable = pgTable(
  "purchase_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    transactionId: uuid("transaction_id").references(() => transactionsTable.id, {
      onDelete: "restrict"
    }).notNull(),

    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchasesTable.id, {
        onDelete: "restrict",
      }),

    returnDate: date("return_date").notNull(),

    // cash: refunded by the supplier now (rows in transaction_payments); credit: taken
    // off what we owe; both: part refunded, the rest off the balance
    transactedIn: transactedInEnum("transacted_in").notNull(),

    // the supplier's credit note; note_url holds its photo or PDF
    supplierCreditNoteNumber: varchar("supplier_credit_note_number", { length: 16 }).notNull(),

    supplierCreditNoteDate: date("supplier_credit_note_date").notNull(),

    subtotal: money("subtotal").notNull().default("0.00"),

    discountAmount: money("discount_amount").notNull().default("0.00"),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    reason: varchar("reason", { length: 500 }),

    noteUrl: text("note_url").notNull(),

    remark: varchar("remark", { length: 500 }),

    ...timestamps,
  },
  (table) => [
    index("purchase_returns_original_transaction_idx").on(
      table.purchaseId,
    ),

    check(
      "purchase_returns_amounts_non_negative",
      sql`${table.subtotal} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0`
    ),

    check(
      "purchase_returns_discount_within_subtotal",
      sql`${table.discountAmount} <= ${table.subtotal}`,
    ),
  ],
);

export type PurchaseReturnsType = typeof purchaseReturnsTable.$inferSelect;

export type InsertPurchaseReturnsType = typeof purchaseReturnsTable.$inferInsert;