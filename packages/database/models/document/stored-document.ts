// stored-document.ts

import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";
import { transactionsTable } from "../transaction/transaction";

// a GST document as it was issued: a PDF kept once and never overwritten, so an inspection sees exactly what went out.
// A change to the transaction adds a version; the old ones stay. The file key is empty until the file is stored
export const storedDocumentsTable = pgTable(
  "stored_documents",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, {
        onDelete: "restrict",
      }),

    // what it is: rcmSelfInvoice, and the tax invoices and credit notes to come
    kind: varchar("kind", { length: 30 })
      .notNull(),

    version: integer("version")
      .notNull(),

    // why this version was made
    reason: varchar("reason", { length: 20 })
      .notNull(),

    // where the file is kept, and its size and SHA-256, to prove it's the same file later
    fileKey: varchar("file_key", { length: 255 }),

    fileBytes: integer("file_bytes"),

    fileHash: varchar("file_hash", { length: 64 }),

    storedAt: timestamp("stored_at", {
      withTimezone: true,
    }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("stored_documents_transaction_kind_version_unique").on(table.transactionId, table.kind, table.version),

    // what the job has still to store
    index("stored_documents_waiting_idx")
      .on(table.createdAt)
      .where(sql`${table.storedAt} IS NULL`),

    check("stored_documents_version_check", sql`${table.version} >= 1`),

    check("stored_documents_reason_check", sql`${table.reason} IN ('created', 'cancelled')`),

    check(
      "stored_documents_file_check",
      sql`(${table.storedAt} IS NULL AND ${table.fileKey} IS NULL AND ${table.fileBytes} IS NULL AND ${table.fileHash} IS NULL)
        OR (${table.storedAt} IS NOT NULL AND ${table.fileKey} IS NOT NULL AND ${table.fileBytes} IS NOT NULL AND ${table.fileHash} IS NOT NULL)`,
    ),
  ],
);
