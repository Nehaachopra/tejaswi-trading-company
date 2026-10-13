import { relations } from "drizzle-orm";

import { ledgerGroupsTable } from "./ledger-group";
import { ledgerMastersTable } from "./ledger-master";
import { ledgersTable } from "./ledger";
import { transactionsTable } from "../transaction/transaction";

export const ledgerGroupsRelations = relations(ledgerGroupsTable, ({ many }) => ({
  ledgerMasters: many(ledgerMastersTable),
}));

export const ledgerMastersRelations = relations(ledgerMastersTable, ({ one, many }) => ({
  ledgerGroup: one(ledgerGroupsTable, {
    fields: [ledgerMastersTable.ledgerGroupId],
    references: [ledgerGroupsTable.id],
  }),

  ledgers: many(ledgersTable),
}));

export const ledgersRelations = relations(ledgersTable, ({ one }) => ({
  transaction: one(transactionsTable, {
    fields: [ledgersTable.transactionId],
    references: [transactionsTable.id],
  }),

  ledgerMaster: one(ledgerMastersTable, {
    fields: [ledgersTable.ledgerMasterId],
    references: [ledgerMastersTable.id],
  }),
}));
