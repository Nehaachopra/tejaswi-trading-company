import { httpBatchStreamLink, httpLink, httpSubscriptionLink, splitLink } from "@repo/trpc/client";
import { env } from "../env";

interface CreateTRPCHttpBatchClientClientOpts {
  enableStreaming?: boolean;
}

const url = env.NEXT_PUBLIC_API_URL ? `${env.NEXT_PUBLIC_API_URL}/trpc` : "/trpc";

// this browser tab, so the live stream can leave out the changes it made itself
export const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export const createTRPCHttpBatchClientClient = (opts?: CreateTRPCHttpBatchClientClientOpts) => {
  const c = opts?.enableStreaming ? httpBatchStreamLink : httpLink;
  return c({
    url,
    fetch(url, options) {
      return fetch(url, {
        ...options,
        headers: { ...(options?.headers as Record<string, string> | undefined), "x-tab-id": tabId },
        credentials: "include",
      });
    },
  });
};

// subscriptions (the live stream) over server-sent events; everything else as before
export const createTRPCLinks = (opts?: CreateTRPCHttpBatchClientClientOpts) =>
  splitLink({
    condition: (op) => op.type === "subscription",
    true: httpSubscriptionLink({ url, eventSourceOptions: { withCredentials: true } }),
    false: createTRPCHttpBatchClientClient(opts),
  });
