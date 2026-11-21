"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type EditSaleIn = RouterInputs["transactions"]["sale"]["edit"];
export type SaleForEdit = RouterOutputs["transactions"]["sale"]["forEdit"];

// a sale being edited (the admin's): the sale as it was saved, and its customer (their ledger, as the Customer card
// picks one) when it has one. Each read is tried again by itself before it counts as failed
export function useSaleForEdit(transactionId: string) {
  const sale = trpc.transactions.sale.forEdit.useQuery({ transactionId });
  const partyId = sale.data?.customer?.partyId ?? null;
  const ledger = trpc.accounts.ledger.pickable.useQuery(
    { purpose: "receipt", receiptKind: "customer", partyId },
    { enabled: !!partyId },
  );
  const reads = [sale, ...(partyId ? [ledger] : [])];
  return {
    sale: sale.data ?? null,
    ledger: partyId ? (ledger.data?.[0] ?? null) : null,
    loading: reads.some((r) => r.isPending),
    loadFailed: reads.some((r) => r.isError),
    retry: () => reads.forEach((r) => r.isError && void r.refetch()),
  };
}

// saving an edit (never tried again by itself); then what it changed is asked again: stock, balances, History, orders
// and the sale's invoice
export function useSaveSaleEdit() {
  const utils = trpc.useUtils();
  const edit = trpc.transactions.sale.edit.useMutation();
  return {
    saveEdit: async (input: EditSaleIn) => {
      const sale = await edit.mutateAsync(input);
      void utils.inventory.product.list.invalidate();
      void utils.inventory.stock.invalidate();
      void utils.accounts.invalidate();
      void utils.transactions.invalidate();
      void utils.orders.invalidate();
      return sale;
    },
    saving: edit.isPending,
    saved: edit.isSuccess,
  };
}
