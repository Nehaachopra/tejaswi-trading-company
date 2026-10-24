// ifsc-branch.ts

import { index, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// every bank branch in India with its IFSC, loaded from Razorpay's open IFSC dataset (scripts/load-ifsc.ts) and
// refreshed by running it again. The bank form searches it, so a branch picked by name gives its IFSC
export const ifscBranchesTable = pgTable(
  "ifsc_branches",
  {
    ifsc: varchar("ifsc", { length: 11 }).primaryKey(),
    bank: varchar("bank", { length: 150 }).notNull(),
    branch: varchar("branch", { length: 150 }).notNull(),
    city: varchar("city", { length: 100 }),
    district: varchar("district", { length: 100 }),
    state: varchar("state", { length: 100 }),
    loadedAt: timestamp("loaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // a bank's branches, found by name
    index("ifsc_branches_bank_branch_idx").on(sql`lower(${table.bank})`, sql`lower(${table.branch})`),
  ],
);

export type IfscBranchesType = typeof ifscBranchesTable.$inferSelect;

export type InsertIfscBranchesType = typeof ifscBranchesTable.$inferInsert;
