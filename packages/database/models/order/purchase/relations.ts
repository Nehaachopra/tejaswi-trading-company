import { relations } from "drizzle-orm";

import { usersTable } from "../../auth/user";
import { partiesTable } from "../../party/party";
import { partyAddressesTable } from "../../party/party-address";
import { productsTable } from "../../product/product";
import { purchasesTable } from "../../transaction/purchase/purchase";
import { purchaseOrderDeliveriesTable } from "./purchase-order-delivery";
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

  orderedByUser: one(usersTable, {
    fields: [purchaseOrderDeliveriesTable.orderedById],
    references: [usersTable.id],
  }),
}));
