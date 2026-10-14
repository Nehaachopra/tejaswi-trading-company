import { z } from "zod";

export const phoneModel = z.object({
  countryCode: z
    .string()
    .regex(/^\+\d{1,4}$/, "country code like +91")
    .default("+91"),
  phone: z.string().regex(/^\d{6,15}$/, "digits only"),
});

export type PhoneModel = z.infer<typeof phoneModel>;

export const requestOtpInputModel = phoneModel;

export type RequestOtpInputModel = z.infer<typeof requestOtpInputModel>;

export const requestOtpOutputModel = z.object({
  expiresAt: z.date(),
  resendAfterSeconds: z.number().int(),
});

export type RequestOtpOutputModel = z.infer<typeof requestOtpOutputModel>;

export const verifyOtpInputModel = phoneModel.extend({
  code: z.string().regex(/^\d{6}$/, "6-digit code"),
});

export type VerifyOtpInputModel = z.infer<typeof verifyOtpInputModel>;

export const sessionUserModel = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(["admin", "accountant", "staff"]),
  countryCode: z.string(),
  phone: z.string(),
  photoUrl: z.string().nullable(),
});

export type SessionUserModel = z.infer<typeof sessionUserModel>;

export const authSessionModel = z.object({
  sessionId: z.string().uuid(),
  user: sessionUserModel,
  expiresAt: z.date(),
  elevatedUntil: z.date().nullable(),
});

export type AuthSessionModel = z.infer<typeof authSessionModel>;

export type CreatedSession = {
  token: string;
  session: AuthSessionModel;
};

export type ClientInfo = {
  ipAddress?: string;
  userAgent?: string;
};
