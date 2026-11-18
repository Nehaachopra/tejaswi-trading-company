// deleted-product.ts

import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { money, timestamps } from "../../utils/common/column-type";

import { unitQuantityCodeEnum } from "./product";

// a pack size deleted from the products page: moved here from products, same id, so old purchases, sales, orders,
// stock moves and counts still find what it was. Nothing else points to its category and sub-category: they're
// kept here as names, so an emptied category can go without this row holding it in place
export const deletedProductsTable = pgTable("deleted_products", {
  // the id it had in products
  id: uuid("id").primaryKey(),

  // its category and sub-category as they were, ids for reference only (no link) and their names
  categoryId: uuid("category_id").notNull(),
  categoryName: varchar("category_name", { length: 50 }).notNull(),
  subCategoryId: uuid("sub_category_id").notNull(),
  subCategoryName: varchar("sub_category_name", { length: 50 }).notNull(),

  brand: varchar("brand", { length: 50 }).notNull(),
  name: varchar("name", { length: 50 }),
  packSizeCode: unitQuantityCodeEnum("pack_size_code").notNull(),
  packSize: integer("pack_size").notNull(),
  packCount: integer("pack_count").notNull().default(1),
  hsn4Digit: varchar("hsn_4_digit", { length: 4 }),
  hsn8Digit: varchar("hsn_8_digit", { length: 8 }),
  imageUrl: text("image_url"),

  // what it had come to when deleted
  quantitySold: integer("quantity_sold").notNull().default(0),
  weightedAverageCost: money("weighted_average_cost"),

  // when it was deleted, and its own created / updated times carried over
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

export type DeletedProductsType = typeof deletedProductsTable.$inferSelect;

export type InsertDeletedProductsType = typeof deletedProductsTable.$inferInsert;
