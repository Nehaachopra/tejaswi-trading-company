// bank_details.ts

import { pgEnum, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../utils/common/column-type";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const bankAccountTypeEnum = pgEnum("bank_account_type", [
  "savings",
  "current",
  "cash_credit",
  "overdraft",
]);

export const bankDetailsTable = pgTable("bank_details", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountHolderName: varchar("account_holder_name", { length: 255 }).notNull(),
  bankName: varchar("bank_name", { length: 100 }).notNull(),
  branchName: varchar("branch_name", { length: 100 }).notNull(),
  accountNumber: varchar("account_number", { length: 30 }).notNull(),
  ifscCode: varchar("ifsc_code", { length: 11 }).notNull(),
  accountType: bankAccountTypeEnum("account_type").notNull(),
  upiId: varchar("upi_id", { length: 255 }),
  ...timestamps,
},
  (table) => [
    uniqueIndex("bank_details_account_number_ifsc_unique").on(
      table.accountNumber,
      table.ifscCode,
    ),

    check(
      "bank_details_ifsc_format",
      sql`${table.ifscCode} ~ '^[A-Z]{4}0[A-Z0-9]{6}$'`,
    ),
  ]);

export type BankDetailsType = typeof bankDetailsTable.$inferSelect;

export type InsertBankDetailsType = typeof bankDetailsTable.$inferInsert;
