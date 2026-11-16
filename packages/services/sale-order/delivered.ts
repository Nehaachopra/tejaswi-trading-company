import { and, eq } from "@repo/database";
import { saleProductsTable, salesTable, transactionsTable } from "@repo/database/schema";

import type { Tx } from "../stock/engine";

// how many of each item have gone out on a sale order, from its sales that still stand (a cancelled one doesn't count)
export async function saleOrderDelivered(tx: Tx, orderId: string) {
  const rows = await tx
    .select({ productId: saleProductsTable.productId, quantity: saleProductsTable.quantity })
    .from(saleProductsTable)
    .innerJoin(salesTable, eq(salesTable.id, saleProductsTable.saleId))
    .innerJoin(transactionsTable, eq(transactionsTable.id, salesTable.transactionId))
    .where(and(eq(salesTable.orderId, orderId), eq(transactionsTable.status, "active")));
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.productId, (out.get(r.productId) ?? 0) + r.quantity);
  return out;
}
