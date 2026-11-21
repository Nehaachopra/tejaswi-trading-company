"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type CreatePurchaseIn = RouterInputs["transactions"]["purchase"]["create"];

// what the purchase form needs from the server before anything is typed: the active products, their categories, the
// active godowns with what each holds, what cash and each bank account hold (null for staff), and the save; and for an
// arrival on a purchase order, that order and its supplier. Made once for the page; the form reads it with usePurchaseData(). Every read is tried again by itself before it counts as
// failed; the save never is
function usePurchaseDataState(orderId: string | null) {
  const utils = trpc.useUtils();
  const products = trpc.inventory.product.list.useQuery({ includeInactive: false });
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false });
  const godowns = trpc.inventory.godown.list.useQuery({ includeInactive: false });
  const stock = trpc.inventory.stock.byGodown.useQuery();
  const sources = trpc.transactions.payment.sources.useQuery();
  const order = trpc.orders.purchase.get.useQuery({ id: orderId ?? "" }, { enabled: orderId !== null });
  // the order's supplier as the Supplier card picks one (their ledger, with what we owe them), while it's pending
  const orderPartyId = order.data?.status === "pending" ? order.data.party.id : null;
  const orderLedger = trpc.accounts.ledger.pickable.useQuery(
    { purpose: "payment", paymentKind: "supplier", partyId: orderPartyId },
    { enabled: !!orderPartyId },
  );
  const create = trpc.transactions.purchase.create.useMutation();

  // saves it; then what it changed is asked again (stock, costs, balances, dues, orders)
  async function savePurchase(input: CreatePurchaseIn) {
    const purchase = await create.mutateAsync(input);
    void utils.inventory.product.list.invalidate();
    void utils.inventory.stock.invalidate();
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    void utils.transactions.due.invalidate();
    void utils.orders.invalidate();
    return purchase;
  }

  const reads = [products, categories, godowns, stock, sources, ...(orderId !== null ? [order] : []), ...(orderPartyId ? [orderLedger] : [])];
  return {
    // only an order still waiting for goods: a completed or cancelled one makes it a purchase of its own
    order: orderId !== null && order.data?.status === "pending" ? order.data : null,
    orderLedger: orderPartyId ? (orderLedger.data?.[0] ?? null) : null,
    products: products.data,
    categories: categories.data,
    godowns: godowns.data,
    stock: stock.data,
    sources: sources.data,
    loading: reads.some((r) => r.isPending),
    loadFailed: reads.some((r) => r.isError),
    retryLoad: () => reads.forEach((r) => r.isError && void r.refetch()),
    savePurchase,
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

const PurchaseDataContext = createContext<ReturnType<typeof usePurchaseDataState> | null>(null);

export function PurchaseDataProvider({ children, orderId = null }: { children: React.ReactNode; orderId?: string | null }) {
  const value = usePurchaseDataState(orderId);
  return <PurchaseDataContext.Provider value={value}>{children}</PurchaseDataContext.Provider>;
}

export function usePurchaseData() {
  const value = useContext(PurchaseDataContext);
  if (!value) throw new Error("usePurchaseData is used outside PurchaseDataProvider");
  return value;
}

// a saved purchase as it was recorded, for its success page
export function useSavedPurchase(transactionId: string) {
  const q = trpc.transactions.purchase.get.useQuery({ transactionId });
  return { purchase: q.data, loading: q.isPending, loadFailed: q.isError };
}

// the supplier's bill attached after saving
export function useAttachBill() {
  const utils = trpc.useUtils();
  const m = trpc.transactions.purchase.attachBill.useMutation({
    onSuccess: (purchase) => utils.transactions.purchase.get.setData({ transactionId: purchase.transactionId }, purchase),
  });
  return { attach: (transactionId: string, invoiceUrl: string | null) => m.mutate({ transactionId, invoiceUrl }), failed: m.isError };
}
