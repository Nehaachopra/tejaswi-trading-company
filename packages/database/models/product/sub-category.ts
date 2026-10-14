// sub_category.ts

import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { categoriesTable } from "./category";
import { timestamps } from "../../utils/common/column-type";
import { boolean } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const subCategoriesTable = pgTable(
  "sub_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    categoryId: uuid("category_id")
      .notNull()
      .references(() => categoriesTable.id, {
        onDelete: "restrict",
      }),

    name: varchar("name", { length: 50 }).notNull(),

    isActive: boolean("is_active").notNull().default(true),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("sub_categories_name_unique").on(table.categoryId, sql`lower(${table.name})`),
    check("sub_categories_name_lowercase", sql`${table.name} = lower(${table.name})`),
  ],
);

export type SubCategoriesType = typeof subCategoriesTable.$inferSelect;

export type InsertSubCategoriesType = typeof subCategoriesTable.$inferInsert;
