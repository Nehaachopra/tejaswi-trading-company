import { z } from "zod";

// WebAuthn browser responses are validated by SimpleWebAuthn; zod only checks the envelope
export const webAuthnResponseModel = z.looseObject({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  response: z.looseObject({ clientDataJSON: z.string() }),
});

export const webAuthnOptionsModel = z.looseObject({ challenge: z.string() });

// opaque options JSON handed to @simplewebauthn/browser on the web app
export type WebAuthnOptionsModel = z.infer<typeof webAuthnOptionsModel>;

export const verifyRegistrationInputModel = z.object({
  name: z.string().trim().min(1).max(50),
  response: webAuthnResponseModel,
});

export type VerifyRegistrationInputModel = z.infer<typeof verifyRegistrationInputModel>;

export const verifyElevationInputModel = z.object({
  response: webAuthnResponseModel,
});

export type VerifyElevationInputModel = z.infer<typeof verifyElevationInputModel>;

export const passkeyModel = z.object({
  id: z.string().uuid(),
  name: z.string(),
  deviceType: z.string(),
  backedUp: z.boolean(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
});

export type PasskeyModel = z.infer<typeof passkeyModel>;

export const renamePasskeyInputModel = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(50),
});

export type RenamePasskeyInputModel = z.infer<typeof renamePasskeyInputModel>;

export const passkeyIdInputModel = z.object({ id: z.string().uuid() });

export const elevationModel = z.object({ elevatedUntil: z.date() });
