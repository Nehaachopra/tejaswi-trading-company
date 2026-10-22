import { createHash, randomBytes, randomInt } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, count, db, desc, eq, gt, isNull } from "@repo/database";
import { otpCodesTable, sessionsTable, usersTable } from "@repo/database/schema";
import { logger } from "@repo/logger";

import type {
  AuthSessionModel,
  ClientInfo,
  PhoneModel,
  RequestOtpInputModel,
  RequestOtpOutputModel,
  VerifyOtpInputModel,
} from "./model";
import { LogOtpSender, type OtpSender } from "./otp-sender";

export const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 5;

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_CACHE_MS = 30 * 1000;
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

// only hashes are stored; the raw OTP goes by SMS and the raw token lives in the cookie
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const otpDigits = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
const sessionToken = () => randomBytes(32).toString("base64url");

// accepts "9876543210", "+91 98765 43210" or "919876543210"
export function parseIndianPhone(raw: string): PhoneModel {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (!/^\d{10}$/.test(digits)) throw new Error(`Invalid Indian phone number: ${raw}`);
  return { countryCode: "+91", phone: digits };
}

export default class AuthService {
  constructor(private readonly otpSender: OtpSender = new LogOtpSender()) {}

  // the very first admin comes from PHONE_NUMBER in .env; every later user is registered by an admin
  async ensureFirstAdmin(rawPhone: string) {
    const [existing] = await db.select({ users: count() }).from(usersTable);
    if (existing && existing.users > 0) return;

    const phone = parseIndianPhone(rawPhone);
    await db.insert(usersTable).values({ name: "Admin", role: "admin", ...phone });
    logger.info(`Created the first admin for ${phone.countryCode}${phone.phone}`);
  }

  private async findActiveUser(phone: PhoneModel) {
    const [user] = await db
      .select({ id: usersTable.id, isActive: usersTable.isActive })
      .from(usersTable)
      .where(and(eq(usersTable.countryCode, phone.countryCode), eq(usersTable.phone, phone.phone)));

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "This number isn't registered. Ask your admin." });
    }
    if (!user.isActive) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This account is inactive. Ask your admin." });
    }
    return user;
  }

  async requestOtp(input: RequestOtpInputModel): Promise<RequestOtpOutputModel> {
    await this.findActiveUser(input);

    const now = Date.now();
    const samePhone = and(eq(otpCodesTable.countryCode, input.countryCode), eq(otpCodesTable.phone, input.phone));

    const recent = await db
      .select({ createdAt: otpCodesTable.createdAt })
      .from(otpCodesTable)
      .where(and(samePhone, gt(otpCodesTable.createdAt, new Date(now - OTP_SEND_WINDOW_MS))))
      .orderBy(desc(otpCodesTable.createdAt));

    const last = recent[0]?.createdAt.getTime() ?? 0;
    if (now - last < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - last)) / 1000);
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Wait ${wait} seconds before asking for a new code.` });
    }
    if (recent.length >= OTP_MAX_SENDS_PER_WINDOW) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many codes asked for. Try again in 15 minutes." });
    }

    const code = otpDigits();
    await db.insert(otpCodesTable).values({
      countryCode: input.countryCode,
      phone: input.phone,
      codeHash: sha256(code),
      expiresAt: new Date(now + OTP_TTL_MS),
    });
    await this.otpSender.send(input, code);

    return { resendInSeconds: OTP_RESEND_COOLDOWN_MS / 1000 };
  }

  // a correct code is single-use and opens a session; wrong guesses count against the code
  async verifyOtp(input: VerifyOtpInputModel, client: ClientInfo): Promise<{ token: string; session: AuthSessionModel }> {
    const user = await this.findActiveUser(input);

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

    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The code has expired. Ask for a new one." });
    }

    if (otp.codeHash !== sha256(input.code)) {
      await db.update(otpCodesTable).set({ attempts: otp.attempts + 1 }).where(eq(otpCodesTable.id, otp.id));
      const left = OTP_MAX_ATTEMPTS - otp.attempts - 1;
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: left > 0 ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.` : "Wrong code. Ask for a new one.",
      });
    }

    const token = sessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const sessionId = await db.transaction(async (tx) => {
      // consuming only an unconsumed row stops the same code being used twice in parallel
      const consumed = await tx
        .update(otpCodesTable)
        .set({ consumedAt: new Date() })
        .where(and(eq(otpCodesTable.id, otp.id), isNull(otpCodesTable.consumedAt)))
        .returning({ id: otpCodesTable.id });
      if (consumed.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The code was already used. Ask for a new one." });
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
        .returning({ id: sessionsTable.id });
      return created!.id;
    });

    const session = await this.getSessionById(sessionId);
    return { token, session: session! };
  }

  // valid only while unexpired, unrevoked and the user is active
  // every API request checks the session, and the database is far away (one round trip ≈ 0.25 s),
  // so a valid session is remembered for SESSION_CACHE_MS. Logout forgets it at once; a user
  // deactivated meanwhile keeps access until the entry runs out (at most SESSION_CACHE_MS)
  private readonly sessionCache = new Map<string, { session: AuthSessionModel; until: number }>();

  async getSession(token: string): Promise<AuthSessionModel | null> {
    const tokenHash = sha256(token);
    const cached = this.sessionCache.get(tokenHash);
    if (cached && cached.until > Date.now() && cached.session.expiresAt.getTime() > Date.now()) return cached.session;

    const session = await this.findSession(eq(sessionsTable.tokenHash, tokenHash));
    if (session) this.sessionCache.set(tokenHash, { session, until: Date.now() + SESSION_CACHE_MS });
    else this.sessionCache.delete(tokenHash);
    return session;
  }

  private getSessionById(sessionId: string) {
    return this.findSession(eq(sessionsTable.id, sessionId));
  }

  // one query: the session joined to its user, only while unexpired, unrevoked and the user is active
  private async findSession(match: ReturnType<typeof eq>): Promise<AuthSessionModel | null> {
    const [row] = await db
      .select({
        sessionId: sessionsTable.id,
        expiresAt: sessionsTable.expiresAt,
        elevatedUntil: sessionsTable.elevatedUntil,
        user: {
          id: usersTable.id,
          name: usersTable.name,
          countryCode: usersTable.countryCode,
          phone: usersTable.phone,
          role: usersTable.role,
          photoUrl: usersTable.photoUrl,
        },
      })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
      .where(
        and(
          match,
          isNull(sessionsTable.revokedAt),
          gt(sessionsTable.expiresAt, new Date()),
          eq(usersTable.isActive, true),
        ),
      );
    return row ?? null;
  }

  async logout(sessionId: string) {
    // forget it here first, so the very next request with that cookie is refused
    for (const [hash, entry] of this.sessionCache) if (entry.session.sessionId === sessionId) this.sessionCache.delete(hash);
    await db
      .update(sessionsTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.revokedAt)));
  }
}
