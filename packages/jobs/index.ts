import { logger } from "@repo/logger";

import { boss } from "./boss";
import { sendOtp, sendOtpQueue } from "./queues/send-otp";

export { QueuedOtpSender } from "./otp-sender";
export { default as JobsService } from "./service";

// creates the pgboss schema on first run, then the queues, then starts their workers in this process
export async function startJobs() {
  await boss.start();

  if (!(await boss.getQueue(sendOtpQueue.name))) {
    await boss.createQueue(sendOtpQueue.name, sendOtpQueue.options);
  }
  await boss.work(sendOtpQueue.name, sendOtp);

  logger.info("Job queue started");
}

export const stopJobs = () => boss.stop();
