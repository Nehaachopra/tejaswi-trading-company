"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type DepositIn = RouterInputs["transactions"]["deposit"];

// what the deposit form needs from the server before anything is typed: the bank accounts, what cash and each account
// hold (null for staff, who don't see balances), and the save. Made once for the page; the form reads it with
// useDeposit(). Every read is tried again 3 times by itself before it counts as failed; the save never is
function useDepositData() {
  const utils = trpc.useUtils();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const sources = trpc.transactions.payment.sources.useQuery();
  const create = trpc.transactions.deposit.create.useMutation();

  // saves a deposit, then what changed with it is asked again (balances, ledgers), and the saved deposit is put in hand
  // for its own page
  async function saveDeposit(input: DepositIn["create"]) {
    const d = await create.mutateAsync(input);
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    utils.transactions.deposit.get.setData({ transactionId: d.transactionId }, d);
    return d;
  }

  return {
    banks: banks.data,
    sources: sources.data,
    loading: banks.isPending || sources.isPending,
    loadFailed: banks.isError || sources.isError,
    retryLoad: () => {
      if (banks.isError) void banks.refetch();
      if (sources.isError) void sources.refetch();
    },
    saveDeposit,
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

const DepositContext = createContext<ReturnType<typeof useDepositData> | null>(null);

export function DepositProvider({ children }: { children: React.ReactNode }) {
  const value = useDepositData();
  return <DepositContext.Provider value={value}>{children}</DepositContext.Provider>;
}

export function useDeposit() {
  const value = useContext(DepositContext);
  if (!value) throw new Error("useDeposit is used outside DepositProvider");
  return value;
}
