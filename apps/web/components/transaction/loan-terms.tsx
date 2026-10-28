"use client";

import { useTranslations } from "next-intl";

import { fieldClass } from "~/components/ui/card-form";
import { NumberInput } from "~/components/ui/number-input";
import { wordsToNumber } from "~/lib/number-words";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";

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
export const loanInput = (d: LoanDraft) => ({ interestRate: Number(d.rate), frequency: d.frequency! });

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;
const chip = (on: boolean) => cn("min-h-10 rounded-control border px-3 text-sm font-medium", on ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50");

// a loan's interest: the rate a year (0 = interest-free) and how often it's paid
export function LoanTerms({ draft, onChange, tried }: { draft: LoanDraft; onChange: (patch: Partial<LoanDraft>) => void; tried: boolean }) {
  const t = useTranslations("transactions.loan");
  const bad = loanProblems(draft);
  const show = (k: keyof typeof bad) => tried && bad[k];

  return (
    <div className="flex flex-col gap-4">
      {/* the rate */}
      <label className="flex w-40 flex-col gap-1.5 text-sm font-medium">
        <span>
          {t("rate")}
          <RequiredMark />
        </span>
        <MicField
          throughPauses
          onText={(said) => {
            const n = wordsToNumber(said);
            if (n !== null && n <= 100) onChange({ rate: String(n) });
          }}
        >
          <NumberInput value={draft.rate} onChange={(rate) => onChange({ rate })} decimals={2} maxDigits={3} max={100} placeholder="0" aria-invalid={show("rate") || undefined} className={cn(input(show("rate")), "pr-11")} />
        </MicField>
      </label>

      {/* how often it's paid */}
      <div role="radiogroup" aria-label={t("frequency")} className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {t("frequency")}
          <RequiredMark />
        </span>
        <div className={cn("flex flex-wrap gap-2 rounded-control", show("frequency") && "outline-2 outline-offset-2 outline-danger")}>
          {FREQUENCIES.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={draft.frequency === f} onClick={() => onChange({ frequency: f })} className={chip(draft.frequency === f)}>
              {t(`frequencies.${f}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
