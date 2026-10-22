import { relations } from "drizzle-orm";

import { usersTable } from "../auth/user";
import { ledgerEntriesTable } from "../accounting/ledger-entry";
import { contrasTable } from "./contra";
import { salariesTable } from "./salary/salary";
import { drawingsTable } from "./drawing/drawing";
import { drawingProductsTable } from "./drawing/drawing-product";
import { othersTable } from "./other";
import { paymentsTable } from "./payment";
import { purchasesTable } from "./purchase/purchase";
import { purchaseReturnsTable } from "./purchase-return/purchase-return";
import { receiptsTable } from "./receipt";
import { bankDetailsTable } from "../bank-detail";
import { salePurchaseCreditDetailsTable } from "./sale-purchase-credit-detail";
import { transactionPaymentsTable } from "./transaction-payment";
import { transactionEditLogsTable } from "./transaction-edit-log";
import { salesTable } from "./sale/sale";
import { saleReturnsTable } from "./sale-return/sale-return";
import { transactionsTable } from "./transaction";

export const transactionsRelations = relations(transactionsTable, ({ one, many }) => ({
  createdByIdUser: one(usersTable, {
    fields: [transactionsTable.createdById],
    references: [usersTable.id],
    relationName: "transaction_created_by",
  }),

  cancelledByUser: one(usersTable, {
    fields: [transactionsTable.cancelledById],
    references: [usersTable.id],
    relationName: "transaction_cancelled_by",
  }),

  editLogs: many(transactionEditLogsTable),

  purchases: many(purchasesTable),
  sales: many(salesTable),
  purchaseReturns: many(purchaseReturnsTable),
  saleReturns: many(saleReturnsTable),
  payments: many(paymentsTable),
  receipts: many(receiptsTable),
  drawings: many(drawingsTable),
  contras: many(contrasTable),
  salaries: many(salariesTable),
  others: many(othersTable),
  creditDetails: one(salePurchaseCreditDetailsTable),
  transactionPayments: many(transactionPaymentsTable),
  drawingProducts: many(drawingProductsTable),
  ledgerEntries: many(ledgerEntriesTable),
}));

export const transactionEditLogsRelations = relations(transactionEditLogsTable, ({ one }) => ({
  transaction: one(transactionsTable, {
    fields: [transactionEditLogsTable.transactionId],
    references: [transactionsTable.id],
  }),

  editedByUser: one(usersTable, {
    fields: [transactionEditLogsTable.editedById],
    references: [usersTable.id],
  }),
}));

export const transactionPaymentsRelations = relations(transactionPaymentsTable, ({ one }) => ({
  transaction: one(transactionsTable, {
    fields: [transactionPaymentsTable.transactionId],
    references: [transactionsTable.id],
  }),

  bankDetails: one(bankDetailsTable, {
    fields: [transactionPaymentsTable.bankDetailsId],
    references: [bankDetailsTable.id],
  }),
}));

export const salePurchaseCreditDetailsRelations = relations(salePurchaseCreditDetailsTable, ({ one }) => ({
  transaction: one(transactionsTable, {
    fields: [salePurchaseCreditDetailsTable.transactionId],
    references: [transactionsTable.id],
  }),
}));
