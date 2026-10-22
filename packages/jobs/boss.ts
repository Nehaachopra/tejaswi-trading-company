import { PgBoss } from "pg-boss";
import { logger } from "@repo/logger";

import { env } from "./env";

// jobs live in the app's own Postgres, in a "pgboss" schema that pg-boss creates and migrates itself
export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  schema: "pgboss",
  application_name: "ttc-jobs",
});

boss.on("error", (error) => logger.error("Job queue error", { error }));
