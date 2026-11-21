"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { refreshScope } from "~/lib/refresh-scope";
import { useLiveChanges } from "~/providers/session";

// keeps every signed-in page live: when someone else (or another tab) changes something, the queries for that part of
// the app refetch (this tab's own saves do the same, in providers/global.tsx)
export function LiveUpdates() {
  const queryClient = useQueryClient();
  const started = useRef(false);

  useLiveChanges({
    // after a reconnect (sleep, lost network), changes may have been missed: refresh everything once
    onStarted: () => {
      if (started.current) void queryClient.invalidateQueries();
      started.current = true;
    },
    onData: ({ scope }) => refreshScope(queryClient, scope),
  });

  return null;
}
