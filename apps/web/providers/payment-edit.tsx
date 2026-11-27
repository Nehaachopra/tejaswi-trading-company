"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type EditPaymentIn = RouterInputs["transactions"]["payment"]["edit"];
export type PaymentForEdit = RouterOutputs["transactions"]["payment"]["forEdit"];

// a payment being edited (the admin's): the payment as it was saved, what it took out and from whom
export function usePaymentForEdit(transactionId: string) {
  const read = trpc.transactions.payment.forEdit.useQuery({ transactionId });
  return {
    data: read.data ?? null,
    loading: read.isPending,
    loadFailed: read.isError,
    retry: () => void read.refetch(),
  };
}

// saving an edit (never tried again by itself); then what it changed is asked again: balances, dues and History
export function useSavePaymentEdit() {
  const utils = trpc.useUtils();
  const edit = trpc.transactions.payment.edit.useMutation();
  return {
    saveEdit: async (input: EditPaymentIn) => {
      const saved = await edit.mutateAsync(input);
      void utils.accounts.invalidate();
      void utils.transactions.invalidate();
      return saved;
    },
    saving: edit.isPending,
    saved: edit.isSuccess,
  };
}
