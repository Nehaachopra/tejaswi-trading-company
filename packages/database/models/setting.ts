// setting.ts

import { jsonb, pgTable, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../utils/common/column-type";

// the website's settings, one row each: what it is (its key) and its value, checked by the settings service when read
// or saved. Today: "company" (our details every invoice and voucher heads), "tds194qYears" (the financial years our
// last year's turnover was above ₹10 crore, so suppliers have TDS taken under section 194Q)
export const settingsTable = pgTable("settings", {
  key: varchar("key", { length: 50 }).primaryKey(),

  value: jsonb("value").notNull(),

  ...timestamps,
});

export type SettingsType = typeof settingsTable.$inferSelect;

export type InsertSettingsType = typeof settingsTable.$inferInsert;
