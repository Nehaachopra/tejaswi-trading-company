"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type ReceiptIn = RouterInputs["transactions"]["receipt"];

// every read here is tried again 3 times by itself (the query client's default) before it counts as failed; then the
// form says so and offers Try again (retry). The save is never retried by itself, so a receipt can't go in twice

// what the receipt form needs from the server before anything is typed: the bank accounts, what cash and each account
// hold (null for staff, who don't see balances), and the save. Made once for the page; the form reads it with useReceipt()
function useReceiptData() {
  const utils = trpc.useUtils();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const sources = trpc.transactions.payment.sources.useQuery();
  const create = trpc.transactions.receipt.create.useMutation();

  // saves a receipt, then what changed with it is asked again (balances, dues, ledgers), and the saved receipt is put
  // in hand for its own page
  async function saveReceipt(input: ReceiptIn["create"]) {
    const r = await create.mutateAsync(input);
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    void utils.transactions.due.invalidate();
    utils.transactions.receipt.get.setData({ transactionId: r.transactionId }, r);
    utils.transactions.receipt.balances.setData({ transactionId: r.transactionId }, r.balances);
    return r;
  }

  return {
    banks: banks.data,
    sources: sources.data,
    // still asking for either (a failed ask isn't loading)
    loading: banks.isPending || sources.isPending,
    // either couldn't be had, even after the retries; Try again asks for whichever failed
    loadFailed: banks.isError || sources.isError,
    retryLoad: () => {
      if (banks.isError) void banks.refetch();
      if (sources.isError) void sources.refetch();
    },
    saveReceipt,
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

const ReceiptContext = createContext<ReturnType<typeof useReceiptData> | null>(null);

export function ReceiptProvider({ children }: { children: React.ReactNode }) {
  const value = useReceiptData();
  return <ReceiptContext.Provider value={value}>{children}</ReceiptContext.Provider>;
}

export function useReceipt() {
  const value = useContext(ReceiptContext);
  if (!value) throw new Error("useReceipt is used outside ReceiptProvider");
  return value;
}

// the open loans we gave, for one given back or its interest (only while `enabled`): the loans, whether it failed, and
// a retry
export function useLoansGiven(enabled: boolean) {
  const q = trpc.transactions.due.openLoans.useQuery({ kind: "loanGiven" }, { enabled });
  return {
    loans: q.data,
    loansLoading: q.isPending,
    loansFailed: enabled && q.isError,
    retryLoans: () => void q.refetch(),
  };
}
