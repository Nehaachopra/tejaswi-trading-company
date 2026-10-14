import { TRPCError } from "@trpc/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, asc, count, db, eq, gt } from "@repo/database";
import { passkeysTable, sessionsTable } from "@repo/database/schema";

import type { AuthSessionModel } from "../auth/model";
import type {
  PasskeyModel,
  RenamePasskeyInputModel,
  VerifyElevationInputModel,
  VerifyRegistrationInputModel,
  WebAuthnOptionsModel,
} from "./model";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const ELEVATION_TTL_MS = 15 * 60 * 1000;

const RP_NAME = "Tejaswi Trading Company";

// the web app's origin; passkeys are bound to its hostname
function relyingParty() {
  const origin = process.env.APP_URL;
  if (!origin) throw new Error("APP_URL is not set");
  return { origin, rpID: new URL(origin).hostname };
}

const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromBase64Url = (value: string) => new Uint8Array(Buffer.from(value, "base64url"));

export default class PasskeyService {
  private async saveChallenge(sessionId: string, challenge: string) {
    await db
      .update(sessionsTable)
      .set({ challenge, challengeExpiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) })
      .where(eq(sessionsTable.id, sessionId));
  }

  // reads and clears the pending challenge so it can only be answered once
  private async consumeChallenge(sessionId: string) {
    const [row] = await db
      .select({ challenge: sessionsTable.challenge })
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, sessionId), gt(sessionsTable.challengeExpiresAt, new Date())))
      .limit(1);

    const challenge = row?.challenge;
    const cleared = challenge
      ? await db
          .update(sessionsTable)
          .set({ challenge: null, challengeExpiresAt: null })
          .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.challenge, challenge)))
          .returning({ id: sessionsTable.id })
      : [];

    if (!challenge || cleared.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Passkey request expired. Try again." });
    }

    return challenge;
  }

  private async userPasskeys(userId: string) {
    return db
      .select()
      .from(passkeysTable)
      .where(eq(passkeysTable.userId, userId))
      .orderBy(asc(passkeysTable.createdAt));
  }

  async hasPasskey(userId: string) {
    const [row] = await db
      .select({ passkeys: count() })
      .from(passkeysTable)
      .where(eq(passkeysTable.userId, userId));
    return (row?.passkeys ?? 0) > 0;
  }

  async list(userId: string): Promise<PasskeyModel[]> {
    const passkeys = await this.userPasskeys(userId);
    return passkeys.map((passkey) => ({
      id: passkey.id,
      name: passkey.name,
      deviceType: passkey.deviceType,
      backedUp: passkey.backedUp,
      lastUsedAt: passkey.lastUsedAt,
      createdAt: passkey.createdAt,
    }));
  }

  async registrationOptions(session: AuthSessionModel) {
    const { rpID } = relyingParty();
    const existing = await this.userPasskeys(session.user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: `${session.user.countryCode}${session.user.phone}`,
      userDisplayName: session.user.name,
      userID: new TextEncoder().encode(session.user.id),
      attestationType: "none",
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports ?? undefined,
      })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });

    await this.saveChallenge(session.sessionId, options.challenge);
    return options as unknown as WebAuthnOptionsModel;
  }

  async verifyRegistration(session: AuthSessionModel, input: VerifyRegistrationInputModel) {
    const { origin, rpID } = relyingParty();
    const expectedChallenge = await this.consumeChallenge(session.sessionId);

    const verification = await verifyRegistrationResponse({
      response: input.response as unknown as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    }).catch(() => ({ verified: false as const }));

    if (!verification.verified) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Passkey could not be verified." });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const [created] = await db
      .insert(passkeysTable)
      .values({
        userId: session.user.id,
        name: input.name,
        credentialId: credential.id,
        publicKey: toBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      })
      .returning();

    return {
      id: created!.id,
      name: created!.name,
      deviceType: created!.deviceType,
      backedUp: created!.backedUp,
      lastUsedAt: created!.lastUsedAt,
      createdAt: created!.createdAt,
    };
  }

  async elevationOptions(session: AuthSessionModel) {
    const { rpID } = relyingParty();
    const passkeys = await this.userPasskeys(session.user.id);

    if (passkeys.length === 0) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Register a passkey first." });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports ?? undefined,
      })),
      userVerification: "required",
    });

    await this.saveChallenge(session.sessionId, options.challenge);
    return options as unknown as WebAuthnOptionsModel;
  }

  async verifyElevation(session: AuthSessionModel, input: VerifyElevationInputModel) {
    const { origin, rpID } = relyingParty();
    const expectedChallenge = await this.consumeChallenge(session.sessionId);

    const [passkey] = await db
      .select()
      .from(passkeysTable)
      .where(
        and(
          eq(passkeysTable.userId, session.user.id),
          eq(passkeysTable.credentialId, input.response.id),
        ),
      )
      .limit(1);

    if (!passkey) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "This passkey is not registered." });
    }

    const verification = await verifyAuthenticationResponse({
      response: input.response as unknown as AuthenticationResponseJSON,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: fromBase64Url(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports ?? undefined,
      },
      requireUserVerification: true,
    }).catch(() => null);

    if (!verification?.verified) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Passkey could not be verified." });
    }

    const elevatedUntil = new Date(Date.now() + ELEVATION_TTL_MS);

    await db.transaction(async (tx) => {
      await tx
        .update(passkeysTable)
        .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
        .where(eq(passkeysTable.id, passkey.id));

      await tx
        .update(sessionsTable)
        .set({ elevatedUntil })
        .where(eq(sessionsTable.id, session.sessionId));
    });

    return { elevatedUntil };
  }

  async rename(userId: string, input: RenamePasskeyInputModel) {
    const updated = await db
      .update(passkeysTable)
      .set({ name: input.name })
      .where(and(eq(passkeysTable.id, input.id), eq(passkeysTable.userId, userId)))
      .returning({ id: passkeysTable.id });

    if (updated.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Passkey not found." });
    }
  }

  async revoke(userId: string, passkeyId: string) {
    const passkeys = await this.userPasskeys(userId);

    // removing the last passkey would lock the admin out of /admin
    if (passkeys.length <= 1) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Register another passkey before removing your last one.",
      });
    }

    const deleted = await db
      .delete(passkeysTable)
      .where(and(eq(passkeysTable.id, passkeyId), eq(passkeysTable.userId, userId)))
      .returning({ id: passkeysTable.id });

    if (deleted.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Passkey not found." });
    }
  }
}
