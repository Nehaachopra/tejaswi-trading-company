import { and, asc, eq, inArray } from "@repo/database";
import {
  purchaseProductsTable,
  purchaseReturnProductsTable,
  purchaseReturnsTable,
  returnDeliveriesTable,
  saleProductsTable,
  saleReturnProductsTable,
  saleReturnsTable,
  transactionsTable,
} from "@repo/database/schema";

import type { Tx } from "../stock/engine";

// what returns still in place hold fast on a sale or purchase being edited: the items refunded (any part) and those
// whose replacement hasn't all gone out (or come in) yet can't change; the lines goods came back on stay; and the day
// can't move past the first return's
export type ReturnLocks = {
  // products whose rate and quantity stay as they are, and why: refunded (any part), or a replacement still pending
  locked: Map<string, "refunded" | "pending">;
  // the sale_products / purchase_products rows a return points at (kept in place)
  referenced: Set<string>;
  // the first return's day (YYYY-MM-DD); none: null
  firstReturn: string | null;
};

// one return's lines, added up per product: how many were refunded, how many replaced later, and how many of those have
// gone out (or come in)
function lockedOf(
  rows: { returnTransactionId: string; productId: string; quantity: number; refunded: boolean; replacedLater: boolean }[],
  delivered: Map<string, number>,
) {
  const locked = new Map<string, "refunded" | "pending">();
  const later = new Map<string, { productId: string; owed: number }>();
  for (const r of rows) {
    if (r.refunded) locked.set(r.productId, "refunded");
    else if (r.replacedLater) {
      const key = `${r.returnTransactionId}:${r.productId}`;
      const l = later.get(key) ?? { productId: r.productId, owed: 0 };
      l.owed += r.quantity;
      later.set(key, l);
    }
  }
  for (const [key, l] of later) if ((delivered.get(key) ?? 0) < l.owed && !locked.has(l.productId)) locked.set(l.productId, "pending");
  return locked;
}

// each return's packs that have gone out (or come in) on sales or purchases still in place, per return and product
async function deliveredOn(q: Tx, returnTransactionIds: string[]) {
  const out = new Map<string, number>();
  if (returnTransactionIds.length === 0) return out;
  const rows = await q
    .select({ returnTransactionId: returnDeliveriesTable.returnTransactionId, productId: returnDeliveriesTable.productId, quantity: returnDeliveriesTable.quantity })
    .from(returnDeliveriesTable)
    .innerJoin(transactionsTable, eq(transactionsTable.id, returnDeliveriesTable.deliveryTransactionId))
    .where(and(inArray(returnDeliveriesTable.returnTransactionId, returnTransactionIds), eq(transactionsTable.status, "active")));
  for (const r of rows) {
    const key = `${r.returnTransactionId}:${r.productId}`;
    out.set(key, (out.get(key) ?? 0) + r.quantity);
  }
  return out;
}

// a sale's: replaced now (on the return's exchange sale) is done; replaced later waits for its packs to go out
export async function saleReturnLocks(q: Tx, saleId: string): Promise<ReturnLocks> {
  const returns = await q
    .select({ id: saleReturnsTable.id, transactionId: saleReturnsTable.transactionId, returnDate: saleReturnsTable.returnDate, exchangeSaleId: saleReturnsTable.exchangeSaleId })
    .from(saleReturnsTable)
    .innerJoin(transactionsTable, eq(transactionsTable.id, saleReturnsTable.transactionId))
    .where(and(eq(saleReturnsTable.saleId, saleId), eq(transactionsTable.status, "active")))
    .orderBy(asc(saleReturnsTable.returnDate));
  if (returns.length === 0) return { locked: new Map(), referenced: new Set(), firstReturn: null };
  const lines = await q
    .select({ returnId: saleReturnProductsTable.returnId, saleProductId: saleReturnProductsTable.saleProductId, productId: saleProductsTable.productId, quantity: saleReturnProductsTable.quantity, replaced: saleReturnProductsTable.replaced })
    .from(saleReturnProductsTable)
    .innerJoin(saleProductsTable, eq(saleProductsTable.id, saleReturnProductsTable.saleProductId))
    .where(inArray(saleReturnProductsTable.returnId, returns.map((r) => r.id)));
  // each exchange sale's products: replaced now
  const exchangeIds = returns.map((r) => r.exchangeSaleId).filter((id): id is string => id !== null);
  const exchanged = exchangeIds.length
    ? await q.select({ saleId: saleProductsTable.saleId, productId: saleProductsTable.productId }).from(saleProductsTable).where(inArray(saleProductsTable.saleId, exchangeIds))
    : [];
  const rows = lines.map((l) => {
    const ret = returns.find((r) => r.id === l.returnId)!;
    const now = ret.exchangeSaleId !== null && exchanged.some((x) => x.saleId === ret.exchangeSaleId && x.productId === l.productId);
    return { returnTransactionId: ret.transactionId, productId: l.productId, quantity: l.quantity, refunded: !l.replaced && !now, replacedLater: l.replaced };
  });
  return {
    locked: lockedOf(rows, await deliveredOn(q, returns.map((r) => r.transactionId))),
    referenced: new Set(lines.map((l) => l.saleProductId)),
    firstReturn: returns[0]!.returnDate,
  };
}

// a purchase's: replaced (now or later) waits for the supplier's packs to come in
export async function purchaseReturnLocks(q: Tx, purchaseId: string): Promise<ReturnLocks> {
  const returns = await q
    .select({ id: purchaseReturnsTable.id, transactionId: purchaseReturnsTable.transactionId, returnDate: purchaseReturnsTable.returnDate })
    .from(purchaseReturnsTable)
    .innerJoin(transactionsTable, eq(transactionsTable.id, purchaseReturnsTable.transactionId))
    .where(and(eq(purchaseReturnsTable.purchaseId, purchaseId), eq(transactionsTable.status, "active")))
    .orderBy(asc(purchaseReturnsTable.returnDate));
  if (returns.length === 0) return { locked: new Map(), referenced: new Set(), firstReturn: null };
  const lines = await q
    .select({ returnId: purchaseReturnProductsTable.returnId, purchaseProductId: purchaseReturnProductsTable.purchaseProductId, productId: purchaseProductsTable.productId, quantity: purchaseReturnProductsTable.quantity, replaced: purchaseReturnProductsTable.replaced })
    .from(purchaseReturnProductsTable)
    .innerJoin(purchaseProductsTable, eq(purchaseProductsTable.id, purchaseReturnProductsTable.purchaseProductId))
    .where(inArray(purchaseReturnProductsTable.returnId, returns.map((r) => r.id)));
  const rows = lines.map((l) => ({
    returnTransactionId: returns.find((r) => r.id === l.returnId)!.transactionId,
    productId: l.productId,
    quantity: l.quantity,
    refunded: !l.replaced,
    replacedLater: l.replaced,
  }));
  return {
    locked: lockedOf(rows, await deliveredOn(q, returns.map((r) => r.transactionId))),
    referenced: new Set(lines.map((l) => l.purchaseProductId)),
    firstReturn: returns[0]!.returnDate,
  };
}
