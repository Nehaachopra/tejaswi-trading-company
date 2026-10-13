import { relations } from "drizzle-orm";

import { partiesTable } from "../../party/party";
import { partyAddressesTable } from "../../party/party-address";
import { productGodownsTable } from "../../godown/product-godown";
import { productsTable } from "../../product/product";
import { saleOrdersTable } from "../../order/sale/sale-order";
import { transactionsTable } from "../transaction";
import { saleCreditDetailsTable } from "./sale-credit-detail";
import { saleProductsTable } from "./sale-product";
import { salesTable } from "./sale";

export const salesRelations = relations(salesTable, ({ one, many }) => ({
  transaction: one(transactionsTable, {
    fields: [salesTable.transactionId],
    references: [transactionsTable.id],
  }),

  party: one(partiesTable, {
    fields: [salesTable.partyId],
    references: [partiesTable.id],
  }),

  order: one(saleOrdersTable, {
    fields: [salesTable.orderId],
    references: [saleOrdersTable.orderId],
  }),

  saleProducts: many(saleProductsTable),
  saleCreditDetails: many(saleCreditDetailsTable),
}));

export const saleProductsRelations = relations(saleProductsTable, ({ one }) => ({
  sale: one(salesTable, {
    fields: [saleProductsTable.saleId],
    references: [salesTable.id],
  }),

  product: one(productsTable, {
    fields: [saleProductsTable.productId],
    references: [productsTable.id],
  }),

  partyAddress: one(partyAddressesTable, {
    fields: [saleProductsTable.partyAddressId],
    references: [partyAddressesTable.id],
  }),

  productGodown: one(productGodownsTable, {
    fields: [saleProductsTable.productGodownId],
    references: [productGodownsTable.id],
  }),
}));

export const saleCreditDetailsRelations = relations(saleCreditDetailsTable, ({ one }) => ({
  transaction: one(transactionsTable, {
    fields: [saleCreditDetailsTable.transactionId],
    references: [transactionsTable.id],
  }),
}));
