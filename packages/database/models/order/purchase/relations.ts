import { relations } from "drizzle-orm";

import { usersTable } from "../../auth/user";
import { partiesTable } from "../../party/party";
import { productsTable } from "../../product/product";
import { purchasesTable } from "../../transaction/purchase/purchase";
import { purchaseOrderProductsTable } from "./purchase-order-product";
import { purchaseOrdersTable } from "./purchase-order";
import { productGodownsTable } from "../../godown/product-godown";

export const purchaseOrdersRelations = relations(purchaseOrdersTable, ({ one, many }) => ({
  party: one(partiesTable, {
    fields: [purchaseOrdersTable.partyId],
    references: [partiesTable.id],
  }),

  orderedByUser: one(usersTable, {
    fields: [purchaseOrdersTable.orderedById],
    references: [usersTable.id],
  }),

  purchaseOrderProducts: many(purchaseOrderProductsTable),
  purchases: many(purchasesTable),
}));

export const purchaseOrderProductsRelations = relations(purchaseOrderProductsTable, ({ one }) => ({
  purchaseOrder: one(purchaseOrdersTable, {
    fields: [purchaseOrderProductsTable.purchaseOrderId],
    references: [purchaseOrdersTable.id],
  }),

  product: one(productsTable, {
    fields: [purchaseOrderProductsTable.productId],
    references: [productsTable.id],
  }),
}));
