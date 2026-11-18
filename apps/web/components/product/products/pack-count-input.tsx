"use client";

import { useTranslations } from "next-intl";

import { fieldClass } from "~/components/ui/card-form";
import { NumberInput } from "~/components/ui/number-input";
import { cn } from "~/lib/utils";

// after a pack size's unit: a box reading "× 10", how many of that size make one pack (1 ltr × 10), 1 to start; whole numbers,
// never below 1, up to 4 digits
export function PackCountInput({
  value,
  onChange,
  invalid = false,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const t = useTranslations("products.items");
  return (
    // the × sits inside the box, before the number, so the box reads "× 10"
    <span className="relative flex w-14 shrink-0 items-center">
      <span aria-hidden className="pointer-events-none absolute left-2 text-sm opacity-70">
        ×
      </span>
      <NumberInput
        aria-label={t("form.packCount")}
        value={value}
        maxDigits={4}
        placeholder="1"
        onChange={(v) => onChange(v.replace(/^0+/, ""))}
        aria-invalid={invalid || undefined}
        className={cn("tabular min-h-11 w-full min-w-0 pl-5 pr-2 text-right text-base placeholder:text-chestnut/50", fieldClass(invalid))}
      />
    </span>
  );
}
