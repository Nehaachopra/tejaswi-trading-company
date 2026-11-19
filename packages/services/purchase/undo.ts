import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, lt, sql } from "@repo/database";
import {
  dueSettlementsTable,
  duesTable,
  productCostHistoryTable,
  productGodownsTable,
  productsTable,
  purchaseOrdersTable,
  purchaseProductsTable,
  purchasesTable,
} from "@repo/database/schema";

import { fromPaise, toPaise } from "../accounts/money";
import type StockEngine from "../stock/engine";
import type { Tx } from "../stock/engine";
import { weightedCost } from "./cost";

// a purchase cancelled: each godown gives back what came into it (refused when it's since been sold or moved), each
// pack's cost goes back to what it was without these packs, what we owed for it (and what it paid itself) goes, and
// an order it completed is pending again
export async function undoPurchase(tx: Tx, transactionId: string, stock: StockEngine) {
  const [purchase] = await tx
    .select({
      id: purchasesTable.id,
      orderId: purchasesTable.orderId,
      subtotal: purchasesTable.subtotal,
      charges: sql<string>`${purchasesTable.freightAmount} + ${purchasesTable.packagingAmount} + ${purchasesTable.handlingAmount} + ${purchasesTable.otherAmount}`,
    }).from(purchasesTable).where(eq(purchasesTable.transactionId, transactionId));
  if (!purchase) return;
  const lines = await tx
    .select({
      productId: purchaseProductsTable.productId,
      quantity: purchaseProductsTable.quantity,
      gross: purchaseProductsTable.grossProductPrice,
      off: purchaseProductsTable.discountAmount,
      godownId: productGodownsTable.godownId,
    })
    .from(purchaseProductsTable)
    .leftJoin(productGodownsTable, eq(productGodownsTable.id, purchaseProductsTable.productGodownId))
    .where(eq(purchaseProductsTable.purchaseId, purchase.id));
  if (lines.some((l) => !l.godownId)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A godown this purchase used is gone." });

  // each pack's cost without these packs, read before the stock leaves: they go back at what they came in at, their
  // value and their share of the charges (by value, as when saved)
  const ids = [...new Set(lines.map((l) => l.productId))];
  const before = await tx.select({ id: productsTable.id, quantity: productsTable.quantity, cost: productsTable.weightedAverageCost }).from(productsTable).where(inArray(productsTable.id, ids));
  await stock.apply(
    tx,
    lines.map((l) => ({ productId: l.productId, godownId: l.godownId!, delta: -l.quantity })),
  );
  const itemsValue = toPaise(Number(purchase.subtotal));
  const charges = toPaise(Number(purchase.charges));
  for (const b of before) {
    const mine = lines.filter((l) => l.productId === b.id);
    const value = mine.reduce((a, l) => a + toPaise(Number(l.gross)) - toPaise(Number(l.off)), 0);
    const charge = itemsValue === 0 ? 0 : Math.round((charges * value) / itemsValue);
    const moved = { quantity: -mine.reduce((a, l) => a + l.quantity, 0), value: -(value + charge) };
    // none left: the cost it had before this purchase (none, if it was the first)
    let cost: string | null;
    if (b.quantity + moved.quantity <= 0) {
      const [mineAt] = await tx
        .select({ at: productCostHistoryTable.createdAt })
        .from(productCostHistoryTable)
        .where(and(eq(productCostHistoryTable.productId, b.id), eq(productCostHistoryTable.transactionId, transactionId)))
        .orderBy(asc(productCostHistoryTable.createdAt))
        .limit(1);
      const [earlier] = mineAt
        ? await tx
            .select({ cost: productCostHistoryTable.weightedAverageCost })
            .from(productCostHistoryTable)
            .where(and(eq(productCostHistoryTable.productId, b.id), lt(productCostHistoryTable.createdAt, mineAt.at)))
            .orderBy(desc(productCostHistoryTable.createdAt))
            .limit(1)
        : [];
      cost = earlier?.cost ?? null;
    } else cost = fromPaise(weightedCost({ quantity: b.quantity, cost: b.cost === null ? null : toPaise(Number(b.cost)) }, moved));
    await tx.update(productsTable).set({ weightedAverageCost: cost }).where(eq(productsTable.id, b.id));
    if (cost !== null) await tx.insert(productCostHistoryTable).values({ productId: b.id, weightedAverageCost: cost, quantityAfter: b.quantity + moved.quantity, transactionId });
  }

  // what it settled itself (its own bill, and older dues, which are owed again), then its due
  await tx.delete(dueSettlementsTable).where(eq(dueSettlementsTable.transactionId, transactionId));
  await tx.delete(duesTable).where(eq(duesTable.transactionId, transactionId));

  if (purchase.orderId) {
    await tx
      .update(purchaseOrdersTable)
      .set({ status: "pending" })
      .where(and(eq(purchaseOrdersTable.id, purchase.orderId), eq(purchaseOrdersTable.status, "completed")));
  }
}
