"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ClearButton } from "~/components/ui/clear-button";
import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_BAR, FILTER_TRIGGER, SEARCH_BOX, SEARCH_INPUT } from "~/components/ui/page-styles";
import { cn } from "~/lib/utils";
import { useHistoryMonths } from "~/providers/history";

// the kinds of transaction History lists (opening balances stay on their own page; returns join once they're built)
export const HISTORY_TYPES = ["sale", "purchase", "receipt", "payment", "deposit", "withdrawal", "transfer", "drawing", "salary", "other"] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];

// the amount ranges, each from just over the last one's top
export const AMOUNT_RANGES = {
  upTo10k: { min: null, max: 10_000 },
  to50k: { min: 10_000.01, max: 50_000 },
  to1l: { min: 50_000.01, max: 1_00_000 },
  to5l: { min: 1_00_000.01, max: 5_00_000 },
  above5l: { min: 5_00_000.01, max: null },
} as const;
export type AmountRange = keyof typeof AMOUNT_RANGES;

// a month as "YYYY-MM"
export type MonthKey = string;

// the filters picked, and what's typed in the search (an ID or remarks)
export type HistoryFilterValues = { type: HistoryType | null; month: MonthKey | null; amount: AmountRange | null; search: string };

// a set filter: ivory, as everywhere
const trigger = (set: boolean) => cn(FILTER_TRIGGER, set && "border-ivory bg-ivory text-chestnut");

// a month's name in the reader's language: "November 2026"
export const monthName = (key: MonthKey, locale: string) =>
  new Date(`${key}-15T12:00:00+05:30`).toLocaleDateString(`${locale}-IN`, { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

// one dropdown: the "all" choice first, then each option; a pick closes it
function FilterMenu<K extends string>({
  label,
  allLabel,
  value,
  options,
  onPick,
}: {
  label: string;
  allLabel: string;
  value: K | null;
  options: { key: K; label: string }[];
  onPick: (key: K | null) => void;
}) {
  const picked = options.find((o) => o.key === value);
  return (
    <Menu
      label={label}
      surface="chestnut"
      align="left"
      boxed
      floating
      triggerClassName={cn(trigger(value !== null), "shrink-0")}
      trigger={
        <>
          <span className="truncate">{picked ? picked.label : allLabel}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </>
      }
    >
      {(close) =>
        [{ key: null, label: allLabel }, ...options].map((o) => (
          <MenuItem
            key={o.key ?? "all"}
            selected={value === o.key}
            onClick={() => {
              onPick(o.key);
              close();
            }}
          >
            <span className="flex-1">{o.label}</span>
            {value === o.key && <Check className="size-4" aria-hidden />}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

// the filters, under the header while the list scrolls: type, month (only months holding something), amount, then the
// search (an ID or remarks); one row that scrolls sideways when it doesn't fit, the dropdown lists floating above it
export function HistoryFilters({ value, onChange }: { value: HistoryFilterValues; onChange: (next: HistoryFilterValues) => void }) {
  const t = useTranslations("history");
  const tc = useTranslations("common");
  const tt = useTranslations("accounts.types");
  const locale = useLocale();
  const { months: monthKeys } = useHistoryMonths();
  return (
    <div className={cn(FILTER_BAR, "flex-nowrap overflow-x-auto scrollbar-none")}>
      <FilterMenu
        label={t("type")}
        allLabel={t("allTypes")}
        value={value.type}
        options={HISTORY_TYPES.map((k) => ({ key: k, label: tt(k) }))}
        onPick={(type) => onChange({ ...value, type })}
      />
      <FilterMenu
        label={t("month")}
        allLabel={t("allMonths")}
        value={value.month}
        options={monthKeys.map((k) => ({ key: k, label: monthName(k, locale) }))}
        onPick={(month) => onChange({ ...value, month })}
      />
      <FilterMenu
        label={t("amount")}
        allLabel={t("anyAmount")}
        value={value.amount}
        options={(Object.keys(AMOUNT_RANGES) as AmountRange[]).map((k) => ({ key: k, label: t(`amounts.${k}`) }))}
        onPick={(amount) => onChange({ ...value, amount })}
      />
      {/* the search, as short as the dropdowns */}
      <label className={cn(SEARCH_BOX, "min-h-9 w-48 shrink-0")}>
        <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
        <span className="sr-only">{t("search")}</span>
        <input
          type="search"
          value={value.search}
          maxLength={50}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder={t("search")}
          className={cn(SEARCH_INPUT, "text-sm")}
        />
        {value.search && <ClearButton onClear={() => onChange({ ...value, search: "" })} label={tc("clearSearch")} />}
      </label>
    </div>
  );
}
