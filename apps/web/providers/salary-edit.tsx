"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

export type EditSalaryIn = RouterInputs["transactions"]["salary"]["edit"];
export type SalaryForEdit = RouterOutputs["transactions"]["salary"]["forEdit"];

// a salary or advance being edited (the admin's): as it was saved, with the employee as they were before it
export function useSalaryForEdit(transactionId: string) {
  const read = trpc.transactions.salary.forEdit.useQuery({ transactionId });
  return {
    data: read.data ?? null,
    loading: read.isPending,
    loadFailed: read.isError,
    retry: () => void read.refetch(),
  };
}

// saving an edit (never tried again by itself); then what it changed is asked again: balances, the employees owed and
// History
export function useSaveSalaryEdit() {
  const utils = trpc.useUtils();
  const edit = trpc.transactions.salary.edit.useMutation();
  return {
    saveEdit: async (input: EditSalaryIn) => {
      const saved = await edit.mutateAsync(input);
      void utils.accounts.invalidate();
      void utils.transactions.invalidate();
      return saved;
    },
    saving: edit.isPending,
    saved: edit.isSuccess,
  };
}
