"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type HistoryFilters = Omit<RouterInputs["transactions"]["history"]["list"], "cursor" | "limit">;
type HistoryRow = RouterOutputs["transactions"]["history"]["list"][number];

// rows a page brings; a shorter page is the last
const PAGE_SIZE = 50;

// where the next page starts: the last row shown, its date and id
const cursorOf = (row: HistoryRow) => `${new Date(row.dateTime).toISOString()}|${row.id}`;

// /history: the transactions the viewer can see, newest first, a page at a time; the rows shown stay while new filters
// load
export function useHistory(filters: HistoryFilters) {
  return trpc.transactions.history.list.useInfiniteQuery(
    { ...filters, limit: PAGE_SIZE },
    {
      getNextPageParam: (last) => (last.length === PAGE_SIZE ? cursorOf(last.at(-1)!) : undefined),
      placeholderData: (previous) => previous,
    },
  );
}

// the months the Month filter offers: each holding a transaction the viewer can see, newest first
export function useHistoryMonths() {
  return trpc.transactions.history.months.useQuery();
}

// one transaction as History knows it: its type, status, who cancelled it, when and why, and why it can't be cancelled
export function useHistoryTransaction(id: string) {
  return trpc.transactions.history.get.useQuery({ id });
}

// cancelling one (the admin's): everything about transactions is read again (the list, this one, its invoice), and the
// stock, orders and dues it touched
export function useCancelTransaction() {
  const utils = trpc.useUtils();
  return trpc.transactions.history.cancel.useMutation({
    onSuccess: () => {
      void utils.transactions.invalidate();
      void utils.inventory.invalidate();
      void utils.orders.invalidate();
    },
  });
}
