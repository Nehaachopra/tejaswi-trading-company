import http from "node:http";
import { startJobs, stopJobs } from "@repo/jobs";
import { logger } from "@repo/logger";
import { authService } from "@repo/trpc/server";
import { app as expressApplication } from "./server";

import { env } from "./env";

async function init() {
  try {
    await authService.ensureFirstAdmin(env.PHONE_NUMBER);
    // before listening: sending an OTP queues a job, so the queue must be up first
    await startJobs();

    const server = http.createServer(expressApplication);
    const PORT: number = env.PORT ? +env.PORT : 8000;
    server.listen(PORT, () => {
      logger.info(`http server is running on PORT ${PORT}`);
    });

    // let running jobs finish (or hand back to the queue) before the process exits
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        server.close();
        void stopJobs().finally(() => process.exit(0));
      });
    }
  } catch (err) {
    logger.error(`Error creating http server`, { err });
    process.exit(1);
  }
}

init();
