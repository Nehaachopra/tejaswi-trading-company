// session.ts

import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { usersTable } from "./user";
import { index } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
      }),

    // sha-256 of the session token; the raw token only lives in the cookie
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    // set for 15 minutes after an admin verifies a passkey; /admin/* needs it in the future
    elevatedUntil: timestamp("elevated_until", { withTimezone: true }),

    // pending WebAuthn challenge for passkey registration or verification
    challenge: text("challenge"),

    challengeExpiresAt: timestamp("challenge_expires_at", { withTimezone: true }),

    ipAddress: varchar("ip_address", { length: 45 }),

    userAgent: text("user_agent"),

    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export type SessionsType = typeof sessionsTable.$inferSelect;

export type InsertSessionsType = typeof sessionsTable.$inferInsert;
