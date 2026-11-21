"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type In = RouterInputs["transactions"]["due"];

// who owes us or whom we owe, by kind; the list just shown stays while another kind loads
export function useDues(kind: In["list"]["kind"]) {
  const q = trpc.transactions.due.list.useQuery({ kind }, { placeholderData: (previous) => previous });
  return { board: q.data, loading: q.isPending, loadFailed: q.isError, stale: q.isPlaceholderData };
}

// one party's dues of a kind
export function usePartyDues(input: In["party"]) {
  const q = trpc.transactions.due.party.useQuery(input);
  return { page: q.data, loading: q.isPending, loadFailed: q.isError };
}

// the open loans of a kind (taken or given)
export function useOpenLoansOf(input: In["openLoans"], enabled: boolean) {
  const q = trpc.transactions.due.openLoans.useQuery(input, { enabled });
  return { loans: q.data, loading: q.isPending, loadFailed: q.isError };
}

// a due written off: the page takes what the server sends back, and the lists and balances are read again
export function useWriteOff() {
  const utils = trpc.useUtils();
  return {
    writeOff: trpc.transactions.due.writeOff.useMutation(),
    keepWrittenOff: (input: In["party"], page: RouterOutputs["transactions"]["due"]["party"]) => {
      utils.transactions.due.party.setData(input, page);
      void utils.transactions.due.list.invalidate();
      void utils.accounts.invalidate();
    },
  };
}

// an old due or loan (from before the website) added: balances are read again, and the dues are waited for
export function useAddOldDue() {
  const utils = trpc.useUtils();
  return {
    add: trpc.transactions.due.addOld.useMutation(),
    refreshAfterOld: async () => {
      void utils.accounts.invalidate();
      await utils.transactions.due.invalidate();
    },
  };
}
