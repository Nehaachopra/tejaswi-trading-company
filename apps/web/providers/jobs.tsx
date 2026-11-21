"use client";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

// the background jobs in one state, newest 50, asked again every 15 seconds
export function useJobs(state: Extract<RouterInputs["jobs"]["list"], object>["state"]) {
  const q = trpc.jobs.list.useQuery({ state, limit: 50 }, { refetchInterval: 15_000, staleTime: 0 });
  return { board: q.data, loading: q.isPending, loadFailed: q.isError, fetching: q.isFetching, retry: () => void q.refetch() };
}

// a failed job put back in its queue; the list is read again once it's queued
export function useRetryJob(after: { onSuccess: () => void; onError: (message: string) => void }) {
  const utils = trpc.useUtils();
  return trpc.jobs.retry.useMutation({
    onSuccess: () => {
      after.onSuccess();
      void utils.jobs.list.invalidate();
    },
    onError: (error) => after.onError(error.message),
  });
}
