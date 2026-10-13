import { relations } from "drizzle-orm";

import { user } from "../../auth";
import { partiesTable } from "../../party/party";
import { partyAddressesTable } from "../../party/party-address";
import { productGodownsTable } from "../../godown/product-godown";
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

  order: one(purchaseOrdersTable, {
    fields: [purchasesTable.orderId],
    references: [purchaseOrdersTable.orderId],
  }),

  purchaseProducts: many(purchaseProductsTable),
}));

export const purchaseProductsRelations = relations(purchaseProductsTable, ({ one }) => ({
  purchase: one(purchasesTable, {
    fields: [purchaseProductsTable.purchaseId],
    references: [purchasesTable.id],
  }),

  productGodown: one(productGodownsTable, {
    fields: [purchaseProductsTable.productGodownId],
    references: [productGodownsTable.id],
  }),

  partyAddress: one(partyAddressesTable, {
    fields: [purchaseProductsTable.partyAddressId],
    references: [partyAddressesTable.id],
  }),

  orderedByUser: one(user, {
    fields: [purchaseProductsTable.godownName],
    references: [user.id],
  }),
}));
