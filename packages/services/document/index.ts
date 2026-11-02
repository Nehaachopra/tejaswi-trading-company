import { createHash } from "node:crypto";

import { and, asc, db, desc, eq, isNull } from "@repo/database";
import { storedDocumentsTable, transactionsTable } from "@repo/database/schema";
import { logger } from "@repo/logger";

import PaymentService from "../payment";
import { fileLink, storeFile } from "./cloudinary";
import { type StoredDocumentModel, type StoredDocumentsInputModel, storedDocumentsInputModel } from "./model";
import { rcmSelfInvoice } from "./rcm-self-invoice";

type Row = typeof storedDocumentsTable.$inferSelect;

// how many one run takes on; the rest wait for the next
const RUN_SIZE = 50;

// GST documents as issued: each is made once as a PDF and kept. The save only asks for it (see queue.ts); the job
// here does the work, so a problem with the storage never stops a transaction
export default class DocumentService {
  constructor(private readonly payments = new PaymentService()) {}

  // makes one version's file
  private async render(row: Row) {
    const [t] = await db.select({ cancelReason: transactionsTable.cancelReason }).from(transactionsTable).where(eq(transactionsTable.id, row.transactionId));
    const payment = await this.payments.get({ transactionId: row.transactionId });
    return rcmSelfInvoice(payment, {
      version: row.version,
      madeAt: row.createdAt,
      cancelled: row.reason === "cancelled" ? { reason: t?.cancelReason ?? null } : null,
    });
  }

  private async store(row: Row) {
    const file = await this.render(row);
    const fileKey = `ttc/documents/${row.transactionId}/${row.kind}-v${row.version}.pdf`;
    await storeFile(fileKey, file);
    await db
      .update(storedDocumentsTable)
      .set({ fileKey, fileBytes: file.length, fileHash: createHash("sha256").update(file).digest("hex"), storedAt: new Date() })
      .where(and(eq(storedDocumentsTable.id, row.id), isNull(storedDocumentsTable.storedAt)));
  }

  // everything still waiting, oldest first; one that fails doesn't hold up the others, and the job then fails so it's
  // tried again and shows on the Jobs page
  async storeWaiting() {
    const rows = await db.select().from(storedDocumentsTable).where(isNull(storedDocumentsTable.storedAt)).orderBy(asc(storedDocumentsTable.createdAt)).limit(RUN_SIZE);
    const failed: string[] = [];
    for (const row of rows) {
      try {
        await this.store(row);
      } catch (error) {
        logger.error(`Document ${row.id} wasn't stored`, { error });
        failed.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (failed.length > 0) throw new Error(`${failed.length} of ${rows.length} documents weren't stored: ${failed[0]}`);
    return { stored: rows.length };
  }

  // a transaction's stored versions, newest first, with links to the ones in place
  async list(rawInput: StoredDocumentsInputModel): Promise<StoredDocumentModel[]> {
    const { transactionId } = storedDocumentsInputModel.parse(rawInput);
    const rows = await db.select().from(storedDocumentsTable).where(eq(storedDocumentsTable.transactionId, transactionId)).orderBy(desc(storedDocumentsTable.version));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as StoredDocumentModel["kind"],
      version: r.version,
      reason: r.reason as StoredDocumentModel["reason"],
      storedAt: r.storedAt,
      url: r.fileKey ? fileLink(r.fileKey) : null,
    }));
  }
}
