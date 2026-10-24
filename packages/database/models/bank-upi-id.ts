// bank-upi-id.ts

import { index, pgEnum, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../utils/common/column-type";
import { bankDetailsTable } from "./bank-detail";

// the app the UPI ID was made in
export const upiProviderEnum = pgEnum("upi_provider", ["phonepe", "gpay", "paytm", "bhim", "amazon_pay", "other"]);

// the UPI IDs linked to a bank account (one account can have several, each made in some app)
export const bankUpiIdsTable = pgTable(
  "bank_upi_ids",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    bankDetailsId: uuid("bank_details_id")
      .notNull()
      .references(() => bankDetailsTable.id, { onDelete: "restrict" }),

    // stored in lowercase: name@bank
    upiId: varchar("upi_id", { length: 255 }).notNull(),

    provider: upiProviderEnum("provider").notNull(),

    ...timestamps,
  },
  (table) => [
    // one UPI ID belongs to one account
    uniqueIndex("bank_upi_ids_upi_id_unique").on(table.upiId),
    index("bank_upi_ids_bank_details_id_idx").on(table.bankDetailsId),
  ],
);

export type BankUpiIdsType = typeof bankUpiIdsTable.$inferSelect;

export type InsertBankUpiIdsType = typeof bankUpiIdsTable.$inferInsert;
