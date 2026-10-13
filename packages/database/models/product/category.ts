import { sql } from "drizzle-orm";
import { pgTable, varchar, uuid, boolean, uniqueIndex } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

export const categoriesTable = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: varchar("name", { length: 50 }).notNull(),

    isActive: boolean("is_active").notNull().default(true),

    ...timestamps,
  },
  (table) => [uniqueIndex("categories_name_unique").on(sql`lower(${table.name})`)],
);

export type CategoriesType = typeof categoriesTable.$inferSelect;

export type InsertCategoriesType = typeof categoriesTable.$inferInsert;
