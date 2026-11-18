import { sql } from "@repo/database";
import { categoriesTable, deletedProductsTable, productsTable } from "@repo/database/schema";

type Code = "KGS" | "LTR" | "BOX" | "PCS";

// an old line's pack size, still listed (products) or deleted (moved to deleted_products, same id): read from
// whichever has it. Use with both tables left-joined on the line's product id, and categories left-joined on
// products.category_id for the category's name
export const anyProduct = {
  brand: sql<string>`coalesce(${productsTable.brand}, ${deletedProductsTable.brand})`,
  name: sql<string | null>`coalesce(${productsTable.name}, ${deletedProductsTable.name})`,
  packSize: sql<number>`coalesce(${productsTable.packSize}, ${deletedProductsTable.packSize})`.mapWith(Number),
  packCount: sql<number>`coalesce(${productsTable.packCount}, ${deletedProductsTable.packCount})`.mapWith(Number),
  packSizeCode: sql<Code>`coalesce(${productsTable.packSizeCode}, ${deletedProductsTable.packSizeCode})`,
  hsn4Digit: sql<string | null>`coalesce(${productsTable.hsn4Digit}, ${deletedProductsTable.hsn4Digit})`,
  hsn8Digit: sql<string | null>`coalesce(${productsTable.hsn8Digit}, ${deletedProductsTable.hsn8Digit})`,
  categoryName: sql<string>`coalesce(${categoriesTable.name}, ${deletedProductsTable.categoryName})`,
};
