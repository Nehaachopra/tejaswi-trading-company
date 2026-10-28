// an amount in words, the Indian way (lakh and crore), for vouchers: 1,25,000.50 → "One Lakh Twenty Five Thousand
// Rupees and Fifty Paise Only"
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

// 0 to 99
const twoDigits = (n: number) => (n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]!}${n % 10 ? ` ${ONES[n % 10]!}` : ""}`);

// 0 to 999
const threeDigits = (n: number) => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]!} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
};

// a whole number in words: crore, lakh, thousand, then the rest
function whole(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${whole(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

export function amountInWords(amount: number) {
  const paise = Math.round(amount * 100);
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `${whole(rupees)} Rupees${rest ? ` and ${twoDigits(rest)} Paise` : ""} Only`;
}
