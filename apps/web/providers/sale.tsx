"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type CreateSaleIn = RouterInputs["transactions"]["sale"]["create"];

// what the sale form needs from the server before anything is typed: the active products, their categories, what each
// godown holds, our place of business (a cash sale goes there unless changed), the bank accounts, and the save. Made
// once for the page; the form reads it with useSaleData(). Every read is tried again by itself before it counts as
// failed; the save never is
function useSaleDataState() {
  const utils = trpc.useUtils();
  const products = trpc.inventory.product.list.useQuery({ includeInactive: false });
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false });
  const stock = trpc.inventory.stock.byGodown.useQuery();
  const place = trpc.transactions.sale.placeOfBusiness.useQuery();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const create = trpc.transactions.sale.create.useMutation();

  // saves it; then what it changed is asked again (stock, balances, dues), and the saved sale is put in hand for its
  // success page
  async function saveSale(input: CreateSaleIn) {
    const sale = await create.mutateAsync(input);
    void utils.inventory.product.list.invalidate();
    void utils.inventory.stock.invalidate();
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    void utils.transactions.due.invalidate();
    return sale;
  }

  const reads = [products, categories, stock, place, banks];
  return {
    products: products.data,
    categories: categories.data,
    stock: stock.data,
    placeOfBusiness: place.data,
    banks: banks.data,
    loading: reads.some((r) => r.isPending),
    loadFailed: reads.some((r) => r.isError),
    retryLoad: () => reads.forEach((r) => r.isError && void r.refetch()),
    saveSale,
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

const SaleDataContext = createContext<ReturnType<typeof useSaleDataState> | null>(null);

export function SaleDataProvider({ children }: { children: React.ReactNode }) {
  const value = useSaleDataState();
  return <SaleDataContext.Provider value={value}>{children}</SaleDataContext.Provider>;
}

export function useSaleData() {
  const value = useContext(SaleDataContext);
  if (!value) throw new Error("useSaleData is used outside SaleDataProvider");
  return value;
}

// a saved sale for its success page: its number, items, total and whether it was cash or credit
export function useSavedSale(transactionId: string) {
  return trpc.transactions.sale.get.useQuery({ transactionId });
}

// a sale as its tax invoice: ours, or (with the key from a shared link) the customer's copy, opened without a login
export function useSaleInvoice(transactionId: string, shareKey?: string) {
  const shared = shareKey !== undefined;
  const own = trpc.transactions.sale.invoice.useQuery({ transactionId }, { enabled: !shared });
  const theirs = trpc.transactions.sale.shared.useQuery({ transactionId, key: shareKey ?? "" }, { enabled: shared, retry: false });
  return shared ? theirs : own;
}

// the key for the invoice's link, sent to the customer on WhatsApp
export function useSaleShareKey(transactionId: string, enabled = true) {
  return trpc.transactions.sale.shareKey.useQuery({ transactionId }, { enabled });
}
