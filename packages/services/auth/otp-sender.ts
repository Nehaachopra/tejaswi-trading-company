import { logger } from "@repo/logger";

import type { PhoneModel } from "./model";

export interface OtpSender {
  send(to: PhoneModel, code: string): Promise<void>;
}

// Temporary delivery until the MSG91 DLT number is approved (tracker 3.15):
// the code is written to the API log instead of an SMS. The login flow is unchanged.
export class LogOtpSender implements OtpSender {
  async send(to: PhoneModel, code: string) {
    logger.info(`OTP for ${to.countryCode}${to.phone}: ${code}`);
  }
}
