import { TRPCError } from "@trpc/server";
import { and, count, db, desc, eq, gt, isNull, sql } from "@repo/database";
import { otpCodesTable, sessionsTable, usersTable } from "@repo/database/schema";

import { randomDigits, randomToken, safeEqual, sha256 } from "../utils/crypto";
import { LogOtpSender, type OtpSender } from "./otp-sender";
import type {
  AuthSessionModel,
  ClientInfo,
  CreatedSession,
  PhoneModel,
  RequestOtpInputModel,
  RequestOtpOutputModel,
  VerifyOtpInputModel,
} from "./model";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

function otpHash(to: PhoneModel, code: string) {
  return sha256(`${to.countryCode}${to.phone}:${code}`);
}

export default class AuthService {
  constructor(private readonly otpSender: OtpSender = new LogOtpSender()) {}

  private async findLoginUser(to: PhoneModel) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.countryCode, to.countryCode), eq(usersTable.phone, to.phone)))
      .limit(1);

    if (!user) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This number is not registered." });
    }

    if (!user.isActive) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This account is inactive." });
    }

    return user;
  }

  async requestOtp(input: RequestOtpInputModel): Promise<RequestOtpOutputModel> {
    await this.findLoginUser(input);

    const now = Date.now();
    const samePhone = and(
      eq(otpCodesTable.countryCode, input.countryCode),
      eq(otpCodesTable.phone, input.phone),
    );

    const [recent] = await db
      .select({ sent: count(), lastSentAt: sql<Date | null>`max(${otpCodesTable.createdAt})` })
      .from(otpCodesTable)
      .where(and(samePhone, gt(otpCodesTable.createdAt, new Date(now - OTP_SEND_WINDOW_MS))));

    if (recent && recent.sent >= OTP_MAX_SENDS_PER_WINDOW) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many OTP requests. Try again in 15 minutes.",
      });
    }

    const lastSentAt = recent?.lastSentAt ? new Date(recent.lastSentAt).getTime() : 0;
    if (now - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Wait ${wait} seconds before requesting another OTP.`,
      });
    }

    const code = randomDigits(OTP_LENGTH);
    const expiresAt = new Date(now + OTP_TTL_MS);

    await db.insert(otpCodesTable).values({
      countryCode: input.countryCode,
      phone: input.phone,
      codeHash: otpHash(input, code),
      expiresAt,
    });

    await this.otpSender.send(input, code);

    return { expiresAt, resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000 };
  }

  async verifyOtp(input: VerifyOtpInputModel, client: ClientInfo): Promise<CreatedSession> {
    const user = await this.findLoginUser(input);

    // only the latest live code counts; requesting a new one supersedes older ones
    const [otp] = await db
      .select()
      .from(otpCodesTable)
      .where(
        and(
          eq(otpCodesTable.countryCode, input.countryCode),
          eq(otpCodesTable.phone, input.phone),
          isNull(otpCodesTable.consumedAt),
          gt(otpCodesTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCodesTable.createdAt))
      .limit(1);

    if (!otp) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "OTP expired. Request a new one." });
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many wrong attempts. Request a new OTP.",
      });
    }

    if (!safeEqual(otp.codeHash, otpHash(input, input.code))) {
      await db
        .update(otpCodesTable)
        .set({ attempts: sql`${otpCodesTable.attempts} + 1` })
        .where(eq(otpCodesTable.id, otp.id));

      const left = OTP_MAX_ATTEMPTS - otp.attempts - 1;
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: left > 0 ? `Wrong OTP. ${left} attempts left.` : "Wrong OTP. Request a new one.",
      });
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const session = await db.transaction(async (tx) => {
      // the isNull guard makes the code single-use even under concurrent requests
      const consumed = await tx
        .update(otpCodesTable)
        .set({ consumedAt: new Date() })
        .where(and(eq(otpCodesTable.id, otp.id), isNull(otpCodesTable.consumedAt)))
        .returning({ id: otpCodesTable.id });

      if (consumed.length === 0) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "OTP already used. Request a new one." });
      }

      const [created] = await tx
        .insert(sessionsTable)
        .values({
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt,
          ipAddress: client.ipAddress?.slice(0, 45),
          userAgent: client.userAgent,
        })
        .returning();

      return created!;
    });

    return {
      token,
      session: {
        sessionId: session.id,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          countryCode: user.countryCode,
          phone: user.phone,
          photoUrl: user.photoUrl,
        },
        expiresAt: session.expiresAt,
        elevatedUntil: session.elevatedUntil,
      },
    };
  }

  async getSession(token: string): Promise<AuthSessionModel | null> {
    const [row] = await db
      .select({ session: sessionsTable, user: usersTable })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(
        and(
          eq(sessionsTable.tokenHash, sha256(token)),
          isNull(sessionsTable.revokedAt),
          gt(sessionsTable.expiresAt, new Date()),
          eq(usersTable.isActive, true),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      sessionId: row.session.id,
      user: {
        id: row.user.id,
        name: row.user.name,
        role: row.user.role,
        countryCode: row.user.countryCode,
        phone: row.user.phone,
        photoUrl: row.user.photoUrl,
      },
      expiresAt: row.session.expiresAt,
      elevatedUntil: row.session.elevatedUntil,
    };
  }

  async logout(sessionId: string) {
    await db
      .update(sessionsTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.revokedAt)));
  }
}
