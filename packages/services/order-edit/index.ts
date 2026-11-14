import { asc, eq } from "@repo/database";
import { orderEditsTable } from "@repo/database/schema";

import type { ActorModel } from "../accounts/model";
import { toPaise } from "../accounts/money";
import type { Tx } from "../stock/engine";
import type { OrderEditField, OrderEditModel } from "./model";

// an order as an edit compares it: who it's with (by name), the expected day, the discount, remarks and its items
export type OrderSnapshot = {
  party: string;
  expected: string | null;
  discount: number;
  remarks: string | null;
  lines: { productId: string; quantity: number; rate: number }[];
};

// which order: a purchase order or a sale order
export type OrderRef = { kind: "purchase" | "sale"; id: string };

type Change = { field: OrderEditField; productId: string | null; from: string | null; to: string | null };

// a rupee figure as it's kept on a change: two places ("1850.00")
const money = (n: number) => (toPaise(n) / 100).toFixed(2);
// remarks fit the column
const clip = (v: string | null) => (v == null ? null : v.slice(0, 1000));

// what changed between an order before and after a save: items put on and taken off, each kept item's quantity and
// rate, then who it's with, the expected day, the discount and remarks
export function orderChanges(before: OrderSnapshot, after: OrderSnapshot): Change[] {
  const out: Change[] = [];
  const was = new Map(before.lines.map((l) => [l.productId, l]));
  const now = new Map(after.lines.map((l) => [l.productId, l]));
  for (const l of after.lines) {
    const old = was.get(l.productId);
    if (!old) {
      out.push({ field: "item_added", productId: l.productId, from: null, to: String(l.quantity) });
      continue;
    }
    if (old.quantity !== l.quantity) out.push({ field: "quantity", productId: l.productId, from: String(old.quantity), to: String(l.quantity) });
    if (toPaise(old.rate) !== toPaise(l.rate)) out.push({ field: "rate", productId: l.productId, from: money(old.rate), to: money(l.rate) });
  }
  for (const l of before.lines) {
    if (!now.has(l.productId)) out.push({ field: "item_removed", productId: l.productId, from: String(l.quantity), to: null });
  }
  if (before.party !== after.party) out.push({ field: "party", productId: null, from: before.party, to: after.party });
  if ((before.expected ?? null) !== (after.expected ?? null)) out.push({ field: "expected_delivery", productId: null, from: before.expected, to: after.expected });
  if (toPaise(before.discount) !== toPaise(after.discount)) out.push({ field: "discount", productId: null, from: money(before.discount), to: money(after.discount) });
  if ((before.remarks ?? "") !== (after.remarks ?? "")) out.push({ field: "remarks", productId: null, from: clip(before.remarks || null), to: clip(after.remarks || null) });
  return out;
}

// an order's edits: kept with each save (one row per change), and read back for its History
export default class OrderEditService {
  // a save's changes, under one edit id; nothing when nothing changed
  async record(tx: Tx, order: OrderRef, actor: ActorModel, before: OrderSnapshot, after: OrderSnapshot) {
    const changes = orderChanges(before, after);
    if (changes.length === 0) return;
    const editId = crypto.randomUUID();
    await tx.insert(orderEditsTable).values(
      changes.map((c) => ({
        editId,
        purchaseOrderId: order.kind === "purchase" ? order.id : null,
        saleOrderId: order.kind === "sale" ? order.id : null,
        editedById: actor.id,
        editedByName: actor.name.slice(0, 255),
        field: c.field,
        productId: c.productId,
        fromValue: c.from,
        toValue: c.to,
      })),
    );
  }

  // an order's edits, oldest first, each save with its changes
  async listFor(q: Pick<Tx, "select">, order: OrderRef): Promise<OrderEditModel[]> {
    const rows = await q
      .select()
      .from(orderEditsTable)
      .where(order.kind === "purchase" ? eq(orderEditsTable.purchaseOrderId, order.id) : eq(orderEditsTable.saleOrderId, order.id))
      .orderBy(asc(orderEditsTable.createdAt), asc(orderEditsTable.id));
    const saves = new Map<string, OrderEditModel>();
    for (const r of rows) {
      const save = saves.get(r.editId) ?? { editId: r.editId, at: r.createdAt, byName: r.editedByName, changes: [] };
      save.changes.push({ field: r.field, productId: r.productId, from: r.fromValue, to: r.toValue });
      saves.set(r.editId, save);
    }
    return [...saves.values()];
  }
}
