"use client";

import { useTranslations } from "next-intl";

import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";

import { fieldRow } from "../../transaction/shared/form-basics";

// a ₹ field as in the drawers: no border, a soft shadow, ₹ on the left and the figure on the right
const box = "flex min-h-11 items-center gap-[3px] rounded-control px-3 shadow-[0_0_5px_0] transition-shadow";
const boxInput = "tabular w-full min-w-0 flex-1 bg-transparent text-right text-base outline-none";
// a field's label, as in the payment forms
export const fieldLabel = "flex min-w-0 flex-col gap-2.5 text-xs font-semibold";

// Rate / unit beside the chestnut Price + GST, as on the price change card, or as two rows (label left, box right) in
// Add product; the parent fills each in from the other
export function RatePriceFields({
  unit,
  rate,
  price,
  onRate,
  onPrice,
  priceInvalid = false,
  autoFocus = false,
  rows = false,
  placeholders,
  className,
}: {
  unit: string;
  rate: string;
  price: string;
  onRate: (v: string) => void;
  onPrice: (v: string) => void;
  priceInvalid?: boolean;
  autoFocus?: boolean;
  rows?: boolean;
  placeholders?: { rate: string; price: string };
  className?: string;
}) {
  const t = useTranslations("products.items");
  const label = rows ? fieldRow : fieldLabel;
  return (
    <div className={cn(rows ? "flex flex-col gap-3.5" : "grid grid-cols-2 gap-2", className)}>
      {/* rate per unit */}
      <label className={label}>
        <span className="truncate">{t("ratePer", { unit })}</span>
        <span className={cn(box, "shadow-chestnut/40 focus-within:shadow-chestnut/80")}>
          <span className="text-base text-chestnut/60">₹</span>
          <NumberInput
            value={rate}
            decimals={2}
            maxDigits={6}
            onChange={onRate}
            placeholder={placeholders?.rate}
            className={cn(boxInput, "placeholder:text-chestnut/50")}
          />
        </span>
      </label>
      {/* the price with GST, chestnut, starred as required (rate never is) */}
      <label className={label}>
        <span className="truncate">
          {t("priceWithGst")}
          <RequiredMark />
        </span>
        <span
          className={cn(
            box,
            "bg-chestnut text-ivory",
            priceInvalid ? "shadow-danger focus-within:shadow-danger" : "shadow-chestnut/40 focus-within:shadow-chestnut/80",
          )}
        >
          <span className="text-base text-ivory/70">₹</span>
          <NumberInput
            autoFocus={autoFocus}
            value={price}
            decimals={2}
            maxDigits={7}
            onChange={onPrice}
            placeholder={placeholders?.price}
            aria-invalid={priceInvalid || undefined}
            className={cn(boxInput, "caret-ivory placeholder:text-ivory/50")}
          />
        </span>
      </label>
    </div>
  );
}
