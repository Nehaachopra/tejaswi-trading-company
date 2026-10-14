// product.ts

import { boolean, integer, pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { categoriesTable } from "./category";
import { subCategoriesTable } from "./sub-category";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";

export const unitQuantityCodeEnum = pgEnum("unit_quantity_code_enum", ["KGS", "ML", "BOX", "PCS"]);

export const productsTable = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    categoryId: uuid("category_id")
      .notNull()
      .references(() => categoriesTable.id, {
        onDelete: "restrict",
      }),

    subCategoryId: uuid("sub_category_id")
      .notNull()
      .references(() => subCategoriesTable.id, {
        onDelete: "restrict",
      }),

    // e.g. rice → sona masoori → aishwarya
    brand: varchar("brand", { length: 50 }).notNull(),

    // residual: only when category, sub-category and brand don't fully describe the product
    name: varchar("name", { length: 50 }),

    packSizeCode: unitQuantityCodeEnum("pack_size_code").notNull(),

    packSize: integer("pack_size").notNull(),

    hsn4Digit: varchar("hsn_4_digit", {
      length: 4,
    }),

    hsn8Digit: varchar("hsn_8_digit", {
      length: 8,
    }),

    imageUrl: text("image_url"),

    quantity: integer("quantity").notNull().default(0),

    reservedQuantity: integer("reserved_quantity").notNull().default(0),

    unreservedQuantity: integer("unreserved_quantity").notNull().default(0),

    isActive: boolean("is_active").default(true).notNull(),

    ...timestamps,
  },
  (table) => [
    index("products_category_id_idx").on(table.categoryId),
    index("products_sub_category_id_idx").on(table.subCategoryId),
    uniqueIndex("products_identity_unique").on(
      table.subCategoryId,
      table.brand,
      sql`coalesce(${table.name}, '')`,
      table.packSizeCode,
      table.packSize,
    ),
    check("products_brand_lowercase", sql`${table.brand} = lower(${table.brand})`),
    check("products_name_lowercase", sql`${table.name} = lower(${table.name})`),
    check("products_unit_quantity_positive", sql`${table.packSize} > 0`),

    check("products_quantity_non_negative", sql`${table.quantity} >= 0`),

    check("products_reserved_quantity_non_negative", sql`${table.reservedQuantity} >= 0`),

    check("products_quantity_consistent", sql`${table.quantity} = ${table.reservedQuantity} + ${table.unreservedQuantity}`),
  ],
);

export type ProductsType = typeof productsTable.$inferSelect;

export type InsertProductsType = typeof productsTable.$inferInsert;
