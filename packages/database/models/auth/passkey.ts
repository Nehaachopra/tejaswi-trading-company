// passkey.ts

import { bigint, boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { usersTable } from "./user";
import { index } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";

// WebAuthn credentials, used by admins for /admin/* elevation
export const passkeysTable = pgTable(
  "passkeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
      }),

    // admin-chosen label, e.g. "Pixel 8"
    name: varchar("name", { length: 50 }).notNull(),

    // base64url credential id from the authenticator
    credentialId: text("credential_id").notNull(),

    // base64url COSE public key
    publicKey: text("public_key").notNull(),

    // signature counter, checked to detect cloned authenticators
    counter: bigint("counter", { mode: "number" }).default(0).notNull(),

    transports: text("transports").array(),

    // "singleDevice" or "multiDevice"
    deviceType: varchar("device_type", { length: 20 }).notNull(),

    backedUp: boolean("backed_up").default(false).notNull(),

    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("passkeys_credential_id_unique").on(table.credentialId),
    index("passkeys_user_id_idx").on(table.userId),
  ],
);

export type PasskeysType = typeof passkeysTable.$inferSelect;

export type InsertPasskeysType = typeof passkeysTable.$inferInsert;
