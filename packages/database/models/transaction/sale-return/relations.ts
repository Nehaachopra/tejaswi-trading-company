import { relations } from "drizzle-orm";

import { productGodownsTable } from "../../godown/product-godown";
import { saleProductsTable } from "../sale/sale-product";
import { salesTable } from "../sale/sale";
import { saleReturnsTable } from "./sale-return";
import { saleReturnProductsTable } from "./sale-return-product";
import { transactionsTable } from "../transaction";

export const saleReturnsRelations = relations(saleReturnsTable, ({ one, many }) => ({
  transaction: one(transactionsTable, {
    fields: [saleReturnsTable.transactionId],
    references: [transactionsTable.id],
  }),

  sale: one(salesTable, {
    fields: [saleReturnsTable.saleId],
    references: [salesTable.id],
  }),

  saleReturnProducts: many(saleReturnProductsTable),
}));

export const saleReturnProductsRelations = relations(saleReturnProductsTable, ({ one }) => ({
  saleReturn: one(saleReturnsTable, {
    fields: [saleReturnProductsTable.returnId],
    references: [saleReturnsTable.id],
  }),

  saleProduct: one(saleProductsTable, {
    fields: [saleReturnProductsTable.saleProductId],
    references: [saleProductsTable.id],
  }),

  productGodown: one(productGodownsTable, {
    fields: [saleReturnProductsTable.productGodownId],
    references: [productGodownsTable.id],
  }),
}));
