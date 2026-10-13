// product.ts

import { boolean, integer, pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

import { categoriesTable } from "./category";
import { subCategoriesTable } from "./sub-category";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

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

    name: varchar("name", { length: 50 }).notNull(),

    unitQuantityCode: unitQuantityCodeEnum("unit_quantity_code").notNull(),

    unitQuantity: integer("unit_quantity").notNull(),

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
    check("products_unit_quantity_positive", sql`${table.unitQuantity} > 0`),

    check("products_quantity_non_negative", sql`${table.quantity} >= 0`),

    check("products_reserved_quantity_non_negative", sql`${table.reservedQuantity} >= 0`),

    check("products_quantity_consistent", sql`${table.quantity} = ${table.reservedQuantity} + ${table.unreservedQuantity}`),
  ],
);

export type ProductsType = typeof productsTable.$inferSelect;

export type InsertProductsType = typeof productsTable.$inferInsert;
