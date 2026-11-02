import { z } from "zod";

// the documents kept as files: GST ones only (ordinary vouchers are drawn fresh from what's saved)
export const storedDocumentKindModel = z.enum(["rcmSelfInvoice"]);

export type StoredDocumentKind = z.infer<typeof storedDocumentKindModel>;

export const storedDocumentsInputModel = z.object({ transactionId: z.string().uuid() });

export type StoredDocumentsInputModel = z.infer<typeof storedDocumentsInputModel>;

// one version, newest first; the link opens the file for a short while, and is empty until it's stored
export const storedDocumentModel = z.object({
  id: z.string().uuid(),
  kind: storedDocumentKindModel,
  version: z.number().int(),
  reason: z.enum(["created", "cancelled"]),
  storedAt: z.date().nullable(),
  url: z.string().nullable(),
});

export type StoredDocumentModel = z.infer<typeof storedDocumentModel>;
