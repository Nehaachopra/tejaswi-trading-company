import type { RouterOutputs } from "@repo/trpc/client";
import { type PaymentKind } from "../pickers/ledger-picker";

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
export { BANK_MODES } from "../shared/bank-mode";

export type Loan = RouterOutputs["transactions"]["due"]["openLoans"][number];

// the cards, in order (only the ones that apply are shown)
export type Step =
  "kind" | "to" | "payee" | "gst" | "terms" | "rent" | "amount" | "source" | "details";

// what it can be paid for, in the order people reach for them; which go to a party (found or added), and which name
// an open loan we took
export const KINDS: PaymentKind[] = [
  "supplier",
  "loanRepaid",
  "interestPaid",
  "loanGiven",
  "expense",
  "taxPaid",
  "refund",
];
export const PARTY_KINDS: PaymentKind[] = ["supplier", "loanGiven", "refund"];
export const LOAN_KINDS: PaymentKind[] = ["loanRepaid", "interestPaid"];

// an expense's GST: none, or on the supplier's bill
export type GstMode = "none" | "bill";
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const BILL_RATES = [5, 12, 18, 28, 40] as const;
export const BILL_NUMBER_MAX = 16;
// the most labour can be paid with nobody named: one payment up to this carries no TDS
export const LABOUR_SKIP_MAX = 30_000;

// section 40A(3): an expense paid in cash above this to one person in a day can't be claimed (more for a transporter)
export const CASH_EXPENSE_LIMIT = 10_000;
export const CASH_TRANSPORT_LIMIT = 35_000;
// what pays an expense the cash limit is about: purchases, expenses, and interest
export const CASH_LIMIT_KINDS: PaymentKind[] = ["supplier", "expense", "interestPaid"];
