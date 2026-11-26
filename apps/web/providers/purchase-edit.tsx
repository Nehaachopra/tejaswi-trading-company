"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type EditPurchaseIn = RouterInputs["transactions"]["purchase"]["edit"];
export type PurchaseForEdit = RouterOutputs["transactions"]["purchase"]["forEdit"];

// a purchase being edited (the admin's): the purchase as it was saved, what was paid towards it and the supplier's
// account
export function usePurchaseForEdit(transactionId: string) {
  const q = trpc.transactions.purchase.forEdit.useQuery({ transactionId });
  return { purchase: q.data ?? null, loading: q.isPending, loadFailed: q.isError, retry: () => void q.refetch() };
}

// saving an edit (never tried again by itself); then what it changed is asked again: stock and costs, balances and
// History
export function useSavePurchaseEdit() {
  const utils = trpc.useUtils();
  const edit = trpc.transactions.purchase.edit.useMutation();
  return {
    saveEdit: async (input: EditPurchaseIn) => {
      const saved = await edit.mutateAsync(input);
      void utils.inventory.invalidate();
      void utils.accounts.invalidate();
      void utils.transactions.invalidate();
      return saved;
    },
    saving: edit.isPending,
    saved: edit.isSuccess,
  };
}
