import { relations } from "drizzle-orm";

import { partiesTable } from "../../party/party";
import { partyAddressesTable } from "../../party/party-address";
import { productGodownsTable } from "../../godown/product-godown";
import { productsTable } from "../../product/product";
import { purchaseOrdersTable } from "../../order/purchase/purchase-order";
import { purchasesTable } from "./purchase";
import { purchaseProductsTable } from "./purchase-product";
import { transactionsTable } from "../transaction";

export const purchasesRelations = relations(purchasesTable, ({ one, many }) => ({
  transaction: one(transactionsTable, {
    fields: [purchasesTable.transactionId],
    references: [transactionsTable.id],
  }),

  party: one(partiesTable, {
    fields: [purchasesTable.partyId],
    references: [partiesTable.id],
  }),

  billFromAddress: one(partyAddressesTable, {
    fields: [purchasesTable.billFromAddressId],
    references: [partyAddressesTable.id],
  }),

  order: one(purchaseOrdersTable, {
    fields: [purchasesTable.orderId],
    references: [purchaseOrdersTable.id],
  }),

  purchaseProducts: many(purchaseProductsTable),
}));

export const purchaseProductsRelations = relations(purchaseProductsTable, ({ one }) => ({
  purchase: one(purchasesTable, {
    fields: [purchaseProductsTable.purchaseId],
    references: [purchasesTable.id],
  }),

  product: one(productsTable, {
    fields: [purchaseProductsTable.productId],
    references: [productsTable.id],
  }),

  productGodown: one(productGodownsTable, {
    fields: [purchaseProductsTable.productGodownId],
    references: [productGodownsTable.id],
  }),
}));
