"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type EditReceiptIn = RouterInputs["transactions"]["receipt"]["edit"];
export type ReceiptForEdit = RouterOutputs["transactions"]["receipt"]["forEdit"];
export type MoneySources = RouterOutputs["transactions"]["payment"]["sources"];

// a receipt being edited (the admin's): the receipt as it was saved, and cash and the bank accounts it can come into
export function useReceiptForEdit(transactionId: string) {
  const receipt = trpc.transactions.receipt.forEdit.useQuery({ transactionId });
  const sources = trpc.transactions.payment.sources.useQuery();
  const reads = [receipt, sources];
  return {
    data: receipt.data ?? null,
    sources: sources.data ?? null,
    loading: reads.some((r) => r.isPending),
    loadFailed: reads.some((r) => r.isError),
    retry: () => reads.forEach((r) => r.isError && void r.refetch()),
  };
}

// saving an edit (never tried again by itself); then what it changed is asked again: balances, dues and History
export function useSaveReceiptEdit() {
  const utils = trpc.useUtils();
  const edit = trpc.transactions.receipt.edit.useMutation();
  return {
    saveEdit: async (input: EditReceiptIn) => {
      const saved = await edit.mutateAsync(input);
      void utils.accounts.invalidate();
      void utils.transactions.invalidate();
      return saved;
    },
    saving: edit.isPending,
    saved: edit.isSuccess,
  };
}
