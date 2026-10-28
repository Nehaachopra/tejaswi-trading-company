import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// a voucher shared with a customer opens without a login: its link carries a key made from the transaction's id and
// a secret only the server has, so no one can work out the link to anyone else's voucher. VOUCHER_LINK_SECRET is
// required in prod; development uses a fixed one
const secret = (() => {
  const set = process.env.VOUCHER_LINK_SECRET;
  if (set) return set;
  const mode: string | undefined = process.env.NODE_ENV;
  if (mode === "prod" || mode === "production") {
    throw new Error("VOUCHER_LINK_SECRET is required in prod");
  }
  return createHash("sha256").update("ttc-local-development-only").digest("hex");
})();

// the key for one transaction's voucher
export function voucherKey(transactionId: string) {
  return createHmac("sha256", secret).update(`voucher:${transactionId}`).digest("base64url").slice(0, 32);
}

// whether a key opens this transaction's voucher
export function opensVoucher(transactionId: string, key: string) {
  const want = Buffer.from(voucherKey(transactionId));
  const got = Buffer.from(key);
  return want.length === got.length && timingSafeEqual(want, got);
}
