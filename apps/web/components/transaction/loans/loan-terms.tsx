"use client";

import { useTranslations } from "next-intl";

import { fieldClass } from "~/components/ui/card-form";
import { NumberInput } from "~/components/ui/number-input";
import { wordsToNumber } from "~/lib/number-words";
import { MicButton } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";
import { fieldRow, pickRow } from "../shared/form-basics";
import { PlacePicker } from "../shared/place-picker";

type Frequency = "monthly" | "quarterly" | "half_yearly" | "yearly";

// a loan's terms as typed: loans only carry interest, its rate (text while typing) and how often it's paid
export type LoanDraft = { rate: string; frequency: Frequency | null };

export const emptyLoan = (): LoanDraft => ({ rate: "", frequency: null });

const FREQUENCIES: Frequency[] = ["monthly", "quarterly", "half_yearly", "yearly"];

export function loanProblems(d: LoanDraft) {
  const rate = Number(d.rate);
  return { rate: d.rate === "" || !(rate >= 0 && rate <= 100), frequency: d.frequency === null };
}

// the terms as the API takes them
export const loanInput = (d: LoanDraft) => ({
  interestRate: Number(d.rate),
  frequency: d.frequency!,
});

const input = (bad: boolean) =>
  `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// a loan's interest: the rate a year (0 = interest-free) and how often it's paid
export function LoanTerms({
  draft,
  onChange,
  tried,
}: {
  draft: LoanDraft;
  onChange: (patch: Partial<LoanDraft>) => void;
  tried: boolean;
}) {
  const t = useTranslations("transactions.loan");
  const bad = loanProblems(draft);
  const show = (k: keyof typeof bad) => tried && bad[k];

  return (
    // the rate, and how often it's paid beside it (under it on a phone)
    <div className="grid items-start gap-x-6 gap-y-3 sm:grid-cols-2">
      {/* the rate */}
      <label className={fieldRow}>
        <span>
          {t("rate")}
          <RequiredMark />
        </span>
        {/* the box with % at its right end, the mic outside it, beside the % */}
        <span className="flex min-w-0 items-center gap-2">
          <span className="relative block min-w-0 flex-1">
            <NumberInput
              value={draft.rate}
              onChange={(rate) => onChange({ rate })}
              decimals={2}
              maxDigits={3}
              max={100}
              placeholder="0"
              aria-invalid={show("rate") || undefined}
              className={cn(input(show("rate")), "tabular pr-8 text-right")}
            />
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base font-semibold"
              aria-hidden
            >
              %
            </span>
          </span>
          <MicButton
            throughPauses
            onText={(said) => {
              const n = wordsToNumber(said);
              if (n !== null && n <= 100) onChange({ rate: String(n) });
            }}
          />
        </span>
      </label>

      {/* how often it's paid: an accordion, all four open until one is picked, then closed to the pick */}
      <div className={pickRow}>
        <span>
          {t("frequency")}
          <RequiredMark />
        </span>
        <PlacePicker
          label={t("frequency")}
          places={FREQUENCIES.map((f) => ({ id: f, name: t(`frequencies.${f}`), disabled: false }))}
          value={draft.frequency}
          onPick={(frequency) => onChange({ frequency })}
          invalid={show("frequency")}
        />
      </div>
    </div>
  );
}
