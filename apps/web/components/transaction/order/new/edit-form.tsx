"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { asField } from "~/lib/price";
import { PurchaseOrderDataProvider } from "~/providers/purchase-order";

import { EntryNote } from "../../shared/entry-frame";
import { type OrderDoc, type OrderKind, useOrderDoc } from "../doc-data";
import { OrderEntry } from "./form";
import { emptyLine, type OrderEditSeed, settleLine } from "./state";

// /order/[kind]/[id]/edit, from Edit order on the order's page: the new-order form started from the order (no Type
// card), saved over it and back to its page. Only while it's pending
export function OrderEditForm({ kind, id }: { kind: OrderKind; id: string }) {
  const [round, setRound] = useState(0);
  return (
    <PurchaseOrderDataProvider isAdmin>
      <EditEntry key={round} kind={kind} id={id} onDiscard={() => setRound((r) => r + 1)} />
    </PurchaseOrderDataProvider>
  );
}

function EditEntry({ kind, id, onDiscard }: { kind: OrderKind; id: string; onDiscard: () => void }) {
  const t = useTranslations("orders");
  const doc = useOrderDoc(kind, id);

  if (doc.isPending)
    return (
      <EntryNote title={t("edit.title")} loading>
        {t("loading")}
      </EntryNote>
    );
  if (doc.isError || !doc.data)
    return (
      <EntryNote title={t("edit.title")} failed onRetry={() => window.location.reload()}>
        {t("loadFailed")}
      </EntryNote>
    );
  if (doc.data.order.status !== "pending") return <EntryNote title={t("edit.title")}>{t("edit.notPending")}</EntryNote>;
  return <OrderEntry isAdmin onDiscard={onDiscard} edit={seedOf(kind, doc.data)} />;
}

// the form's starting point from the saved order: each item at its rate before GST, how many have moved and (a sale)
// how many it holds, the discount, the expected day and remarks, and who it's with
function seedOf(kind: OrderKind, d: OrderDoc): OrderEditSeed {
  const o = d.order;
  return {
    kind,
    id: o.id,
    orderDate: o.orderDate,
    lines: o.lines.map((l) =>
      settleLine({ ...emptyLine(l.productId), price: asField(l.rateBeforeGst), from: "price", quantity: String(l.quantity) }, l.packSize, l.gstRate),
    ),
    moved: Object.fromEntries(o.lines.map((l) => [l.productId, l.moved])),
    held: Object.fromEntries(o.lines.map((l) => [l.productId, l.quantity])),
    discount: o.orderDiscount > 0 ? asField(o.orderDiscount) : "",
    expected: o.expectedDeliveryDate ?? "",
    remarks: o.remarks ?? "",
  };
}
