// product_godowns/relations.ts

import { relations } from "drizzle-orm";

import { productGodownsTable } from "./product-godown";
import { godownsTable } from "./godown";
import { productsTable } from "../product/product";
import { partiesTable } from "../party/party";
import { usersTable } from "../auth/user";
import { stockMovesTable } from "./stock-move";

export const productGodownsRelations = relations(
  productGodownsTable,
  ({ one }) => ({
    godown: one(godownsTable, {
      fields: [productGodownsTable.godownId],
      references: [godownsTable.id],
    }),

    product: one(productsTable, {
      fields: [productGodownsTable.productId],
      references: [productsTable.id],
    }),
  }),
);

export const godownsRelations = relations(
  godownsTable,
  ({ one, many }) => ({
    landlord: one(partiesTable, {
      fields: [godownsTable.landlordId],
      references: [partiesTable.id],
    }),

    productGodowns: many(productGodownsTable),
    movesOut: many(stockMovesTable, { relationName: "stock_move_from_godown" }),
    movesIn: many(stockMovesTable, { relationName: "stock_move_to_godown" }),
  }),
);

export const stockMovesRelations = relations(stockMovesTable, ({ one }) => ({
  product: one(productsTable, {
    fields: [stockMovesTable.productId],
    references: [productsTable.id],
  }),

  fromGodown: one(godownsTable, {
    fields: [stockMovesTable.fromGodownId],
    references: [godownsTable.id],
    relationName: "stock_move_from_godown",
  }),

  toGodown: one(godownsTable, {
    fields: [stockMovesTable.toGodownId],
    references: [godownsTable.id],
    relationName: "stock_move_to_godown",
  }),

  movedByUser: one(usersTable, {
    fields: [stockMovesTable.movedById],
    references: [usersTable.id],
  }),
}));