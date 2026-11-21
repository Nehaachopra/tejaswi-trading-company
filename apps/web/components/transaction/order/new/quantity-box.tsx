"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { NumberInput } from "~/components/ui/number-input";
import { cn } from "~/lib/utils";

// how many: − and + at the two ends, the number between (never below `min`, never above `max`; `cut` when more
// was typed)
export function QuantityBox({
  value,
  onChange,
  name,
  max = 99_999,
  min = 1,
  invalid = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string, cut: boolean) => void;
  name: string;
  max?: number;
  min?: number;
  // required and not typed (after Add was tapped): a red ring
  invalid?: boolean;
  // the cursor starts here when its card opens
  autoFocus?: boolean;
}) {
  const t = useTranslations("orders");
  const quantity = Number(value) || 0;
  const set = (n: number) => onChange(String(Math.min(max, Math.max(min, n))), false);
  return (
    <div className={cn("flex min-h-11 w-full shrink-0 items-center justify-between rounded-control bg-chestnut text-ivory", invalid && "ring-2 ring-danger")}>
      <button
        type="button"
        aria-label={`${t("less")}: ${name}`}
        disabled={quantity <= min}
        onClick={() => set(quantity - 1)}
        className="grid h-11 w-8 shrink-0 place-items-center disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <NumberInput
        autoFocus={autoFocus}
        value={value}
        maxDigits={5}
        placeholder="0"
        onChange={(v) => {
          const typed = v.replace(/^0+(?=\d)/, "");
          onChange(Number(typed) > max ? String(max) : typed, Number(typed) > max);
        }}
        // (left empty stays empty: nothing is filled in for the user)
        onBlur={() => value !== "" && quantity < min && set(min)}
        aria-label={`${t("quantity")}: ${name}`}
        className="tabular w-full min-w-0 flex-1 bg-transparent text-center text-base font-bold caret-ivory outline-none placeholder:text-ivory/45"
      />
      <button
        type="button"
        aria-label={`${t("more")}: ${name}`}
        disabled={quantity >= max}
        onClick={() => set(quantity + 1)}
        className="grid h-11 w-8 shrink-0 place-items-center disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
