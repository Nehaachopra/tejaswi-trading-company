import type { RouterOutputs } from "@repo/trpc/client";

import { type ReceiptKind } from "../pickers/ledger-picker";

// the field looks, lengths and helpers both money forms use
export {
  REMARKS_MAX,
  REFERENCE_MAX,
  type SummaryLine,
  type MorePart,
  input,
  chip,
  money,
  isParty,
  momentOf,
  saidAmount,
} from "../shared/form-basics";

export type Loan = RouterOutputs["transactions"]["due"]["openLoans"][number];

// the cards, in order (only the ones that apply are shown); "into" is where it came into, on the Amount card
export type Step = "kind" | "from" | "buyer" | "terms" | "amount" | "into" | "details";

// what it can be received for, in the order people reach for them; which come from a party found or added, which
// can add a ledger of their own, and which name an open loan we gave
export const KINDS: ReceiptKind[] = [
  "customer",
  "loanTaken",
  "loanReturned",
  "interestReceived",
  "capital",
  "otherIncome",
  "refund",
];
export const PARTY_KINDS: ReceiptKind[] = ["customer", "loanTaken"];
export const LEDGER_KINDS: ReceiptKind[] = ["otherIncome", "refund"];
export const LOAN_KINDS: ReceiptKind[] = ["loanReturned", "interestReceived"];

// who gave a loan we took: a bank or NBFC is a lender, never a party
export const LENDERS = ["bank", "nbfc", "individual"] as const;
export type Lender = (typeof LENDERS)[number];

// the TDS a party usually deducts, filled in when they say they did: a customer under 194Q, a borrower on interest
export const TDS_RATE: Partial<Record<ReceiptKind, string>> = {
  customer: "0.1",
  interestReceived: "10",
};

// the TDS a party deducted from what they owed, as the server works it out: what came in is what's left after it
export const tdsOn = (received: number, rate: number) =>
  Math.round((received / (1 - rate / 100) - received) * 100) / 100;
