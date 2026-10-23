import { asField, packPriceFromRate, parseAmount, rateFromPackPrice } from "~/lib/price";

export const CODES = ["KGS", "ML", "BOX", "PCS"] as const;
export type Code = (typeof CODES)[number];

// a pack size being typed; the rate (per unit, before GST) and the price (GST included) fill each other in,
// and `from` remembers which was typed last, so a new size or GST % recalculates the other one
export type PackDraft = {
  key: number;
  packSizeCode: Code;
  packSize: string;
  gstPercent: string;
  rate: string;
  priceAfterGst: string;
  from: "rate" | "price";
};

export const emptyPack = (key: number): PackDraft => ({
  key,
  packSizeCode: "KGS",
  packSize: "",
  gstPercent: "",
  rate: "",
  priceAfterGst: "",
  from: "price",
});

// numbers as typed: a pack size is a whole number above 0; GST 0–100; a price 0 or more, up to paise
export const wholeAbove0 = (v: string) => /^\d+$/.test(v.trim()) && Number(v) > 0;
export const percent = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) <= 100;
export const money = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());

// after any change, work out whichever of rate and price wasn't typed last
export function settle(p: PackDraft): PackDraft {
  const size = wholeAbove0(p.packSize) ? Number(p.packSize) : null;
  const gst = parseAmount(p.gstPercent);
  if (size == null || gst == null || gst > 100) return p;
  if (p.from === "rate") {
    const rate = parseAmount(p.rate);
    return rate == null ? p : { ...p, priceAfterGst: asField(packPriceFromRate(rate, size, gst)) };
  }
  const price = parseAmount(p.priceAfterGst);
  return price == null ? p : { ...p, rate: asField(rateFromPackPrice(price, size, gst)) };
}

export const packKey = (code: string, size: string | number) => `${code}:${Number(size)}`;

// what's wrong with one pack size
export const packProblems = (p: PackDraft) => ({
  size: !wholeAbove0(p.packSize),
  gst: !percent(p.gstPercent),
  price: !money(p.priceAfterGst),
});
export const packOk = (p: PackDraft) => !Object.values(packProblems(p)).some(Boolean);

// as the API takes them
export const packInput = (packs: PackDraft[]) =>
  packs.map((p) => ({
    packSizeCode: p.packSizeCode,
    packSize: Number(p.packSize),
    gstPercent: Number(p.gstPercent),
    priceAfterGst: Number(p.priceAfterGst),
  }));
