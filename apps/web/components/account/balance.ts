import { rupees } from "~/lib/format";

export type Balance = { amount: number; side: "debit" | "credit" };

export type Head = "asset" | "liability" | "income" | "expense" | "profit" | "loss";

// the side a head's accounts usually sit on: assets and expenses are debits, liabilities and income credits
export const usualSide = (head: Head): Balance["side"] => (head === "asset" || head === "expense" || head === "loss" ? "debit" : "credit");

// a balance signed by its head: on the usual side it is plus (cash we hold, what a customer owes us, what we owe a
// supplier), on the other side minus (an overdraft, a customer's advance). `negative` is for showing it in red
export function signed(b: Balance, head: Head) {
  const negative = b.amount !== 0 && b.side !== usualSide(head);
  return { text: `${negative ? "−" : ""}${rupees(b.amount)}`, negative };
}

// a balance as accountants write it, for inside a ledger: ₹60,000 Dr · ₹1,250.50 Cr (zero has no side)
export const balanceText = (b: Balance) => (b.amount === 0 ? rupees(0) : `${rupees(b.amount)} ${b.side === "debit" ? "Dr" : "Cr"}`);

// what post-dated entries will add, signed by the head: "+ ₹1,000" or "− ₹1,000"
export const postDatedText = (b: Balance, head: Head) => `${b.side === usualSide(head) ? "+" : "−"} ${rupees(b.amount)}`;

// a date in India, as text the date field takes: "2026-04-01"
export const indiaDay = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(d));

// that day's first moment in India, for the API
export const startOfIndiaDay = (day: string) => new Date(`${day}T00:00:00+05:30`);
