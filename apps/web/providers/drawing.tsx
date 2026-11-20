"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type CreateDrawingIn = RouterInputs["transactions"]["drawing"]["create"];

// what the drawing form needs from the server before anything is typed: the active products, their categories, what
// each godown holds (goods), the bank accounts and what cash and each account hold (money), and the save. Made once
// for the page; the form reads it with useDrawing(). Every read is tried again by itself before it counts as failed;
// the save never is
function useDrawingData() {
  const utils = trpc.useUtils();
  const products = trpc.inventory.product.list.useQuery({ includeInactive: false });
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false });
  const stock = trpc.inventory.stock.byGodown.useQuery();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const sources = trpc.transactions.payment.sources.useQuery();
  const create = trpc.transactions.drawing.create.useMutation();

  // saves it; then what it changed is asked again (stock, balances), and the saved one is put in hand for its own page
  async function saveDrawing(input: CreateDrawingIn) {
    const d = await create.mutateAsync(input);
    void utils.inventory.product.list.invalidate();
    void utils.inventory.stock.invalidate();
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    utils.transactions.drawing.get.setData({ transactionId: d.transactionId }, d);
    return d;
  }

  const reads = [products, categories, stock, banks, sources];
  return {
    products: products.data,
    categories: categories.data,
    stock: stock.data,
    banks: banks.data,
    sources: sources.data,
    loading: reads.some((r) => r.isPending),
    loadFailed: reads.some((r) => r.isError),
    retryLoad: () => reads.forEach((r) => r.isError && void r.refetch()),
    saveDrawing,
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

const DrawingContext = createContext<ReturnType<typeof useDrawingData> | null>(null);

export function DrawingProvider({ children }: { children: React.ReactNode }) {
  const value = useDrawingData();
  return <DrawingContext.Provider value={value}>{children}</DrawingContext.Provider>;
}

export function useDrawing() {
  const value = useContext(DrawingContext);
  if (!value) throw new Error("useDrawing is used outside DrawingProvider");
  return value;
}
