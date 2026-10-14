import { relations } from "drizzle-orm";

import { usersTable } from "../../auth/user";
import { partiesTable } from "../../party/party";
import { partyAddressesTable } from "../../party/party-address";
import { productsTable } from "../../product/product";
import { salesTable } from "../../transaction/sale/sale";
import { saleOrderDeliveriesTable } from "./sale-order-delivery";
import { saleOrderProductsTable } from "./sale-order-product";
import { saleOrdersTable } from "./sale-order";

export const saleOrdersRelations = relations(saleOrdersTable, ({ one, many }) => ({
  party: one(partiesTable, {
    fields: [saleOrdersTable.partyId],
    references: [partiesTable.id],
  }),

  orderedByUser: one(usersTable, {
    fields: [saleOrdersTable.orderedById],
    references: [usersTable.id],
  }),

  saleOrderProducts: many(saleOrderProductsTable),
  saleOrderDeliveries: many(saleOrderDeliveriesTable),
  sales: many(salesTable),
}));

export const saleOrderProductsRelations = relations(saleOrderProductsTable, ({ one, many }) => ({
  saleOrder: one(saleOrdersTable, {
    fields: [saleOrderProductsTable.saleOrderId],
    references: [saleOrdersTable.id],
  }),

  product: one(productsTable, {
    fields: [saleOrderProductsTable.productId],
    references: [productsTable.id],
  }),

  partyAddress: one(partyAddressesTable, {
    fields: [saleOrderProductsTable.partyAddressId],
    references: [partyAddressesTable.id],
  }),

  saleOrderDeliveries: many(saleOrderDeliveriesTable),
}));

export const saleOrderDeliveriesRelations = relations(saleOrderDeliveriesTable, ({ one }) => ({
  orderProduct: one(saleOrderProductsTable, {
    fields: [saleOrderDeliveriesTable.orderProductId],
    references: [saleOrderProductsTable.id],
  }),

  orderedByUser: one(usersTable, {
    fields: [saleOrderDeliveriesTable.orderedById],
    references: [usersTable.id],
  }),
}));
