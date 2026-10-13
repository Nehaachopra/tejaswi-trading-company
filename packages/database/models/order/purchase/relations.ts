import { relations } from "drizzle-orm";

import { user } from "../../auth";
import { partiesTable } from "../../party/party";
import { partyAddressesTable } from "../../party/party-address";
import { productsTable } from "../../product/product";
import { purchasesTable } from "../../transaction/purchase/purchase";
import { purchaseOrderDeliveriesTable } from "./purchase-order-delivery";
import { purchaseOrderProductsTable } from "./purchase-order-product";
import { purchaseOrdersTable } from "./purchase-order";

export const purchaseOrdersRelations = relations(purchaseOrdersTable, ({ one, many }) => ({
  party: one(partiesTable, {
    fields: [purchaseOrdersTable.partyId],
    references: [partiesTable.id],
  }),

  orderedByUser: one(user, {
    fields: [purchaseOrdersTable.orderedById],
    references: [user.id],
  }),

  purchaseOrderProducts: many(purchaseOrderProductsTable),
  purchaseOrderDeliveries: many(purchaseOrderDeliveriesTable),
  purchases: many(purchasesTable),
}));

export const purchaseOrderProductsRelations = relations(purchaseOrderProductsTable, ({ one, many }) => ({
  purchaseOrder: one(purchaseOrdersTable, {
    fields: [purchaseOrderProductsTable.purchaseOrderId],
    references: [purchaseOrdersTable.id],
  }),

  product: one(productsTable, {
    fields: [purchaseOrderProductsTable.productId],
    references: [productsTable.id],
  }),

  partyAddress: one(partyAddressesTable, {
    fields: [purchaseOrderProductsTable.partyAddressId],
    references: [partyAddressesTable.id],
  }),

  purchaseOrderDeliveries: many(purchaseOrderDeliveriesTable),
}));

export const purchaseOrderDeliveriesRelations = relations(purchaseOrderDeliveriesTable, ({ one }) => ({
  orderProduct: one(purchaseOrderProductsTable, {
    fields: [purchaseOrderDeliveriesTable.orderProductId],
    references: [purchaseOrderProductsTable.id],
  }),

  orderedByUser: one(user, {
    fields: [purchaseOrderDeliveriesTable.orderedById],
    references: [user.id],
  }),
}));
