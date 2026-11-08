"use client";

import { useTranslations } from "next-intl";

import { cn } from "~/lib/utils";

export type TdsType = "rent" | "contract" | "brokerage";

const CHOICES: (TdsType | null)[] = [null, "rent", "contract", "brokerage"];

// the TDS an expense head's payments carry, picked once when it's added (or edited): none, rent, transport and
// labour (contract work), or brokerage; the website works out each payment's TDS from it
export function TdsTypePicker({
  value,
  onChange,
}: {
  value: TdsType | null;
  onChange: (v: TdsType | null) => void;
}) {
  const t = useTranslations("transactions.tdsTypes");
  return (
    <div role="radiogroup" aria-label={t("label")} className="flex flex-col gap-2.5">
      <span className="text-xs font-semibold">{t("label")}</span>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <button
            key={c ?? "none"}
            type="button"
            role="radio"
            aria-checked={value === c}
            onClick={() => onChange(c)}
            className={cn(
              "min-h-11 rounded-control border px-3.5 text-sm font-semibold transition-colors",
              value === c
                ? "border-chestnut bg-chestnut text-ivory"
                : "border-chestnut/50 hover:bg-chestnut/[0.06]",
            )}
          >
            {t(c ?? "none")}
          </button>
        ))}
      </div>
      <span className="text-xs text-chestnut/70">{t("hint")}</span>
    </div>
  );
}
