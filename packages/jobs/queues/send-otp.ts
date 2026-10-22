import type { Job } from "pg-boss";
import { OTP_TTL_MS } from "@repo/services/auth";
import type { PhoneModel } from "@repo/services/auth/model";
import { LogOtpSender } from "@repo/services/auth/otp-sender";
import { logger } from "@repo/logger";

import { unseal } from "../secret";

export type SendOtpData = PhoneModel & { sealedCode: string; requestedAt: number };

// swap for the MSG91 sender once the DLT number is approved
const otpSender = new LogOtpSender();

// a failed SMS is retried quickly (about 2 s, 4 s, 8 s), well inside the code's 5 minutes
export const sendOtpQueue = {
  name: "send-otp",
  options: { retryLimit: 3, retryDelay: 2, retryBackoff: true, retryDelayMax: 30, expireInSeconds: 30 },
} as const;

export async function sendOtp([job]: Job<SendOtpData>[]) {
  const { countryCode, phone, sealedCode, requestedAt } = job!.data;

  // once the code has expired there's no point sending it; the job completes and says why
  if (Date.now() - requestedAt > OTP_TTL_MS) {
    logger.warn(`OTP for ${countryCode}${phone} expired before it could be sent (job ${job!.id})`);
    return { sent: false, reason: "expired" };
  }

  try {
    await otpSender.send({ countryCode, phone }, unseal(sealedCode));
    return { sent: true };
  } catch (error) {
    // the thrown error is stored on the job; this line shows the attempt in the API log
    logger.error(`OTP send failed for ${countryCode}${phone} (job ${job!.id}, attempt ${job!.retryCount + 1})`, { error });
    throw error;
  }
}
