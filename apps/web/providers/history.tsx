"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type HistoryFilters = Omit<RouterInputs["transactions"]["history"]["list"], "cursor" | "limit">;
type HistoryRow = RouterOutputs["transactions"]["history"]["list"][number];
// one transaction as History knows it: its type, status, who cancelled it, when and why, and why it can't be cancelled
export type HistoryTransaction = RouterOutputs["transactions"]["history"]["get"];

// rows a page brings; a shorter page is the last
const PAGE_SIZE = 50;

// where the next page starts: the last row shown, its date and id
const cursorOf = (row: HistoryRow) => `${new Date(row.dateTime).toISOString()}|${row.id}`;

// /history: the transactions the viewer can see, newest first, a page at a time. The rows loaded so far (they stay,
// dimmed, while new filters load), whether the first page is coming or failed, and the next page: whether there is
// one, whether it's coming, and asking for it
export function useHistory(filters: HistoryFilters) {
  const q = trpc.transactions.history.list.useInfiniteQuery(
    { ...filters, limit: PAGE_SIZE },
    {
      getNextPageParam: (last) => (last.length === PAGE_SIZE ? cursorOf(last.at(-1)!) : undefined),
      placeholderData: (previous) => previous,
    },
  );
  return {
    rows: q.data?.pages.flat() ?? [],
    loading: q.isPending,
    loadFailed: q.isError,
    // the rows shown are the last filters', while the new ones load
    stale: q.isPlaceholderData,
    hasMore: q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: q.fetchNextPage,
  };
}

// the months the Month filter offers (each holding a transaction the viewer can see, newest first), as YYYY-MM
export function useHistoryMonths() {
  const q = trpc.transactions.history.months.useQuery();
  return { months: (q.data ?? []).map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`) };
}

// one transaction: it once loaded, whether it's still coming, whether it isn't there (or isn't the viewer's), or
// whether it couldn't be had
export function useHistoryTransaction(id: string) {
  const q = trpc.transactions.history.get.useQuery({ id });
  return {
    transaction: q.data,
    loading: q.isPending,
    notFound: q.isError && q.error.data?.code === "NOT_FOUND",
    loadFailed: q.isError && q.error.data?.code !== "NOT_FOUND",
  };
}

// cancelling one (the admin's), with its reason: everything about transactions is read again (the list, this one, its
// invoice), and the stock, orders and dues it touched. Resolves once cancelled; throws with the server's message
export function useCancelTransaction() {
  const utils = trpc.useUtils();
  const m = trpc.transactions.history.cancel.useMutation({
    onSuccess: () => {
      void utils.transactions.invalidate();
      void utils.inventory.invalidate();
      void utils.orders.invalidate();
    },
  });
  return {
    cancel: (id: string, reason: string) => m.mutateAsync({ id, reason }),
    cancelling: m.isPending,
  };
}
