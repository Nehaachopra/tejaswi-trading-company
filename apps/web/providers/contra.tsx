"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type ContraIn = RouterInputs["transactions"]["deposit"]["create"];
type TransferIn = RouterInputs["transactions"]["transfer"]["create"];

// a deposit (cash into a bank account), a withdrawal (cash out of one) or a transfer (one account to another)
export type ContraKind = "deposit" | "withdrawal" | "transfer";

// what the deposit, withdrawal or transfer form needs from the server before anything is typed: the bank accounts,
// what cash and each account hold (null for staff, who don't see balances), and the save. Made once for the page; the
// form reads it with useContra(). Every read is tried again 3 times by itself before it counts as failed; the save
// never is
function useContraData(kind: ContraKind) {
  const utils = trpc.useUtils();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const sources = trpc.transactions.payment.sources.useQuery();
  const deposit = trpc.transactions.deposit.create.useMutation();
  const withdrawal = trpc.transactions.withdrawal.create.useMutation();
  const transfer = trpc.transactions.transfer.create.useMutation();
  const create = kind === "deposit" ? deposit : kind === "withdrawal" ? withdrawal : transfer;

  // saves it, then what changed with it is asked again (balances, ledgers), and the saved one is put in hand for its
  // own page
  async function saveContra(input: ContraIn | TransferIn) {
    const c =
      kind === "transfer"
        ? await transfer.mutateAsync(input as TransferIn)
        : await (kind === "deposit" ? deposit : withdrawal).mutateAsync(input as ContraIn);
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    utils.transactions[kind].get.setData({ transactionId: c.transactionId }, c);
    return c;
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
    saveContra,
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

const ContraContext = createContext<ReturnType<typeof useContraData> | null>(null);

export function ContraProvider({ kind, children }: { kind: ContraKind; children: React.ReactNode }) {
  const value = useContraData(kind);
  return <ContraContext.Provider value={value}>{children}</ContraContext.Provider>;
}

export function useContra() {
  const value = useContext(ContraContext);
  if (!value) throw new Error("useContra is used outside ContraProvider");
  return value;
}
