import { relations } from "drizzle-orm";

import { usersTable } from "../auth/user";
import { ledgerEntriesTable } from "../accounting/ledger-entry";
import { depositsTable } from "./deposit";
import { drawingsTable } from "./drawing/drawing";
import { drawingProductsTable } from "./drawing/drawing-product";
import { othersTable } from "./other";
import { paymentsTable } from "./payment";
import { purchasesTable } from "./purchase/purchase";
import { purchaseReturnsTable } from "./purchase-return/purchase-return";
import { receiptsTable } from "./receipt";
import { saleCreditDetailsTable } from "./sale/sale-credit-detail";
import { salesTable } from "./sale/sale";
import { saleReturnsTable } from "./sale-return/sale-return";
import { transactionsTable } from "./transaction";
import { withdrawalsTable } from "./withdrawal";

export const transactionsRelations = relations(transactionsTable, ({ one, many }) => ({
  createdByIdUser: one(usersTable, {
    fields: [transactionsTable.createdById],
    references: [usersTable.id],
  }),

  purchases: many(purchasesTable),
  sales: many(salesTable),
  purchaseReturns: many(purchaseReturnsTable),
  saleReturns: many(saleReturnsTable),
  payments: many(paymentsTable),
  receipts: many(receiptsTable),
  drawings: many(drawingsTable),
  deposits: many(depositsTable),
  withdrawals: many(withdrawalsTable),
  others: many(othersTable),
  saleCreditDetails: many(saleCreditDetailsTable),
  drawingProducts: many(drawingProductsTable),
  ledgerEntries: many(ledgerEntriesTable),
}));
