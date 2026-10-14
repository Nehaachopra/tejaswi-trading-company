import { relations } from "drizzle-orm";

import { usersTable } from "../auth/user";
import { productsTable } from "../product/product";
import { godownsTable } from "../godown/godown";
import { stockCountsTable } from "./stock-count";
import { stockCountProductsTable } from "./stock-count-product";

export const stockCountsRelations = relations(stockCountsTable, ({ one, many }) => ({
  countedByUser: one(usersTable, {
    fields: [stockCountsTable.countedBy],
    references: [usersTable.id],
  }),

  stockCountProducts: many(stockCountProductsTable),
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
}));
