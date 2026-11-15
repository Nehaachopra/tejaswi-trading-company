"use client";

import { trpc } from "~/trpc/client";
import { tabId } from "~/trpc/create-client";

// logging in: the code is asked for, then checked
export function useLoginCalls() {
  return {
    requestOtp: trpc.auth.requestOtp.useMutation(),
    verifyOtp: trpc.auth.verifyOtp.useMutation(),
  };
}

// logging out; the page says what happens after it worked or failed
export function useLogout(after: { onSuccess: () => void; onError: () => void }) {
  return trpc.auth.logout.useMutation(after);
}

// what other people (and this tab's jobs) change, as it happens: `onStarted` on every connect, `onData` with the
// scope of each change. The tab's id keeps its own changes from coming back to it
export function useLiveChanges(handlers: { onStarted: () => void; onData: (change: { scope: string }) => void }) {
  trpc.live.changes.useSubscription({ tabId }, handlers);
}
