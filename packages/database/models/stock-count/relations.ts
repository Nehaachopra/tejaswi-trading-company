import { relations } from "drizzle-orm";

import { usersTable } from "../auth/user";
import { productsTable } from "../product/product";
import { godownsTable } from "../godown/godown";
import { transactionsTable } from "../transaction/transaction";
import { stockCountsTable } from "./stock-count";
import { stockCountGodownsTable } from "./stock-count-godown";
import { stockCountProductsTable } from "./stock-count-product";

export const stockCountsRelations = relations(stockCountsTable, ({ one, many }) => ({
  countedByUser: one(usersTable, {
    fields: [stockCountsTable.countedBy],
    references: [usersTable.id],
  }),

  stockCountGodowns: many(stockCountGodownsTable),
  stockCountProducts: many(stockCountProductsTable),
}));

export const stockCountGodownsRelations = relations(stockCountGodownsTable, ({ one }) => ({
  stockCount: one(stockCountsTable, {
    fields: [stockCountGodownsTable.stockCountId],
    references: [stockCountsTable.id],
  }),

  godown: one(godownsTable, {
    fields: [stockCountGodownsTable.godownId],
    references: [godownsTable.id],
  }),
}));

export const stockCountProductsRelations = relations(stockCountProductsTable, ({ one }) => ({
  stockCount: one(stockCountsTable, {
    fields: [stockCountProductsTable.stockCountId],
    references: [stockCountsTable.id],
  }),

  godown: one(godownsTable, {
    fields: [stockCountProductsTable.godownId],
    references: [godownsTable.id],
  }),

  product: one(productsTable, {
    fields: [stockCountProductsTable.productId],
    references: [productsTable.id],
  }),

  approvedByUser: one(usersTable, {
    fields: [stockCountProductsTable.approvedById],
    references: [usersTable.id],
  }),

  transaction: one(transactionsTable, {
    fields: [stockCountProductsTable.transactionId],
    references: [transactionsTable.id],
  }),
}));
