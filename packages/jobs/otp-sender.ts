import type { PhoneModel } from "@repo/services/auth/model";
import type { OtpSender } from "@repo/services/auth/otp-sender";

import { boss } from "./boss";
import { type SendOtpData, sendOtpQueue } from "./queues/send-otp";
import { seal } from "./secret";

// AuthService hands the code over and answers straight away; the send-otp worker delivers it
export class QueuedOtpSender implements OtpSender {
  async send(to: PhoneModel, code: string) {
    const data: SendOtpData = { ...to, sealedCode: seal(code), requestedAt: Date.now() };
    await boss.send(sendOtpQueue.name, data);
  }
}
