"use client";

import { IndianRupee } from "lucide-react";

import { MicButton } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { saidAmount } from "../shared/form-basics";

// To receive on the sale edit (tried there first). Fixed (a walk-in's, a refund): one chestnut strip across the column,
// its name inside, the amount itself, nothing to tap. Typed (a customer's): its name on the left, then a chestnut frame
// around an ivory box to type in and the mic, so what's typed reads apart from what's given at a glance
const strip =
  "relative flex min-h-16 w-full items-center justify-between gap-2.5 rounded-control bg-chestnut py-2.5 pl-4 pr-2.5 text-ivory";

export function FixedBanner({ label, amount }: { label: string; amount: number }) {
  return (
    <div className={cn(strip, "pr-4")}>
      <span className="min-w-0 text-[15px] font-semibold">{label}</span>
      <span className="tabular shrink-0 pt-1 font-heading text-[28px] font-bold leading-none">
        {rupees(amount)}
      </span>
    </div>
  );
}

export function TypedBanner({
  id,
  label,
  value,
  onChange,
  max,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (raw: string) => void;
  max?: number;
  invalid: boolean;
}) {
  return (
    // its name on the left, as any row's; the chestnut frame only around the box and the mic (a tap on the frame
    // focuses the box)
    <div className="flex min-w-0 items-center justify-between gap-3">
      <label htmlFor={id} className="flex min-w-0 items-center text-sm">
        {label}
        <RequiredMark />
      </label>
      <label
        htmlFor={id}
        className="relative flex min-w-0 cursor-text items-center gap-1 rounded-control bg-chestnut p-1.5 text-ivory"
      >
        {/* the box: ₹ on its left, what's typed at its right */}
        <span className="relative block w-40 min-w-0 max-w-full">
          <IndianRupee
            className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-chestnut/70"
            aria-hidden
          />
          <NumberInput
            id={id}
            value={value}
            decimals={2}
            maxDigits={13}
            max={max}
            placeholder="0"
            onChange={onChange}
            aria-invalid={invalid || undefined}
            className={cn(
              "tabular min-h-11 w-full rounded-[8px] bg-ivory pl-8 pr-2.5 text-right text-base font-bold text-chestnut caret-chestnut outline-none placeholder:text-chestnut/30 focus-visible:outline-none",
              invalid && "ring-2 ring-ivory",
            )}
          />
        </span>
        <MicButton
          onText={(said) => saidAmount(said, onChange)}
          className="shrink-0 rounded-[8px] text-ivory hover:bg-ivory/15"
        />
      </label>
    </div>
  );
}
