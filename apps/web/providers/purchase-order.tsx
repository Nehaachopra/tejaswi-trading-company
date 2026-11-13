"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type CreateIn = RouterInputs["orders"]["purchase"]["create"];

// what the new-order form needs from the server before anything is typed: the active products (as the products page
// shows them), their categories, the suppliers, and the save. Made once for the page; the form reads it with
// usePurchaseOrderData(). Every read is tried again by itself before it counts as failed; the save never is
function usePurchaseOrderDataState() {
  const utils = trpc.useUtils();
  const products = trpc.inventory.product.list.useQuery({ includeInactive: false });
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false });
  const suppliers = trpc.accounts.party.list.useQuery({ type: "supplier" });
  const create = trpc.orders.purchase.create.useMutation();

  // saves it, then the saved order is put in hand for its own page and the list is asked again
  async function saveOrder(input: CreateIn) {
    const order = await create.mutateAsync(input);
    utils.orders.purchase.get.setData({ id: order.id }, order);
    void utils.orders.purchase.list.invalidate();
    return order;
  }

  return {
    products: products.data,
    categories: categories.data,
    // only active suppliers can be ordered from
    suppliers: suppliers.data?.filter((p) => p.isActive),
    loading: products.isPending || categories.isPending || suppliers.isPending,
    loadFailed: products.isError || categories.isError || suppliers.isError,
    retryLoad: () => {
      if (products.isError) void products.refetch();
      if (categories.isError) void categories.refetch();
      if (suppliers.isError) void suppliers.refetch();
    },
    saveOrder,
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

const PurchaseOrderDataContext = createContext<ReturnType<typeof usePurchaseOrderDataState> | null>(null);

export function PurchaseOrderDataProvider({ children }: { children: React.ReactNode }) {
  const value = usePurchaseOrderDataState();
  return <PurchaseOrderDataContext.Provider value={value}>{children}</PurchaseOrderDataContext.Provider>;
}

export function usePurchaseOrderData() {
  const value = useContext(PurchaseOrderDataContext);
  if (!value) throw new Error("usePurchaseOrderData is used outside PurchaseOrderDataProvider");
  return value;
}


// one order as a document (headed with our details, with the supplier's address and phone), and the key for its link
// sent to the supplier on WhatsApp; the admin's
export function usePurchaseOrderDocument(id: string, enabled = true) {
  return trpc.orders.purchase.document.useQuery({ id }, { enabled });
}

export function usePurchaseOrderShareKey(id: string, enabled = true) {
  return trpc.orders.purchase.shareKey.useQuery({ id }, { enabled });
}

// the supplier's WhatsApp number typed when sharing, kept on the supplier (if they have none); the order's document
// is read again so it shows
export function useSaveSupplierPhone(id: string) {
  const utils = trpc.useUtils();
  return trpc.orders.purchase.saveSupplierPhone.useMutation({ onSuccess: () => void utils.orders.purchase.document.invalidate({ id }) });
}

// the order from a shared link, for the supplier: no login, only with the key from that link
export function useSharedPurchaseOrder(id: string, key: string, enabled = true) {
  return trpc.orders.purchase.shared.useQuery({ id, key }, { enabled, retry: false });
}
