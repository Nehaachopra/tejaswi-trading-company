import { relations } from "drizzle-orm";

import { partiesTable } from "../../party/party";
import { partyAddressesTable } from "../../party/party-address";
import { productGodownsTable } from "../../godown/product-godown";
import { productsTable } from "../../product/product";
import { saleOrdersTable } from "../../order/sale/sale-order";
import { transactionsTable } from "../transaction";
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

  billToAddress: one(partyAddressesTable, {
    fields: [salesTable.billToAddressId],
    references: [partyAddressesTable.id],
    relationName: "sale_bill_to_address",
  }),

  shipToAddress: one(partyAddressesTable, {
    fields: [salesTable.shipToAddressId],
    references: [partyAddressesTable.id],
    relationName: "sale_ship_to_address",
  }),

  order: one(saleOrdersTable, {
    fields: [salesTable.orderId],
    references: [saleOrdersTable.id],
  }),

  saleProducts: many(saleProductsTable),
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

  productGodown: one(productGodownsTable, {
    fields: [saleProductsTable.productGodownId],
    references: [productGodownsTable.id],
  }),
}));
