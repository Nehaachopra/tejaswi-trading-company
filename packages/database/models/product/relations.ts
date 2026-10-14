import { relations } from "drizzle-orm";

import { categoriesTable } from "./category";
import { subCategoriesTable } from "./sub-category";
import { productsTable } from "./product";
import { productPricesTable } from "./product-price";
import { stockCountProductsTable } from "../stock-count/stock-count-product";
import { productGodownsTable } from "../godown/product-godown";
import { purchaseOrderProductsTable } from "../order/purchase/purchase-order-product";
import { saleOrderProductsTable } from "../order/sale/sale-order-product";
import { purchaseProductsTable } from "../transaction/purchase/purchase-product";
import { saleProductsTable } from "../transaction/sale/sale-product";
import { drawingProductsTable } from "../transaction/drawing/drawing-product";

export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  subCategories: many(subCategoriesTable),
  products: many(productsTable),
}));

export const subCategoriesRelations = relations(subCategoriesTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [subCategoriesTable.categoryId],
    references: [categoriesTable.id],
  }),

  products: many(productsTable),
}));

export const productsRelations = relations(productsTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [productsTable.categoryId],
    references: [categoriesTable.id],
  }),

  subCategory: one(subCategoriesTable, {
    fields: [productsTable.subCategoryId],
    references: [subCategoriesTable.id],
  }),

  productPrices: many(productPricesTable),
  stockCountProducts: many(stockCountProductsTable),
  productGodowns: many(productGodownsTable),
  purchaseOrderProducts: many(purchaseOrderProductsTable),
  saleOrderProducts: many(saleOrderProductsTable),
  purchaseProducts: many(purchaseProductsTable),
  saleProducts: many(saleProductsTable),
  drawingProducts: many(drawingProductsTable),
}));

export const productPricesRelations = relations(productPricesTable, ({ one }) => ({
  product: one(productsTable, {
    fields: [productPricesTable.productId],
    references: [productsTable.id],
  }),
}));
