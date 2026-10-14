import { TRPCError } from "@trpc/server";
import {
  elevationModel,
  passkeyIdInputModel,
  passkeyModel,
  renamePasskeyInputModel,
  verifyElevationInputModel,
  verifyRegistrationInputModel,
  webAuthnOptionsModel,
} from "@repo/services/passkey/model";
import type { AuthSessionModel } from "@repo/services/auth/model";

import { z, zodUndefinedModel } from "../../schema";
import { adminProcedure, elevatedProcedure, router } from "../../trpc";
import { passkeyService } from "../../services";

// adding a passkey changes security settings, so it needs a fresh passkey check,
// except for the admin's very first passkey (there is nothing to check against yet)
async function assertCanAddPasskey(session: AuthSessionModel) {
  if (!(await passkeyService.hasPasskey(session.user.id))) return;

  const until = session.elevatedUntil;
  if (!until || until.getTime() <= Date.now()) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Verify your passkey to continue." });
  }
}

export const passkeyRouter = router({
  list: adminProcedure
    .input(zodUndefinedModel)
    .output(z.array(passkeyModel))
    .query(({ ctx }) => passkeyService.list(ctx.session.user.id)),

  registrationOptions: adminProcedure
    .input(zodUndefinedModel)
    .output(webAuthnOptionsModel)
    .mutation(async ({ ctx }) => {
      await assertCanAddPasskey(ctx.session);
      return passkeyService.registrationOptions(ctx.session);
    }),

  verifyRegistration: adminProcedure
    .input(verifyRegistrationInputModel)
    .output(passkeyModel)
    .mutation(async ({ ctx, input }) => {
      await assertCanAddPasskey(ctx.session);
      return passkeyService.verifyRegistration(ctx.session, input);
    }),

  elevationOptions: adminProcedure
    .input(zodUndefinedModel)
    .output(webAuthnOptionsModel)
    .mutation(({ ctx }) => passkeyService.elevationOptions(ctx.session)),

  verifyElevation: adminProcedure
    .input(verifyElevationInputModel)
    .output(elevationModel)
    .mutation(({ ctx, input }) => passkeyService.verifyElevation(ctx.session, input)),

  rename: adminProcedure
    .input(renamePasskeyInputModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      await passkeyService.rename(ctx.session.user.id, input);
      return { success: true as const };
    }),

  revoke: elevatedProcedure
    .input(passkeyIdInputModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      await passkeyService.revoke(ctx.session.user.id, input.id);
      return { success: true as const };
    }),
});
