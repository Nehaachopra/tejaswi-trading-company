"use client";

import { IndianRupee } from "lucide-react";

import { MicButton } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { saidAmount } from "./form-basics";

// To receive (a sale's Received card, new and edit) and To pay (a purchase's Paid card): its name on the left, the amount in a chestnut box as wide as the
// rows' figures, the mic/arrow column at the right end (the mic for a typed one, empty for a fixed one). Fixed (a
// walk-in's, a refund): the amount itself on chestnut, nothing to tap. Typed (a customer's): an ivory box to type in
// inside the chestnut, so what's typed reads apart from what's given at a glance; both the same size
// the mic/arrow column at the right end, as Line's
const slot = "grid size-10 shrink-0 place-items-center";

export function FixedBanner({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex min-h-11 min-w-0 flex-1 items-center text-sm font-semibold">
        {label}
      </span>
      <span className="tabular flex min-h-14 w-[55%] shrink-0 items-center justify-end rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
        {rupees(amount)}
      </span>
      <span className={slot} aria-hidden />
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
  required = true,
  onCapped,
  rupee = true,
  decimals = 2,
  maxDigits = 13,
  placeholder = "0",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (raw: string) => void;
  max?: number;
  invalid: boolean;
  // its * (a new sale's drops it once an advance is set off)
  required?: boolean;
  // typing past `max` (a purchase's cash and banks) cut there, to warn
  onCapped?: (most: number) => void;
  // not money (interest's Months): no ₹, a whole number of a few digits
  rupee?: boolean;
  decimals?: number;
  maxDigits?: number;
  placeholder?: string;
}) {
  return (
    // its name on the left, as any row's; the chestnut frame around the box only, as wide as the rows' figures (a tap
    // on the frame focuses the box); the mic in the column beside
    <div className="flex min-w-0 items-center gap-2">
      <label
        htmlFor={id}
        className="flex min-h-11 min-w-0 flex-1 items-center text-sm font-semibold"
      >
        {label}
        {required && <RequiredMark />}
      </label>
      <label
        htmlFor={id}
        className="relative flex w-[55%] shrink-0 cursor-text items-center rounded-control bg-chestnut p-2"
      >
        {/* the box: ₹ on its left, what's typed at its right */}
        <span className="relative block w-full min-w-0">
          {rupee && (
            <IndianRupee
              className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-chestnut/70"
              aria-hidden
            />
          )}
          <NumberInput
            id={id}
            value={value}
            decimals={decimals}
            maxDigits={maxDigits}
            max={max}
            onCapped={onCapped}
            placeholder={placeholder}
            onChange={onChange}
            aria-invalid={invalid || undefined}
            className={cn(
              "tabular min-h-10 w-full rounded-[8px] bg-ivory pr-2.5 pt-1 text-right font-heading text-2xl font-bold text-chestnut caret-chestnut outline-none placeholder:text-chestnut/30 focus-visible:outline-none",
              rupee ? "pl-8" : "pl-2.5",
              invalid && "ring-2 ring-ivory",
            )}
          />
        </span>
      </label>
      <span className={slot}>
        <MicButton
          onText={(said) => saidAmount(said, onChange)}
          className="rounded-[var(--radius-control)]"
        />
      </span>
    </div>
  );
}
