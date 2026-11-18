// a pack's price can be typed two ways: the rate per kg (or litre, box, piece) before GST, or the pack's
// price with GST; either one fills in the other

const round2 = (v: number) => Math.round(v * 100) / 100;

// a number as typed, or null when it isn't one yet
export const parseAmount = (v: string) => (/^\d+(\.\d{1,2})?$/.test(v.trim()) ? Number(v) : null);

// rate per unit (before GST) × pack size, plus GST → the pack's price with GST
export function packPriceFromRate(rate: number, packSize: number, gstPercent: number) {
  return round2(rate * packSize * (1 + gstPercent / 100));
}

// the pack's price with GST, less GST, ÷ pack size → the rate per unit (before GST)
export function rateFromPackPrice(price: number, packSize: number, gstPercent: number) {
  return round2(price / (1 + gstPercent / 100) / packSize);
}

// how many kg (or litres, boxes, pieces) one pack holds: its size × how many of that size are in it (1 ltr × 10 →
// 10). Every rate per unit is worked on this
export const unitsIn = (p: { packSize: number; packCount?: number }) => p.packSize * (p.packCount ?? 1);

// as typed into a field: no trailing ".00"
export const asField = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
