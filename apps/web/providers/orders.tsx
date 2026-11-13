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
