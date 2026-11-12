"use client";

import { useTranslations } from "next-intl";

import { PlacePicker } from "../../transaction/shared/place-picker";

// the GST slabs since the September 2025 change
const SLABS = ["0", "5", "18", "40"];

// GST % as an accordion, as Paid from: every slab open as a row until one is picked, then collapsed to it with ▾.
// A saved rate that isn't a slab any more (an old 12%) is kept as a row too, so it still shows
export function GstPicker({
  value,
  onPick,
  invalid,
  pickEnd = false,
}: {
  value: string;
  onPick: (gst: string) => void;
  invalid: boolean;
  pickEnd?: boolean;
}) {
  const t = useTranslations("products.items");
  const rates = value !== "" && !SLABS.includes(value) ? [...SLABS, value].sort((a, b) => Number(a) - Number(b)) : SLABS;
  return (
    <PlacePicker
      label={t("gstLabel")}
      places={rates.map((r) => ({ id: r, name: `${r}%`, disabled: false }))}
      value={value === "" ? null : value}
      onPick={onPick}
      invalid={invalid}
      pickEnd={pickEnd}
    />
  );
}
