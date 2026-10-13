import { relations } from "drizzle-orm";

import { bankDetailsTable } from "../../bank-detail";
import { productGodownsTable } from "../../godown/product-godown";
import { transactionsTable } from "../transaction";
import { drawingProductsTable } from "./drawing-product";
import { drawingsTable } from "./drawing";

export const drawingsRelations = relations(drawingsTable, ({ one, many }) => ({
  transaction: one(transactionsTable, {
    fields: [drawingsTable.transactionId],
    references: [transactionsTable.id],
  }),

  bankDetails: one(bankDetailsTable, {
    fields: [drawingsTable.bankDetailsId],
    references: [bankDetailsTable.id],
  }),

  drawingProducts: many(drawingProductsTable),
}));

export const drawingProductsRelations = relations(drawingProductsTable, ({ one }) => ({
  drawing: one(drawingsTable, {
    fields: [drawingProductsTable.drawingId],
    references: [drawingsTable.id],
  }),

  productGodown: one(productGodownsTable, {
    fields: [drawingProductsTable.productGodownId],
    references: [productGodownsTable.id],
  }),
}));
