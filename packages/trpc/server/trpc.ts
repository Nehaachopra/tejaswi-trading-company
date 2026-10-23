import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";

import { createContext } from "./context";
import { publishChange } from "./live";

// tRPC only hides stack traces when NODE_ENV is "production"; this app uses "prod"
export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({
    isDev: process.env.NODE_ENV === "development",
    // live updates: a ping every 15 s keeps the stream open through proxies; the browser reconnects
    // on its own if it drops
    sse: { ping: { enabled: true, intervalMs: 15_000 }, client: { reconnectAfterInactivityMs: 40_000 } },
  });

export const router = tRPCContext.router;

// after a change succeeds, tell every open tab which part of the app changed, so it refreshes what it shows
const announceChanges = tRPCContext.middleware(async ({ ctx, type, path, next }) => {
  const result = await next();
  if (type === "mutation" && result.ok) {
    const tab = ctx.req.headers["x-tab-id"];
    publishChange({ scope: path.split(".")[0]!, path, tabId: typeof tab === "string" ? tab.slice(0, 64) : null });
  }
  return result;
});

export const publicProcedure = tRPCContext.procedure.use(announceChanges);

// valid, unrevoked session of an active user
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please log in." });
  }
  return next({ ctx: { session: ctx.session } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admins only." });
  }
  return next();
});

// /admin/* work: admin who verified a passkey within the elevation window
export const elevatedProcedure = adminProcedure.use(({ ctx, next }) => {
  const until = ctx.session.elevatedUntil;
  if (!until || until.getTime() <= Date.now()) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Verify your passkey to continue." });
  }
  return next();
});
