// names are stored lowercase and shown in Title Case: "sona masoori" → "Sona Masoori"
export const titleCase = (name: string) => name.replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());

// rupees with Indian grouping; paise only when there are some: ₹1,45,000 · ₹620.50
export const rupees = (amount: number) =>
  "₹ " +
  amount.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });

// a pack size as people say it: 25 kg, 500 ml, 1 box, 12 pcs
const UNIT = { KGS: "kg", ML: "ml", BOX: "box", PCS: "pcs" } as const;
export const packLabel = (packSize: number, packSizeCode: keyof typeof UNIT) => `${packSize} ${UNIT[packSizeCode]}`;

// the first letters of up to two words: "india gate" → "IG"
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
