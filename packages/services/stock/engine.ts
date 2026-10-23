import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray } from "@repo/database";
import { godownsTable, productGodownsTable, productsTable, stockCountGodownsTable } from "@repo/database/schema";

import type { StockChange } from "./model";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// the one path every stock change takes: purchases, sales, returns, drawings, moves and approved counts
// all call it inside their own database transaction, so stock and the record that changed it are saved
// together or not at all. It keeps each godown's quantity and the product's total, reserved and
// unreserved quantities in step, and refuses anything that would go below zero or touch a godown
// that is being counted
export default class StockEngine {
  async apply(tx: Tx, changes: StockChange[]) {
    const moving = changes.filter((c) => c.delta !== 0);
    if (moving.length === 0) return;
    if (moving.some((c) => !Number.isInteger(c.delta))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Stock moves in whole packs." });
    }

    const productIds = [...new Set(moving.map((c) => c.productId))].sort();
    const godownIds = [...new Set(moving.map((c) => c.godownId))].sort();

    // hold the godowns (shared, in a fixed order) so a count starting or a godown being switched off at the
    // same moment waits for this save, then check them: a godown being counted is locked, and stock only
    // comes into an active godown
    const godowns = await tx.select().from(godownsTable).where(inArray(godownsTable.id, godownIds)).orderBy(asc(godownsTable.id)).for("share");
    if (godowns.length !== godownIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Godown not found." });
    const counting = await tx
      .select({ godownName: stockCountGodownsTable.godownName })
      .from(stockCountGodownsTable)
      .where(and(inArray(stockCountGodownsTable.godownId, godownIds), eq(stockCountGodownsTable.status, "counting")));
    if (counting.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: `${counting[0]!.godownName} is being counted. Try again once its count is submitted.` });
    }
    const inactive = godowns.find((g) => !g.isActive && moving.some((c) => c.godownId === g.id && c.delta > 0));
    if (inactive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${inactive.godownName} is inactive.` });
    const godownName = new Map(godowns.map((g) => [g.id, g.godownName]));

    // lock the products, always in the same order, so two saves touching the same pack sizes queue up
    // instead of deadlocking. The second one then reads what the first left behind, so two devices moving
    // the last bags out of a godown can't both succeed
    const products = await tx
      .select()
      .from(productsTable)
      .where(inArray(productsTable.id, productIds))
      .orderBy(asc(productsTable.id))
      .for("update");
    if (products.length !== productIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });

    // each godown's row for these pack sizes (missing rows count as zero)
    const rows = await tx
      .select()
      .from(productGodownsTable)
      .where(and(inArray(productGodownsTable.productId, productIds), inArray(productGodownsTable.godownId, godownIds)))
      .orderBy(asc(productGodownsTable.id))
      .for("update");
    const held = new Map(rows.map((r) => [`${r.productId}|${r.godownId}`, r.quantity]));

    // the godown quantities after every change
    const after = new Map<string, number>();
    for (const c of moving) {
      const key = `${c.productId}|${c.godownId}`;
      const next = (after.get(key) ?? held.get(key) ?? 0) + c.delta;
      if (next < 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Not enough stock in ${godownName.get(c.godownId)}.` });
      }
      after.set(key, next);
    }

    // the product totals after every change, split into reserved and unreserved
    const totals = new Map(products.map((p) => [p.id, { reserved: p.reservedQuantity, unreserved: p.unreservedQuantity }]));
    for (const c of moving) {
      const t = totals.get(c.productId)!;
      if (c.reserved) t.reserved += c.delta;
      else t.unreserved += c.delta;
      if (t.reserved < 0 || t.unreserved < 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: c.reserved ? "More than the orders reserved." : "Not enough free stock: the rest is reserved for orders.",
        });
      }
    }

    // write the godown rows, then the products
    for (const [key, quantity] of after) {
      const [productId, godownId] = key.split("|") as [string, string];
      await tx
        .insert(productGodownsTable)
        .values({ productId, godownId, quantity })
        .onConflictDoUpdate({
          target: [productGodownsTable.godownId, productGodownsTable.productId],
          set: { quantity, updatedAt: new Date() },
        });
    }
    for (const [productId, t] of totals) {
      await tx
        .update(productsTable)
        .set({ reservedQuantity: t.reserved, unreservedQuantity: t.unreserved, quantity: t.reserved + t.unreserved })
        .where(eq(productsTable.id, productId));
    }
  }

  // an order sets stock aside without moving it: free stock becomes reserved (or back again with a
  // negative quantity when the order is cancelled or changed). Godown quantities don't change
  async reserve(tx: Tx, productId: string, quantity: number) {
    if (!Number.isInteger(quantity)) throw new TRPCError({ code: "BAD_REQUEST", message: "Stock moves in whole packs." });
    const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, productId)).for("update");
    if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
    const reserved = product.reservedQuantity + quantity;
    const unreserved = product.unreservedQuantity - quantity;
    if (unreserved < 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Not enough free stock to reserve." });
    if (reserved < 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "More than the orders reserved." });
    await tx
      .update(productsTable)
      .set({ reservedQuantity: reserved, unreservedQuantity: unreserved })
      .where(eq(productsTable.id, productId));
  }
}
