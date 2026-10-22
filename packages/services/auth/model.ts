import { z } from "zod";

export const roleModel = z.enum(["admin", "staff"]);

export type RoleModel = z.infer<typeof roleModel>;

// Indian numbers only for now: +91 and ten digits
export const phoneModel = z.object({
  countryCode: z.literal("+91").default("+91"),
  phone: z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit mobile number."),
});

export type PhoneModel = z.infer<typeof phoneModel>;

export const requestOtpInputModel = phoneModel;

export type RequestOtpInputModel = z.infer<typeof requestOtpInputModel>;

export const requestOtpOutputModel = z.object({
  // seconds until another code can be sent
  resendInSeconds: z.number().int(),
});

export type RequestOtpOutputModel = z.infer<typeof requestOtpOutputModel>;

export const verifyOtpInputModel = phoneModel.extend({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export type VerifyOtpInputModel = z.infer<typeof verifyOtpInputModel>;

export const sessionUserModel = z.object({
  id: z.string().uuid(),
  name: z.string(),
  countryCode: z.string(),
  phone: z.string(),
  role: roleModel,
  photoUrl: z.string().nullable(),
});

export const authSessionModel = z.object({
  sessionId: z.string().uuid(),
  user: sessionUserModel,
  expiresAt: z.date(),
  elevatedUntil: z.date().nullable(),
});

export type AuthSessionModel = z.infer<typeof authSessionModel>;

// where a login came from, kept on the session
export type ClientInfo = {
  ipAddress?: string;
  userAgent?: string;
};
