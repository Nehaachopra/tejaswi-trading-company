// sub-category-type.ts

import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, boolean, uniqueIndex } from "drizzle-orm/pg-core";

import { subCategoriesTable } from "./sub-category";
import { timestamps } from "../../utils/common/column-type";

export const subCategoryTypesTable = pgTable(
  "sub_category_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    subCategoryId: uuid("sub_category_id")
      .notNull()
      .references(() => subCategoriesTable.id, {
        onDelete: "restrict",
      }),

    name: varchar("name", { length: 50 }).notNull(),

    isActive: boolean("is_active").notNull().default(true),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("sub_category_types_parent_name_unique").on(
      table.subCategoryId,
      sql`lower(trim(${table.name}))`,
    ),
  ],
);

export type SubCategoryTypesType = typeof subCategoryTypesTable.$inferSelect;

export type InsertSubCategoryTypesType = typeof subCategoryTypesTable.$inferInsert;
