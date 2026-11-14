// demo purchase orders, so the Orders page and the order page have something to show: a one-item order, a few with
// several products (some in more than one pack size), and a long one to scroll the item cards; one has an expected
// delivery, one is cancelled. Made through the order service, from the active suppliers and products already there.
// Nothing has arrived on them (no purchases are made). Their ids go in .demo-purchase-orders.json at the repo root.
//   pnpm --filter @repo/services exec dotenv -e ../../.env -- tsx scripts/seed-demo-purchase-orders.ts

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { and, asc, db, eq, sql } from "@repo/database";
import { partiesTable, usersTable } from "@repo/database/schema";

import ProductService from "../product";
import PurchaseOrderService from "../purchase-order";

// a day this many days from today (India), as YYYY-MM-DD
const inDays = (n: number) => {
  const d = new Date(Date.now() + 5.5 * 3600_000 + n * 86_400_000);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.role, "admin")).orderBy(asc(usersTable.createdAt)).limit(1);
  if (!admin) throw new Error("No admin user.");
  const actor = admin as never;

  // the active suppliers
  const suppliers = await db
    .select({ id: partiesTable.id, name: partiesTable.name })
    .from(partiesTable)
    .where(and(eq(partiesTable.isActive, true), sql`'supplier' = any(${partiesTable.types})`))
    .orderBy(asc(partiesTable.name));
  if (suppliers.length === 0) throw new Error("No active supplier.");

  // the active products, each with its active pack sizes; ones with several pack sizes first
  const groups = (await new ProductService().list({ includeInactive: false }))
    .map((g) => ({ ...g, packs: g.packs.filter((p) => p.isActive) }))
    .filter((g) => g.packs.length > 0)
    .sort((a, b) => b.packs.length - a.packs.length);
  if (groups.length === 0) throw new Error("No active product.");

  // an order's lines: from these products, up to `packsEach` pack sizes of each, with a quantity and a rate
  const linesOf = (from: typeof groups, packsEach: number, seed: number) =>
    from.flatMap((g, i) =>
      g.packs.slice(0, packsEach).map((p, j) => ({
        productId: p.productId,
        quantity: [10, 25, 40, 60, 100, 150, 250, 1200][(seed + i + j) % 8]!,
        rateBeforeGst: Math.round((p.priceBeforeGst ?? p.weightedAverageCost ?? 1000) * 100) / 100 || 1000,
        discount: 0,
      })),
    );

  const plans = [
    { lines: linesOf(groups.slice(0, 1), 1, 0), expected: null, cancel: false, remarks: "Demo: one item" },
    { lines: linesOf(groups.slice(0, 3), 2, 1), expected: inDays(3), cancel: false, remarks: "Demo: a few products, two pack sizes each" },
    { lines: linesOf(groups.slice(0, 12), 3, 2), expected: inDays(7), cancel: false, remarks: "Demo: a long order to scroll" },
    { lines: linesOf(groups.slice(1, 4), 1, 3), expected: null, cancel: false, remarks: "Demo: one pack size each" },
    { lines: linesOf(groups.slice(0, 2), 2, 4), expected: null, cancel: true, remarks: "Demo: cancelled" },
  ];

  const service = new PurchaseOrderService();
  const ids: string[] = [];
  for (const [i, plan] of plans.entries()) {
    const supplier = suppliers[i % suppliers.length]!;
    const order = await service.create(
      { partyId: supplier.id, newSupplier: null, expectedDeliveryDate: plan.expected, lines: plan.lines, orderDiscount: 0, remarks: plan.remarks } as never,
      actor,
    );
    if (plan.cancel) await service.cancel({ id: order.id });
    ids.push(order.id);
    console.log(`${order.orderId}: ${supplier.name}, ${plan.lines.length} items${plan.cancel ? ", cancelled" : ""}`);
  }

  writeFileSync(resolve(__dirname, "../../../.demo-purchase-orders.json"), JSON.stringify(ids, null, 2) + "\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
