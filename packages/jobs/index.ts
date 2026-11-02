import { logger } from "@repo/logger";

import { boss } from "./boss";
import { sendOtp, sendOtpQueue } from "./queues/send-otp";
import { storeDocuments, storeDocumentsQueue } from "./queues/store-documents";

export { QueuedOtpSender } from "./otp-sender";
export { default as JobsService } from "./service";

// creates the pgboss schema on first run, then the queues, then starts their workers in this process
export async function startJobs() {
  await boss.start();

  if (!(await boss.getQueue(sendOtpQueue.name))) {
    await boss.createQueue(sendOtpQueue.name, sendOtpQueue.options);
  }
  await boss.work(sendOtpQueue.name, sendOtp);

  if (!(await boss.getQueue(storeDocumentsQueue.name))) {
    await boss.createQueue(storeDocumentsQueue.name, storeDocumentsQueue.options);
  }
  await boss.work(storeDocumentsQueue.name, storeDocuments);
  await boss.schedule(storeDocumentsQueue.name, storeDocumentsQueue.cron);

  logger.info("Job queue started");
}

export const stopJobs = () => boss.stop();

// a save asked for a document: store it now rather than at the next run. A failure here only delays it
export function storeDocumentsSoon() {
  boss.send(storeDocumentsQueue.name, {}).catch((error: unknown) => logger.error("Couldn't start storing documents", { error }));
}
