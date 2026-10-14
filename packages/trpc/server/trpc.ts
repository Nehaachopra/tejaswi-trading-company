import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";

import { createContext } from "./context";

// tRPC only hides stack traces when NODE_ENV is "production"; this app uses "prod"
export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({ isDev: process.env.NODE_ENV === "development" });

export const router = tRPCContext.router;

export const publicProcedure = tRPCContext.procedure;

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
