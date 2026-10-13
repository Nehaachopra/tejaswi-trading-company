// product_godowns/relations.ts

import { relations } from "drizzle-orm";

import { productGodownsTable } from "./product-godown";
import { godownsTable } from "./godown";
import { productsTable } from "../product/product";
import { partiesTable } from "../party/party";

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
  }),
);