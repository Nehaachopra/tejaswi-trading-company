"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type CreateIn = RouterInputs["transactions"]["saleReturn"]["create"];
type ExchangeIn = RouterInputs["transactions"]["saleReturn"]["exchange"];
export type SaleForReturn = RouterOutputs["transactions"]["saleReturn"]["forReturn"];
export type CreditNote = RouterOutputs["transactions"]["saleReturn"]["creditNote"];

// what a save changes: stock, balances, dues, History and the sale itself
function useAfterSave() {
  const utils = trpc.useUtils();
  return () => {
    void utils.inventory.invalidate();
    void utils.accounts.invalidate();
    void utils.transactions.invalidate();
    void utils.orders.invalidate();
  };
}

// a sale as the return form (and its Return button) needs it: each item with what can still come back, the customer and
// what they owe, the last day a return can be made, and why it can't take one. Only while `enabled` (the admin's)
export function useSaleForReturn(transactionId: string, enabled = true) {
  const q = trpc.transactions.saleReturn.forReturn.useQuery({ transactionId }, { enabled });
  // the customer's ledger, as the Customer card shows it (Edit changes their details)
  const partyId = q.data?.customer?.partyId ?? null;
  const ledger = trpc.accounts.ledger.pickable.useQuery({ purpose: "receipt", receiptKind: "customer", partyId }, { enabled: enabled && !!partyId });
  const reads = [q, ...(partyId ? [ledger] : [])];
  return {
    sale: q.data,
    ledger: partyId ? (ledger.data?.[0] ?? null) : null,
    loading: enabled && reads.some((r) => r.isPending),
    loadFailed: reads.some((r) => r.isError),
    retry: () => reads.forEach((r) => r.isError && void r.refetch()),
  };
}

// what the return form reads besides the sale: the products (names, photos), what each godown holds, and what cash
// and each bank account hold (to pay back from)
export function useReturnSources() {
  const products = trpc.inventory.product.list.useQuery({ includeInactive: true });
  const stock = trpc.inventory.stock.byGodown.useQuery();
  const money = trpc.transactions.payment.sources.useQuery();
  const reads = [products, stock, money];
  return {
    products: products.data ?? [],
    stock: stock.data ?? [],
    money: money.data,
    loading: reads.some((r) => r.isPending),
    loadFailed: reads.some((r) => r.isError),
    retry: () => reads.forEach((r) => r.isError && void r.refetch()),
  };
}

// saving a refund, or an exchange (the return and its new sale together); then what they changed is asked again
export function useSaveReturn() {
  const after = useAfterSave();
  const create = trpc.transactions.saleReturn.create.useMutation();
  const exchange = trpc.transactions.saleReturn.exchange.useMutation();
  return {
    saveRefund: async (input: CreateIn) => {
      const r = await create.mutateAsync(input);
      after();
      return r;
    },
    saveExchange: async (input: ExchangeIn) => {
      const r = await exchange.mutateAsync(input);
      after();
      return r;
    },
    saving: create.isPending || exchange.isPending,
    saved: create.isSuccess || exchange.isSuccess,
  };
}

// a return as its credit note (its success page reads the same)
export function useCreditNote(transactionId: string) {
  const q = trpc.transactions.saleReturn.creditNote.useQuery({ transactionId });
  return { note: q.data, loading: q.isPending, loadFailed: q.isError };
}
