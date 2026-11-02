import { and, eq, sql } from "@repo/database";
import { storedDocumentsTable } from "@repo/database/schema";

import type { Tx } from "../stock/engine";
import type { StoredDocumentKind } from "./model";

// asks for a document's first version, in the same save as its transaction; the job makes and stores the file
export async function queueDocument(tx: Tx, transactionId: string, kind: StoredDocumentKind) {
  await tx.insert(storedDocumentsTable).values({ transactionId, kind, version: 1, reason: "created" });
}

// a cancelled transaction: each of its documents gets a new version, and the ones before it stay as they were
export async function queueCancelled(tx: Tx, transactionId: string) {
  const kept = await tx
    .select({ kind: storedDocumentsTable.kind, version: sql<number>`max(${storedDocumentsTable.version})` })
    .from(storedDocumentsTable)
    .where(and(eq(storedDocumentsTable.transactionId, transactionId)))
    .groupBy(storedDocumentsTable.kind);
  if (kept.length === 0) return false;
  await tx.insert(storedDocumentsTable).values(kept.map((d) => ({ transactionId, kind: d.kind, version: Number(d.version) + 1, reason: "cancelled" })));
  return true;
}
