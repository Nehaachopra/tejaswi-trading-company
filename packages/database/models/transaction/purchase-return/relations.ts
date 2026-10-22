import { relations } from "drizzle-orm";

import { productGodownsTable } from "../../godown/product-godown";
import { purchaseReturnsTable } from "./purchase-return";
import { purchaseReturnProductsTable } from "./purchase-return-product";
import { purchasesTable } from "../purchase/purchase";
import { purchaseProductsTable } from "../purchase/purchase-product";
import { transactionsTable } from "../transaction";

export const purchaseReturnsRelations = relations(purchaseReturnsTable, ({ one, many }) => ({
  transaction: one(transactionsTable, {
    fields: [purchaseReturnsTable.transactionId],
    references: [transactionsTable.id],
  }),

  purchase: one(purchasesTable, {
    fields: [purchaseReturnsTable.purchaseId],
    references: [purchasesTable.id],
  }),

  purchaseReturnProducts: many(purchaseReturnProductsTable),
}));

export const purchaseReturnProductsRelations = relations(purchaseReturnProductsTable, ({ one }) => ({
  purchaseReturn: one(purchaseReturnsTable, {
    fields: [purchaseReturnProductsTable.returnId],
    references: [purchaseReturnsTable.id],
  }),

  purchaseProduct: one(purchaseProductsTable, {
    fields: [purchaseReturnProductsTable.purchaseProductId],
    references: [purchaseProductsTable.id],
  }),

  productGodown: one(productGodownsTable, {
    fields: [purchaseReturnProductsTable.productGodownId],
    references: [productGodownsTable.id],
  }),
}));
