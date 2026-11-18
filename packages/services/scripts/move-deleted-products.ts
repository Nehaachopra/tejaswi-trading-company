// once, after the deleted_products migration: the pack sizes deleted the old way (still in products, marked
// deleted_at) move to deleted_products, as a delete now does; then each sub-category and category with no product
// left is removed. Prints what it moved and removed. Safe to run again (nothing left to move does nothing).
//   dotenv -e ../../.env -- tsx scripts/move-deleted-products.ts

import { db, eq, inArray, isNotNull, isNull } from "@repo/database";
import {
  categoriesTable,
  deletedProductsTable,
  productPricesTable,
  productsTable,
  subCategoriesTable,
} from "@repo/database/schema";

async function main() {
  await db.transaction(async (tx) => {
    // the old-way deleted pack sizes, with their category and sub-category names
    const rows = await tx
      .select({ p: productsTable, categoryName: categoriesTable.name, subCategoryName: subCategoriesTable.name })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .innerJoin(subCategoriesTable, eq(subCategoriesTable.id, productsTable.subCategoryId))
      .where(isNotNull(productsTable.deletedAt));
    const ids = rows.map((r) => r.p.id);

    // moved: the row to deleted_products, its current price gone
    if (ids.length > 0) {
      await tx.insert(deletedProductsTable).values(
        rows.map(({ p, categoryName, subCategoryName }) => ({
          id: p.id,
          categoryId: p.categoryId,
          categoryName,
          subCategoryId: p.subCategoryId,
          subCategoryName,
          brand: p.brand,
          name: p.name,
          packSizeCode: p.packSizeCode,
          packSize: p.packSize,
          packCount: p.packCount,
          hsn4Digit: p.hsn4Digit,
          hsn8Digit: p.hsn8Digit,
          imageUrl: p.imageUrl,
          quantitySold: p.quantitySold,
          weightedAverageCost: p.weightedAverageCost,
          deletedAt: p.deletedAt!,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      );
      await tx.delete(productPricesTable).where(inArray(productPricesTable.productId, ids));
      await tx.delete(productsTable).where(inArray(productsTable.id, ids));
    }
    console.log(`moved ${ids.length} pack size(s):`, rows.map((r) => `${r.p.brand} ${r.p.packSize} ${r.p.packSizeCode}`));

    // the sub-categories and categories those leave with no product: removed
    const live = await tx
      .select({ sub: productsTable.subCategoryId, cat: productsTable.categoryId })
      .from(productsTable)
      .where(isNull(productsTable.deletedAt));
    const usedSubs = new Set(live.map((l) => l.sub));
    const usedCats = new Set(live.map((l) => l.cat));
    const emptiedSubs = [...new Set(rows.map((r) => r.p.subCategoryId))].filter((id) => !usedSubs.has(id));
    const emptiedCats = [...new Set(rows.map((r) => r.p.categoryId))].filter((id) => !usedCats.has(id));
    if (emptiedSubs.length > 0) await tx.delete(subCategoriesTable).where(inArray(subCategoriesTable.id, emptiedSubs));
    for (const id of emptiedCats) {
      await tx.delete(subCategoriesTable).where(eq(subCategoriesTable.categoryId, id));
      await tx.delete(categoriesTable).where(eq(categoriesTable.id, id));
    }
    console.log(`removed ${emptiedSubs.length} sub-category(ies) and ${emptiedCats.length} category(ies)`);
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
