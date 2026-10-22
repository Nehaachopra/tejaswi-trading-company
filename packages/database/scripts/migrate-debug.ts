// migrate-debug.ts
// Runs the same migrations as `drizzle-kit migrate`, but prints every statement
// as it runs and the full Postgres error when one fails.

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { DrizzleQueryError } from "drizzle-orm/errors";
import type { DatabaseError } from "pg";

import { env } from "../env";

const oneLine = (query: string) => query.replace(/\s+/g, " ").trim().slice(0, 160);

async function main() {
  const db = drizzle(env.DATABASE_URL, {
    logger: { logQuery: (query) => console.log(`→ ${oneLine(query)}`) },
  });

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("\nMigrations applied.");
  } catch (error) {
    const pgError = (error instanceof DrizzleQueryError ? error.cause : error) as Partial<DatabaseError>;

    console.error("\nMigration failed.");
    if (error instanceof DrizzleQueryError) {
      console.error(`\nStatement:\n${error.query}`);
    }
    console.error(`\nError:    ${pgError.message}`);
    if (pgError.code) console.error(`Code:     ${pgError.code}`);
    if (pgError.detail) console.error(`Detail:   ${pgError.detail}`);
    if (pgError.hint) console.error(`Hint:     ${pgError.hint}`);
    if (pgError.table) console.error(`Table:    ${pgError.table}`);
    if (pgError.column) console.error(`Column:   ${pgError.column}`);
    if (pgError.constraint) console.error(`Constraint: ${pgError.constraint}`);
    if (pgError.where) console.error(`Where:    ${pgError.where}`);

    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}

main();
