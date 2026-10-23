import { on } from "node:events";

import { z } from "../../schema";
import { type LiveChange, liveBus } from "../../live";
import { protectedProcedure, router } from "../../trpc";

export const liveRouter = router({
  // the live stream (server-sent events): which part of the app changed, as it happens; changes this tab
  // made itself are left out. Signals only, never data: each tab refetches what it shows. Not in OpenAPI
  changes: protectedProcedure.input(z.object({ tabId: z.string().max(64) })).subscription(async function* ({ input, signal }) {
    for await (const [change] of on(liveBus, "change", { signal }) as AsyncIterable<[LiveChange]>) {
      if (change.tabId !== input.tabId) yield { scope: change.scope, path: change.path };
    }
  }),
});
