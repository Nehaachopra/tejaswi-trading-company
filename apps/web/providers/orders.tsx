"use client";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type PurchaseFilters = RouterInputs["orders"]["purchase"]["list"];
type SaleFilters = RouterInputs["orders"]["sale"]["list"];

// the Orders page's lists, newest first: purchase orders (the admin's) and sale orders (admin and staff), each by status
// and the days ordered; the one not on screen isn't asked for. The list just shown stays while new filters load
export function usePurchaseOrders(filters: PurchaseFilters, enabled: boolean) {
  return trpc.orders.purchase.list.useQuery(filters, { enabled, placeholderData: (previous) => previous });
}

export function useSaleOrders(filters: SaleFilters, enabled: boolean) {
  return trpc.orders.sale.list.useQuery(filters, { enabled, placeholderData: (previous) => previous });
}

// an order called off (the admin's, while pending): its page, the lists and the products (a sale order's held stock is
// back) are read again
export function useCancelOrder(kind: "purchase" | "sale", id: string) {
  const utils = trpc.useUtils();
  const done = () => {
    void utils.orders[kind].document.invalidate({ id });
    void utils.orders[kind].list.invalidate();
    void utils.inventory.product.list.invalidate();
  };
  const purchase = trpc.orders.purchase.cancel.useMutation({ onSuccess: done });
  const sale = trpc.orders.sale.cancel.useMutation({ onSuccess: done });
  return kind === "purchase" ? purchase : sale;
}

// the products, for each order item's photo, category and sub-category
export function useOrderProducts() {
  return trpc.inventory.product.list.useQuery({ includeInactive: true });
}
