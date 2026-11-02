import DocumentService from "@repo/services/document";

const documents = new DocumentService();

// GST documents waiting to be stored: run after a save, and every 10 minutes for anything that missed it. A failure
// retries a few times over about an hour, and the next run picks it up anyway
export const storeDocumentsQueue = {
  name: "store-documents",
  options: { retryLimit: 4, retryDelay: 60, retryBackoff: true, retryDelayMax: 1800, expireInSeconds: 300 },
  cron: "*/10 * * * *",
} as const;

export const storeDocuments = () => documents.storeWaiting();
