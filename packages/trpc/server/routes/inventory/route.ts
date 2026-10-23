import {
  categoryModel,
  createCategoryInputModel,
  createSubCategoryInputModel,
  deleteCategoryInputModel,
  deleteSubCategoryInputModel,
  listCategoriesInputModel,
  renameInputModel,
  setActiveInputModel,
} from "@repo/services/category/model";
import {
  createProductInputModel,
  deleteProductsInputModel,
  listProductsInputModel,
  priceHistoryInputModel,
  priceHistoryModel,
  productGroupModel,
  setProductsActiveInputModel,
  updateDetailsInputModel,
  updatePriceInputModel,
} from "@repo/services/product/model";
import {
  createGodownInputModel,
  godownIdInputModel,
  godownModel,
  godownSummaryModel,
  listGodownsInputModel,
  setGodownActiveInputModel,
  updateGodownInputModel,
} from "@repo/services/godown/model";
import {
  godownStockModel,
  listMovesInputModel,
  moveStockInputModel,
  productStockInputModel,
  productStockModel,
  stockMoveModel,
} from "@repo/services/stock/model";

import { z } from "../../schema";
import { adminProcedure, protectedProcedure, router } from "../../trpc";
import { categoryService, godownService, productService, stockService } from "../../services";

const categoryRowModel = z.object({ id: z.string().uuid(), name: z.string(), isActive: z.boolean() });

const subCategoryRowModel = categoryRowModel.extend({ categoryId: z.string().uuid() });

// categories and sub-categories come first: a product is always created under existing ones
const categoryRouter = router({
  list: adminProcedure
    .meta({ openapi: { method: "GET", path: "/inventory/categories", tags: ["inventory"] } })
    .input(listCategoriesInputModel)
    .output(z.array(categoryModel))
    .query(({ input }) => categoryService.list(input)),

  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/categories", tags: ["inventory"] } })
    .input(createCategoryInputModel)
    .output(categoryRowModel)
    .mutation(({ input }) => categoryService.createCategory(input)),

  rename: adminProcedure
    .meta({ openapi: { method: "PATCH", path: "/inventory/categories/{id}", tags: ["inventory"] } })
    .input(renameInputModel)
    .output(categoryRowModel)
    .mutation(({ input }) => categoryService.renameCategory(input)),

  setActive: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/categories/{id}/active", tags: ["inventory"] } })
    .input(setActiveInputModel)
    .output(categoryRowModel)
    .mutation(({ input }) => categoryService.setCategoryActive(input)),

  // only an empty category: no sub-categories and no products, active or not
  delete: adminProcedure
    .meta({ openapi: { method: "DELETE", path: "/inventory/categories/{id}", tags: ["inventory"] } })
    .input(deleteCategoryInputModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(({ input }) => categoryService.deleteCategory(input)),
});

const subCategoryRouter = router({
  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/sub-categories", tags: ["inventory"] } })
    .input(createSubCategoryInputModel)
    .output(subCategoryRowModel)
    .mutation(({ input }) => categoryService.createSubCategory(input)),

  rename: adminProcedure
    .meta({ openapi: { method: "PATCH", path: "/inventory/sub-categories/{id}", tags: ["inventory"] } })
    .input(renameInputModel)
    .output(subCategoryRowModel)
    .mutation(({ input }) => categoryService.renameSubCategory(input)),

  setActive: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/sub-categories/{id}/active", tags: ["inventory"] } })
    .input(setActiveInputModel)
    .output(subCategoryRowModel)
    .mutation(({ input }) => categoryService.setSubCategoryActive(input)),


  // only a sub-category without products, active or not
  delete: adminProcedure
    .meta({ openapi: { method: "DELETE", path: "/inventory/sub-categories/{id}", tags: ["inventory"] } })
    .input(deleteSubCategoryInputModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(({ input }) => categoryService.deleteSubCategory(input)),
});

// the product master; /product is admin only
const productRouter = router({
  list: adminProcedure
    .meta({ openapi: { method: "GET", path: "/inventory/products", tags: ["inventory"] } })
    .input(listProductsInputModel)
    .output(z.array(productGroupModel))
    .query(({ input }) => productService.list(input)),

  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/products", tags: ["inventory"] } })
    .input(createProductInputModel)
    .output(productGroupModel)
    .mutation(({ ctx, input }) => productService.create(input, ctx.session.user)),

  updatePrice: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/products/{productId}/price", tags: ["inventory"] } })
    .input(updatePriceInputModel)
    .output(
      z.object({
        productId: z.string().uuid(),
        priceAfterGst: z.number(),
        priceBeforeGst: z.number(),
        gstPercent: z.number(),
      }),
    )
    .mutation(({ ctx, input }) => productService.updatePrice(input, ctx.session.user)),

  priceHistory: adminProcedure
    .meta({ openapi: { method: "GET", path: "/inventory/products/{productId}/price-history", tags: ["inventory"] } })
    .input(priceHistoryInputModel)
    .output(priceHistoryModel)
    .query(({ input }) => productService.priceHistory(input)),

  // brand, name, category, sub-category and HSN, for all of a product's pack sizes
  updateDetails: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/products/details", tags: ["inventory"] } })
    .input(updateDetailsInputModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(({ input }) => productService.updateDetails(input)),

  setActive: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/products/active", tags: ["inventory"] } })
    .input(setProductsActiveInputModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(({ input }) => productService.setActive(input)),

  // only pack sizes nothing refers to yet
  delete: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/products/delete", tags: ["inventory"] } })
    .input(deleteProductsInputModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(({ input }) => productService.delete(input)),
});

// godowns: everyone sees the list (names and what they hold); only the admin adds, edits or deactivates
const godownRouter = router({
  list: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/inventory/godowns", tags: ["inventory"] } })
    .input(listGodownsInputModel)
    .output(z.array(godownSummaryModel))
    .query(({ input }) => godownService.list(input)),

  // with rent and landlord
  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/inventory/godowns/{id}", tags: ["inventory"] } })
    .input(godownIdInputModel)
    .output(godownModel)
    .query(({ input }) => godownService.get(input)),

  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/godowns", tags: ["inventory"] } })
    .input(createGodownInputModel)
    .output(godownModel)
    .mutation(({ input }) => godownService.create(input)),

  update: adminProcedure
    .meta({ openapi: { method: "PATCH", path: "/inventory/godowns/{id}", tags: ["inventory"] } })
    .input(updateGodownInputModel)
    .output(godownModel)
    .mutation(({ input }) => godownService.update(input)),

  // inactive only once it holds no stock and isn't being counted
  setActive: adminProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/godowns/{id}/active", tags: ["inventory"] } })
    .input(setGodownActiveInputModel)
    .output(godownModel)
    .mutation(({ input }) => godownService.setActive(input)),
});

// stock: /stock (godown cards) and moving stock are for admin and staff; one pack size's split
// across godowns (with reserved and free) belongs to the admin's Products page
const stockRouter = router({
  byGodown: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/inventory/stock", tags: ["inventory"] } })
    .input(z.void())
    .output(z.array(godownStockModel))
    .query(() => stockService.byGodown()),

  product: adminProcedure
    .meta({ openapi: { method: "GET", path: "/inventory/stock/products/{productId}", tags: ["inventory"] } })
    .input(productStockInputModel)
    .output(productStockModel)
    .query(({ input }) => stockService.product(input)),

  move: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/inventory/stock/moves", tags: ["inventory"] } })
    .input(moveStockInputModel)
    .output(stockMoveModel)
    .mutation(({ ctx, input }) => stockService.move(input, ctx.session.user)),

  moves: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/inventory/stock/moves", tags: ["inventory"] } })
    .input(listMovesInputModel)
    .output(z.array(stockMoveModel))
    .query(({ input }) => stockService.moves(input)),
});

export const inventoryRouter = router({
  category: categoryRouter,
  subCategory: subCategoryRouter,
  product: productRouter,
  godown: godownRouter,
  stock: stockRouter,
});
