"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type OtherIn = RouterInputs["transactions"]["other"]["create"];

// what the Others form needs from the server: the ledgers an entry can use (our own heads, with their balances), and
// the save. Made once for the page; the form reads it with useOther(). Every read is tried again 3 times by itself
// before it counts as failed; the save never is
function useOtherData() {
  const utils = trpc.useUtils();
  const ledgers = trpc.transactions.other.ledgers.useQuery();
  const create = trpc.transactions.other.create.useMutation();

  // saves the entry, then what changed with it is asked again, and the saved entry is put in hand for its own page
  async function saveOther(input: OtherIn) {
    const o = await create.mutateAsync(input);
    void utils.accounts.invalidate();
    void utils.transactions.other.ledgers.invalidate();
    utils.transactions.other.get.setData({ transactionId: o.transactionId }, o);
    return o;
  }

  return {
    ledgers: ledgers.data,
    loading: ledgers.isPending,
    loadFailed: ledgers.isError,
    retryLoad: () => void ledgers.refetch(),
    saveOther,
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

const OtherContext = createContext<ReturnType<typeof useOtherData> | null>(null);

export function OtherProvider({ children }: { children: React.ReactNode }) {
  const value = useOtherData();
  return <OtherContext.Provider value={value}>{children}</OtherContext.Provider>;
}

export function useOther() {
  const value = useContext(OtherContext);
  if (!value) throw new Error("useOther is used outside OtherProvider");
  return value;
}
