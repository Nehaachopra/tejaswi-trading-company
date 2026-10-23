"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { trpc } from "~/trpc/client";
import { tabId } from "~/trpc/create-client";

// tRPC query keys start with the procedure path as an array: [["inventory", "stock", "byGodown"], …]
const inScope = (key: readonly unknown[], scope: string) => Array.isArray(key[0]) && key[0][0] === scope;

// keeps every signed-in page live: when someone else (or another tab) changes something, the queries for
// that part of the app refetch. Only the ones on screen fetch now; the rest refetch when next shown.
// Open forms keep what's typed: they copy the data once, when they open
export function LiveUpdates() {
  const queryClient = useQueryClient();
  const started = useRef(false);

  trpc.live.changes.useSubscription(
    { tabId },
    {
      // after a reconnect (sleep, lost network), changes may have been missed: refresh everything once
      onStarted: () => {
        if (started.current) void queryClient.invalidateQueries();
        started.current = true;
      },
      onData: ({ scope }) => void queryClient.invalidateQueries({ predicate: (q) => inScope(q.queryKey, scope) }),
    },
  );

  return null;
}
