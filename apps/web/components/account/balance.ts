import { rupees } from "~/lib/format";

export type Balance = { amount: number; side: "debit" | "credit" };

// a balance as accountants write it: ₹60,000 Dr · ₹1,250.50 Cr (zero has no side)
export const balanceText = (b: Balance) => (b.amount === 0 ? rupees(0) : `${rupees(b.amount)} ${b.side === "debit" ? "Dr" : "Cr"}`);

// what post-dated entries will add, from the ledger's usual side: "+ ₹1,000" (same side) or "− ₹1,000"
export const postDatedText = (b: Balance, usual: Balance["side"]) => `${b.side === usual ? "+" : "−"} ${rupees(b.amount)}`;

// a date in India, as text the date field takes: "2026-04-01"
export const indiaDay = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(d));

// that day's first moment in India, for the API
export const startOfIndiaDay = (day: string) => new Date(`${day}T00:00:00+05:30`);
