import { headers } from "next/headers";
import { createTRPCProxyClient, httpLink, TRPCClientError } from "@repo/trpc/client";
import type { ServerRouter } from "@repo/trpc/client";

import { env } from "~/env";

// server components call the API on the visitor's behalf, so the visitor's cookies must go along
async function requestApi() {
  const cookie = (await headers()).get("cookie") ?? "";

  return createTRPCProxyClient<ServerRouter>({
    links: [
      httpLink({
        url: `${env.NEXT_PUBLIC_API_URL ?? ""}/trpc`,
        headers: { cookie },
      }),
    ],
  });
}

// the signed-in session, or null when there is none (not logged in, expired, revoked, deactivated)
export async function getSession() {
  try {
    return await (await requestApi()).auth.me.query();
  } catch (error) {
    if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") return null;
    throw error;
  }
}
