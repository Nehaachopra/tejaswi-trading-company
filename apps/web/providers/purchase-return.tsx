"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type CreateIn = RouterInputs["transactions"]["purchaseReturn"]["create"];
export type PurchaseForReturn = RouterOutputs["transactions"]["purchaseReturn"]["forReturn"];
export type DebitNote = RouterOutputs["transactions"]["purchaseReturn"]["debitNote"];

// a purchase as the return form (and its Return button) needs it: each item with what can still go back, the supplier
// and what we owe them, the last day a return can be made, and why it can't take one; with the supplier's ledger, as the
// Supplier card shows it (Edit changes their details). Only while `enabled` (the admin's)
export function usePurchaseForReturn(transactionId: string, enabled = true) {
  const q = trpc.transactions.purchaseReturn.forReturn.useQuery({ transactionId }, { enabled });
  const partyId = q.data?.supplier.partyId ?? null;
  const ledger = trpc.accounts.ledger.pickable.useQuery({ purpose: "payment", paymentKind: "supplier", partyId }, { enabled: enabled && !!partyId });
  const reads = [q, ...(partyId ? [ledger] : [])];
  return {
    purchase: q.data,
    ledger: partyId ? (ledger.data?.[0] ?? null) : null,
    loading: enabled && reads.some((r) => r.isPending),
    loadFailed: reads.some((r) => r.isError),
    retry: () => reads.forEach((r) => r.isError && void r.refetch()),
  };
}

// saving a return; then what it changed is asked again: stock, balances, dues, History and the purchase itself
export function useSavePurchaseReturn() {
  const utils = trpc.useUtils();
  const create = trpc.transactions.purchaseReturn.create.useMutation();
  return {
    save: async (input: CreateIn) => {
      const r = await create.mutateAsync(input);
      void utils.inventory.invalidate();
      void utils.accounts.invalidate();
      void utils.transactions.invalidate();
      return r;
    },
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

// a return as its debit note (its success page reads the same)
export function useDebitNote(transactionId: string) {
  const q = trpc.transactions.purchaseReturn.debitNote.useQuery({ transactionId });
  return { note: q.data, loading: q.isPending, loadFailed: q.isError };
}

// a return's swapped items still to come (only while `enabled`: the Receive card is open)
export function usePendingReplacement(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.purchaseReturn.pending.useQuery({ transactionId }, { enabled });
  return { pending: q.data, loading: q.isPending, loadFailed: q.isError };
}

// a swap's new packs received; then stock and History are asked again
export function useReceiveReplacement() {
  const utils = trpc.useUtils();
  const m = trpc.transactions.purchaseReturn.receive.useMutation({
    onSuccess: () => {
      void utils.inventory.invalidate();
      void utils.transactions.invalidate();
    },
  });
  return { receive: m.mutateAsync, saving: m.isPending };
}
