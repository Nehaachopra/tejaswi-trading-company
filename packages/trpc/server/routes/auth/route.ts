import {
  authSessionModel,
  requestOtpInputModel,
  requestOtpOutputModel,
  verifyOtpInputModel,
} from "@repo/services/auth/model";
import { SESSION_TTL_SECONDS } from "@repo/services/auth";

import { z, zodUndefinedModel } from "../../schema";
import { protectedProcedure, publicProcedure, router } from "../../trpc";
import { SESSION_COOKIE } from "../../context";
import { authService } from "../../services";

const cookieOptions = {
  httpOnly: true,
  // the app uses "prod", which Node's NODE_ENV typing doesn't know about
  secure: (process.env.NODE_ENV as string) === "prod",
  sameSite: "lax" as const,
  path: "/",
};

export const authRouter = router({
  requestOtp: publicProcedure
    .meta({ openapi: { method: "POST", path: "/auth/otp/request", tags: ["auth"] } })
    .input(requestOtpInputModel)
    .output(requestOtpOutputModel)
    .mutation(({ input }) => authService.requestOtp(input)),

  verifyOtp: publicProcedure
    .meta({ openapi: { method: "POST", path: "/auth/otp/verify", tags: ["auth"] } })
    .input(verifyOtpInputModel)
    .output(authSessionModel)
    .mutation(async ({ input, ctx }) => {
      const { token, session } = await authService.verifyOtp(input, ctx.client);
      ctx.res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS * 1000 });
      return session;
    }),

  me: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/auth/me", tags: ["auth"] } })
    .input(zodUndefinedModel)
    .output(authSessionModel)
    .query(({ ctx }) => ctx.session),

  logout: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/auth/logout", tags: ["auth"] } })
    .input(zodUndefinedModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ ctx }) => {
      await authService.logout(ctx.session.sessionId);
      ctx.res.clearCookie(SESSION_COOKIE, cookieOptions);
      return { success: true as const };
    }),
});
