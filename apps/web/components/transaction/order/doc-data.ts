"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import {
  usePurchaseOrderDocument,
  usePurchaseOrderShareKey,
  useSaleOrderDocument,
  useSaleOrderShareKey,
  useSaveCustomerPhone,
  useSaveSupplierPhone,
  useSharedPurchaseOrder,
  useSharedSaleOrder,
} from "~/providers/purchase-order";

export type OrderKind = "purchase" | "sale";

type PurchaseDoc = RouterOutputs["orders"]["purchase"]["document"];
type SaleDoc = RouterOutputs["orders"]["sale"]["document"];

// an order as its document and saved page show it, the same for a purchase and a sale: the order's own figures, who it's
// to (the supplier, or the customer: a party, or a name kept on the order) and our details on top
export type OrderDoc = {
  kind: OrderKind;
  order: Pick<
    PurchaseDoc["order"],
    | "id"
    | "orderId"
    | "orderDate"
    | "expectedDeliveryDate"
    | "remarks"
    | "orderedByName"
    | "totalAmount"
    | "orderDiscount"
    | "itemCount"
    | "status"
    | "deliveries"
    | "createdAt"
    | "cancelledAt"
  > & {
    // each item, with how many have moved (arrived on a purchase order, gone out on a sale order)
    lines: (Omit<SaleDoc["order"]["lines"][number], "delivered"> & { moved: number })[];
  };
  toName: string;
  company: PurchaseDoc["company"];
  to: PurchaseDoc["supplier"];
};

const fromPurchase = (d: PurchaseDoc): OrderDoc => ({
  kind: "purchase",
  order: { ...d.order, lines: d.order.lines.map((l) => ({ ...l, moved: l.received })) },
  toName: d.order.party.name,
  company: d.company,
  to: d.supplier,
});
const fromSale = (d: SaleDoc): OrderDoc => ({
  kind: "sale",
  order: { ...d.order, lines: d.order.lines.map(({ delivered, ...l }) => ({ ...l, moved: delivered })) },
  toName: d.order.customer.name,
  company: d.company,
  to: d.customer,
});

// the order's document: ours (with a share key, the other side's copy from a shared link); only the kind asked is fetched
export function useOrderDoc(kind: OrderKind, id: string, shareKey?: string) {
  const shared = shareKey !== undefined;
  const purchaseOwn = usePurchaseOrderDocument(id, kind === "purchase" && !shared);
  const purchaseTheirs = useSharedPurchaseOrder(id, shareKey ?? "", kind === "purchase" && shared);
  const saleOwn = useSaleOrderDocument(id, kind === "sale" && !shared);
  const saleTheirs = useSharedSaleOrder(id, shareKey ?? "", kind === "sale" && shared);
  const q = kind === "purchase" ? (shared ? purchaseTheirs : purchaseOwn) : shared ? saleTheirs : saleOwn;
  const data = q.data ? (kind === "purchase" ? fromPurchase(q.data as PurchaseDoc) : fromSale(q.data as SaleDoc)) : undefined;
  return { isPending: q.isPending, isError: q.isError, data };
}

// the key for the order's link sent on WhatsApp (ours only)
export function useOrderShareKey(kind: OrderKind, id: string, enabled = true) {
  const purchase = usePurchaseOrderShareKey(id, enabled && kind === "purchase");
  const sale = useSaleOrderShareKey(id, enabled && kind === "sale");
  return kind === "purchase" ? purchase : sale;
}

// the other side's WhatsApp number typed when sharing, kept on them (or on the order, for a name)
export function useSaveOrderPhone(kind: OrderKind, id: string) {
  const purchase = useSaveSupplierPhone(id);
  const sale = useSaveCustomerPhone(id);
  return kind === "purchase" ? purchase : sale;
}

// where each kind's pages live
export const orderPath = (kind: OrderKind, id: string) => (kind === "purchase" ? `/transaction/order/${id}` : `/transaction/order/sale/${id}`);
export const sharedOrderPath = (kind: OrderKind, id: string) => (kind === "purchase" ? `/voucher/order/${id}` : `/voucher/sale-order/${id}`);
