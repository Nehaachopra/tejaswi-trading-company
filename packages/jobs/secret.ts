import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "./env";

// job data sits in the pgboss tables for days; secrets in it are sealed with AES-256-GCM
const key = env.JOBS_ENCRYPTION_KEY
  ? Buffer.from(env.JOBS_ENCRYPTION_KEY, "hex")
  : createHash("sha256").update("ttc-local-development-only").digest();

export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function unseal(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}
