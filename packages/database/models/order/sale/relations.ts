import { relations } from "drizzle-orm";

import { usersTable } from "../../auth/user";
import { partiesTable } from "../../party/party";
import { productsTable } from "../../product/product";
import { salesTable } from "../../transaction/sale/sale";
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
  sales: many(salesTable),
}));

export const saleOrderProductsRelations = relations(saleOrderProductsTable, ({ one }) => ({
  saleOrder: one(saleOrdersTable, {
    fields: [saleOrderProductsTable.saleOrderId],
    references: [saleOrdersTable.id],
  }),

  product: one(productsTable, {
    fields: [saleOrderProductsTable.productId],
    references: [productsTable.id],
  }),
}));
