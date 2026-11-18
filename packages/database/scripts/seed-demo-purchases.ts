// demo purchases of Aishwaya 26 kg from the demo suppliers, so a purchase order's cost chart has something to show.
// Only the purchase rows (transaction, purchase, its item): no ledger entries, no stock, no weighted cost. The ids
// go to .demo-purchases.json; `--remove` deletes exactly those, by id.
//   pnpm --filter @repo/database seed:purchases
//   pnpm --filter @repo/database seed:purchases --remove

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../index";
import {
  assignedIdCountersTable,
  partiesTable,
  partyAddressesTable,
  productsTable,
  purchaseProductsTable,
  purchasesTable,
  transactionsTable,
  usersTable,
} from "../schema";

const IDS_FILE = join(__dirname, ".demo-purchases.json");
const PRODUCT_ID = "2bc598bc-d0bc-41f4-8ec9-fa21f080f7ba"; // Aishwaya 26 KGS
const PRODUCT_NAME = "Aishwaya 26 KGS";

// each purchase: invoice date, supplier, its bill number, packs and cost a pack (GST 0% on this pack)
const DEMO = [
  { date: "2026-06-12", supplier: "9722c32f-3141-41e2-abd8-1fe7634cb81a", bill: "SRM-1042", quantity: 40, cost: 1760 },
  { date: "2026-07-20", supplier: "350d7e52-8cb5-4be8-b5c6-b47397bfd454", bill: "BA-2231", quantity: 60, cost: 1790 },
  { date: "2026-08-28", supplier: "9722c32f-3141-41e2-abd8-1fe7634cb81a", bill: "SRM-1108", quantity: 50, cost: 1745 },
  { date: "2026-10-06", supplier: "350d7e52-8cb5-4be8-b5c6-b47397bfd454", bill: "BA-2390", quantity: 80, cost: 1820 },
  { date: "2026-11-10", supplier: "9722c32f-3141-41e2-abd8-1fe7634cb81a", bill: "SRM-1187", quantity: 70, cost: 1850 },
];

type Saved = { transactionId: string; purchaseId: string; itemId: string }[];

// the next PU number for the purchase's month, from the same counter the app uses
async function nextId(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], date: string) {
  const [year, month] = date.split("-").map(Number) as [number, number];
  const [row] = await tx
    .insert(assignedIdCountersTable)
    .values({ prefix: "PU", year, month, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [assignedIdCountersTable.prefix, assignedIdCountersTable.year, assignedIdCountersTable.month],
      set: { lastNumber: sql`${assignedIdCountersTable.lastNumber} + 1` },
    })
    .returning({ lastNumber: assignedIdCountersTable.lastNumber });
  return `PU${String(year % 100).padStart(2, "0")}${String(month).padStart(2, "0")}${String(row!.lastNumber).padStart(4, "0")}`;
}

async function add() {
  if (existsSync(IDS_FILE)) {
    console.log("Already seeded (see .demo-purchases.json). Run with --remove first.");
    return;
  }
  const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, PRODUCT_ID));
  if (!product) throw new Error("Aishwaya 26 KGS not found");
  const [admin] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).limit(1);
  if (!admin) throw new Error("no user");

  const saved: Saved = [];
  await db.transaction(async (tx) => {
    for (const d of DEMO) {
      const [party] = await tx.select().from(partiesTable).where(eq(partiesTable.id, d.supplier));
      const [address] = await tx.select().from(partyAddressesTable).where(eq(partyAddressesTable.partyId, d.supplier)).limit(1);
      if (!party || !address) throw new Error(`supplier ${d.supplier} or its address missing`);
      const total = (d.quantity * d.cost).toFixed(2);

      const [t] = await tx
        .insert(transactionsTable)
        .values({
          type: "purchase",
          dateTime: new Date(`${d.date}T11:00:00+05:30`),
          amount: total,
          assignedId: await nextId(tx, d.date),
          createdById: admin.id,
          createdByName: admin.name.slice(0, 30),
        })
        .returning({ id: transactionsTable.id });
      const [p] = await tx
        .insert(purchasesTable)
        .values({
          transactionId: t!.id,
          partyId: party.id,
          partyNameSnapshot: party.name,
          partyPhoneSnapshot: party.phone,
          billFromAddressId: address.id,
          billFromGstinSnapshot: address.gstin,
          billFromAddressLine1Snapshot: address.addressLine1,
          billFromAddressLine2Snapshot: address.addressLine2,
          billFromCitySnapshot: address.city,
          billFromDistrictSnapshot: address.district,
          billFromStateSnapshot: address.state,
          billFromStateCodeSnapshot: address.stateCode,
          billFromPostalCodeSnapshot: address.postalCode,
          supplyType: "intra",
          subtotal: total,
          transactedIn: "credit",
          supplierInvoiceNumber: d.bill,
          invoiceDate: d.date,
          // no bill attached (the database may still want a value here until the latest migration)
          invoiceUrl: "",
        })
        .returning({ id: purchasesTable.id });
      const [item] = await tx
        .insert(purchaseProductsTable)
        .values({
          purchaseId: p!.id,
          productId: PRODUCT_ID,
          productNameSnapshot: PRODUCT_NAME,
          godownName: "",
          quantity: d.quantity,
          grossProductPrice: total,
          gstRate: 0,
        })
        .returning({ id: purchaseProductsTable.id });
      saved.push({ transactionId: t!.id, purchaseId: p!.id, itemId: item!.id });
    }
  });
  writeFileSync(IDS_FILE, JSON.stringify(saved, null, 2));
  console.log(`Added ${saved.length} purchases of ${PRODUCT_NAME}.`);
}

// deletes only the rows this script added, by id
async function remove() {
  if (!existsSync(IDS_FILE)) {
    console.log("Nothing to remove.");
    return;
  }
  const saved = JSON.parse(readFileSync(IDS_FILE, "utf8")) as Saved;
  await db.transaction(async (tx) => {
    await tx.delete(purchaseProductsTable).where(inArray(purchaseProductsTable.id, saved.map((s) => s.itemId)));
    await tx.delete(purchasesTable).where(inArray(purchasesTable.id, saved.map((s) => s.purchaseId)));
    await tx.delete(transactionsTable).where(inArray(transactionsTable.id, saved.map((s) => s.transactionId)));
  });
  unlinkSync(IDS_FILE);
  console.log(`Removed ${saved.length} demo purchases.`);
}

async function main() {
  await (process.argv.includes("--remove") ? remove() : add());
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
