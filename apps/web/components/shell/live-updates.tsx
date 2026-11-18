"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { useLiveChanges } from "~/providers/session";

// tRPC query keys start with the procedure path as an array: [["inventory", "stock", "byGodown"], …]
const inScope = (key: readonly unknown[], scope: string) => Array.isArray(key[0]) && key[0][0] === scope;

// a change that moves stock (an order holds or frees it, a sale or purchase takes or adds it) also refreshes the
// products and stock, so an open order or sale shows what's free now
const alsoRefresh: Record<string, string[]> = { orders: ["inventory"], transactions: ["inventory"] };

// keeps every signed-in page live: when someone else (or another tab) changes something, the queries for
// that part of the app refetch. Only the ones on screen fetch now; the rest refetch when next shown.
// Open forms keep what's typed: they copy the data once, when they open
export function LiveUpdates() {
  const queryClient = useQueryClient();
  const started = useRef(false);

  useLiveChanges({
    // after a reconnect (sleep, lost network), changes may have been missed: refresh everything once
    onStarted: () => {
      if (started.current) void queryClient.invalidateQueries();
      started.current = true;
    },
    onData: ({ scope }) => {
      const scopes = [scope, ...(alsoRefresh[scope] ?? [])];
      void queryClient.invalidateQueries({ predicate: (q) => scopes.some((s) => inScope(q.queryKey, s)) });
    },
  });

  return null;
}
