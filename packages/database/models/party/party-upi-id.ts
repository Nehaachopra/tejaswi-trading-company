// party-upi-id.ts

import { index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";
import { partiesTable } from "./party";

// the UPI IDs a party is paid on (a supplier's, for a payment's QR): one party can have several. Two parties may share
// one (a family business), so it's unique only within a party
export const partyUpiIdsTable = pgTable(
  "party_upi_ids",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    partyId: uuid("party_id")
      .notNull()
      .references(() => partiesTable.id, { onDelete: "restrict" }),

    // stored in lowercase: name@handle
    upiId: varchar("upi_id", { length: 255 }).notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("party_upi_ids_party_upi_unique").on(table.partyId, table.upiId),
    index("party_upi_ids_party_id_idx").on(table.partyId),
  ],
);

export type PartyUpiIdsType = typeof partyUpiIdsTable.$inferSelect;

export type InsertPartyUpiIdsType = typeof partyUpiIdsTable.$inferInsert;
