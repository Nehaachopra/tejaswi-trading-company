// demo products under the existing categories and sub-categories, each pack size with about a year of
// price history, so the products page has something to show. Safe to run again: it skips pack sizes that
// already exist. `--remove` deletes everything it added (only these demo brands, never other products).
//   pnpm --filter @repo/database seed:demo
//   pnpm --filter @repo/database seed:demo --remove

import { and, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import {
  categoriesTable,
  productCostHistoryTable,
  productPriceHistoryTable,
  productPricesTable,
  productsTable,
  subCategoriesTable,
  usersTable,
} from "../schema";

type Pack = { size: number; perKg: number };
type Demo = { category: string; subCategory: string; brand: string; gst: number; packs: Pack[] };

// the demo catalogue: brand, then its pack sizes (KGS) with a starting price per kg (with GST)
const DEMO: Demo[] = [
  { category: "rice", subCategory: "sona masoori", brand: "india gate", gst: 5, packs: [{ size: 5, perKg: 72 }, { size: 10, perKg: 70 }, { size: 25, perKg: 66 }] },
  { category: "rice", subCategory: "sona masoori", brand: "lalitha", gst: 5, packs: [{ size: 10, perKg: 62 }, { size: 25, perKg: 58 }] },
  { category: "rice", subCategory: "sona masoori", brand: "bb royal", gst: 5, packs: [{ size: 5, perKg: 68 }, { size: 26, perKg: 60 }] },
  { category: "rice", subCategory: "jeera", brand: "daawat", gst: 5, packs: [{ size: 1, perKg: 118 }, { size: 5, perKg: 110 }] },
  { category: "rice", subCategory: "jeera", brand: "kohinoor", gst: 5, packs: [{ size: 1, perKg: 124 }, { size: 5, perKg: 116 }, { size: 10, perKg: 112 }] },
  { category: "sugar", subCategory: "fine", brand: "madhur", gst: 5, packs: [{ size: 1, perKg: 54 }, { size: 5, perKg: 51 }] },
  { category: "sugar", subCategory: "fine", brand: "uttam", gst: 5, packs: [{ size: 1, perKg: 52 }, { size: 5, perKg: 49 }] },
  { category: "sugar", subCategory: "normal", brand: "dhampur", gst: 5, packs: [{ size: 1, perKg: 46 }, { size: 50, perKg: 42 }] },
  { category: "sugar", subCategory: "normal", brand: "trust", gst: 5, packs: [{ size: 5, perKg: 45 }, { size: 25, perKg: 43 }] },
];
const BRANDS = [...new Set(DEMO.map((d) => d.brand))];

// a fixed random sequence, so every run gives the same demo numbers
let state = 42;
const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const money = (n: number) => n.toFixed(2);

// split a price with GST into before-GST and GST amount, keeping before + GST = after exactly
function split(after: number, gst: number) {
  const before = Math.round((after / (1 + gst / 100)) * 100) / 100;
  return { priceAfterGst: money(after), priceBeforeGst: money(before), gstAmount: money(after - before), gstPercent: money(gst) };
}

// remove: the demo brands' price and cost history, current prices, then the products
async function remove() {
  const ids = (await db.select({ id: productsTable.id }).from(productsTable).where(inArray(productsTable.brand, BRANDS))).map((r) => r.id);
  if (ids.length === 0) return console.log("No demo products to remove.");
  await db.transaction(async (tx) => {
    await tx.delete(productPriceHistoryTable).where(inArray(productPriceHistoryTable.productId, ids));
    await tx.delete(productCostHistoryTable).where(inArray(productCostHistoryTable.productId, ids));
    await tx.delete(productPricesTable).where(inArray(productPricesTable.productId, ids));
    await tx.delete(productsTable).where(inArray(productsTable.id, ids));
  });
  console.log(`Removed ${ids.length} demo pack sizes.`);
}

// seed: each pack size with 4 to 7 price changes over the last year, its current price, cost and stock
async function seed() {
  const [admin] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).limit(1);
  const now = Date.now();
  const yearAgo = now - 365 * 24 * 3600 * 1000;
  let added = 0;

  for (const demo of DEMO) {
    const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.name, demo.category));
    const [sub] = category
      ? await db.select().from(subCategoriesTable).where(and(eq(subCategoriesTable.categoryId, category.id), eq(subCategoriesTable.name, demo.subCategory)))
      : [];
    if (!category || !sub) {
      console.log(`Skipped ${demo.brand}: no ${demo.category} → ${demo.subCategory}.`);
      continue;
    }

    for (const pack of demo.packs) {
      // already there from an earlier run
      const existing = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(eq(productsTable.subCategoryId, sub.id), eq(productsTable.brand, demo.brand), eq(productsTable.packSize, pack.size), eq(productsTable.packSizeCode, "KGS")));
      if (existing.length) continue;

      // the price steps: a starting price, then small moves (mostly up), each on a later date
      const steps = 4 + Math.floor(random() * 4);
      const dates = Array.from({ length: steps }, (_, i) => yearAgo + ((now - yearAgo) * (i + random() * 0.6)) / steps).sort((a, b) => a - b);
      let price = Math.round(pack.perKg * pack.size * (0.9 + random() * 0.05));
      const history = dates.map((at) => {
        const row = { at, price };
        price = Math.max(1, Math.round(price * (1 + (random() * 0.09 - 0.03))));
        return row;
      });
      const current = history[history.length - 1]!;
      const currentSplit = split(current.price, demo.gst);

      // stock: some on hand, a little of it reserved
      const quantity = Math.floor(random() * 180);
      const reserved = Math.floor(quantity * random() * 0.3);
      const cost = Number(currentSplit.priceBeforeGst) * (0.86 + random() * 0.06);

      await db.transaction(async (tx) => {
        const [product] = await tx
          .insert(productsTable)
          .values({
            categoryId: category.id,
            subCategoryId: sub.id,
            brand: demo.brand,
            packSizeCode: "KGS",
            packSize: pack.size,
            hsn4Digit: demo.category === "rice" ? "1006" : "1701",
            quantity,
            reservedQuantity: reserved,
            unreservedQuantity: quantity - reserved,
            weightedAverageCost: money(cost),
            createdAt: new Date(history[0]!.at),
          })
          .returning({ id: productsTable.id });
        await tx.insert(productPricesTable).values({ productId: product!.id, ...currentSplit });
        await tx.insert(productPriceHistoryTable).values(
          history.map((h) => ({
            productId: product!.id,
            ...split(h.price, demo.gst),
            changedById: admin?.id ?? null,
            changedByName: admin?.name ?? "Demo",
            createdAt: new Date(h.at),
          })),
        );
      });
      added++;
    }
  }
  console.log(`Added ${added} demo pack sizes.`);
}

void (async () => {
  await (process.argv.includes("--remove") ? remove() : seed());
  process.exit(0);
})();
