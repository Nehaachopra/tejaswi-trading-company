// otp-code.ts

import { integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";
import { index } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// one row per OTP sent; rows per phone in a time window drive rate limiting
export const otpCodesTable = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    countryCode: varchar("country_code", { length: 5 }).notNull(),

    phone: varchar("phone", { length: 20 }).notNull(),

    // sha-256 of the code; the code itself is never stored
    codeHash: varchar("code_hash", { length: 64 }).notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    // failed verification attempts against this code
    attempts: integer("attempts").default(0).notNull(),

    // set when verified, so the code is single-use
    consumedAt: timestamp("consumed_at", { withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index("otp_codes_phone_created_at_idx").on(table.countryCode, table.phone, table.createdAt),
    check("otp_codes_attempts_non_negative", sql`${table.attempts} >= 0`),
  ],
);

export type OtpCodesType = typeof otpCodesTable.$inferSelect;

export type InsertOtpCodesType = typeof otpCodesTable.$inferInsert;
