import { relations } from "drizzle-orm";

import { ledgerGroupsTable } from "./ledger-group";
import { ledgerMastersTable } from "./ledger-master";
import { ledgersTable } from "./ledger";
import { ledgerEntriesTable } from "./ledger-entry";
import { transactionsTable } from "../transaction/transaction";

export const ledgerGroupsRelations = relations(ledgerGroupsTable, ({ many }) => ({
  ledgerMasters: many(ledgerMastersTable),
  ledgers: many(ledgersTable),
}));

export const ledgerMastersRelations = relations(ledgerMastersTable, ({ one, many }) => ({
  ledgerGroup: one(ledgerGroupsTable, {
    fields: [ledgerMastersTable.ledgerGroupId],
    references: [ledgerGroupsTable.id],
  }),

  ledgers: many(ledgersTable),
}));

export const ledgersRelations = relations(ledgersTable, ({ one, many }) => ({
  ledgerGroup: one(ledgerGroupsTable, {
    fields: [ledgersTable.ledgerGroupId],
    references: [ledgerGroupsTable.id],
  }),

  ledgerMaster: one(ledgerMastersTable, {
    fields: [ledgersTable.ledgerMasterId],
    references: [ledgerMastersTable.id],
  }),

  ledgerEntries: many(ledgerEntriesTable),
}));

export const ledgerEntriesRelations = relations(ledgerEntriesTable, ({ one }) => ({
  transaction: one(transactionsTable, {
    fields: [ledgerEntriesTable.transactionId],
    references: [transactionsTable.id],
  }),

  ledger: one(ledgersTable, {
    fields: [ledgerEntriesTable.ledgerId],
    references: [ledgersTable.id],
  }),
}));
