// a pack's price can be typed two ways: the rate per kg (or ml, box, piece) before GST, or the pack's
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

// as typed into a field: no trailing ".00"
export const asField = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
