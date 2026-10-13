import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import * as relations from "./relations-2";
import { env } from "./env";

export const db = drizzle(env.DATABASE_URL, {
  schema: { ...schema, ...relations },
});

export * from "drizzle-orm";
