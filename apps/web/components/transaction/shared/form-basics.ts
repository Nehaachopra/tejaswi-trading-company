import { fieldClass } from "~/components/ui/card-form";
import { wordsToNumber } from "~/lib/number-words";
import { cn } from "~/lib/utils";

import { type BankMode } from "@repo/trpc/client";

import { indiaDay } from "../../account/balance";
import { type Pickable } from "../pickers/ledger-picker";

// what the receipt and payment forms share: field and chip looks, the lengths the columns hold, and small helpers

// remarks and a reference, as long as their columns hold (remarks 100, reference_number varchar 30)
export const REMARKS_MAX = 100;
export const REFERENCE_MAX = 30;

// a summary line: words, or a name with its amount on the right; a step can have several, one under another
export type SummaryLine = string | { name: string; amount: string };

// another bank account taking part of the bank's share: which account, its amount as typed, and how it went
export type MorePart = {
  key: string;
  bankId: string | null;
  amount: string;
  mode: BankMode | null;
};

// a text field, red when it's wrong
export const input = (bad: boolean) =>
  `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// a chip to pick one of a few, filled once picked
export const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-control border px-3.5 text-sm font-semibold transition-colors",
    on ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50 hover:bg-chestnut/[0.06]",
  );

// an amount, large and bold
export const money = "tabular font-heading font-bold leading-tight";

// a ledger of a customer or supplier (or a party with no sale or purchase yet): only they take or have TDS deducted
export const isParty = (l: Pickable) =>
  l.masterKey === "debtors" ||
  l.masterKey === "creditors" ||
  l.masterKey === "debtorCreditors" ||
  l.masterKey === "parties";

// a day as the moment it's saved at: now for today, noon (India) for any other day
export const momentOf = (day: string) =>
  day === indiaDay(new Date()) ? new Date() : new Date(`${day}T12:00:00+05:30`);

// how far back staff may date a transaction (the server holds them to the same); the admin may go back as far as needed
export const STAFF_DAYS_BACK = 7;
// the earliest day the date picker offers: none for the admin, a week back for staff
export const earliestDay = (isAdmin: boolean) =>
  isAdmin ? undefined : indiaDay(new Date(Date.now() - STAFF_DAYS_BACK * 24 * 60 * 60 * 1000));

// a spoken amount ("twenty five thousand") into a number field; anything that isn't a number is left alone
export const saidAmount = (said: string, set: (raw: string) => void) => {
  const n = wordsToNumber(said);
  if (n !== null) set(String(n));
};
