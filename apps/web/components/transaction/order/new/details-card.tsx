"use client";

import { useLocale } from "next-intl";

import { DateInput, dayInWords } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { Spinner } from "~/components/ui/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { input } from "../../shared/form-basics";
import { useOrderEntry } from "./state";

// remarks are kept up to 1000 characters on the order
const REMARKS_MAX = 1000;
const field = "flex flex-col gap-2.5 text-xs font-semibold";

// the order's date (the day it's made, shown, never changed), when it's expected (optional, that day or later) and
// remarks, side by side on a wider screen
export function DetailsCard() {
  const { t, orderDate, expected, setExpected, remarks, setRemarks } = useOrderEntry();
  const locale = useLocale();
  const expectedBad = expected !== "" && orderDate !== "" && expected < orderDate;
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {/* the order's date: today, as plain text */}
      <div className={field}>
        <span>{t("orderDate")}</span>
        <span className="flex min-h-11 items-center text-base font-normal">{dayInWords(orderDate, locale)}</span>
      </div>
      <label className={field}>
        {t("expected")}
        <DateInput
          value={expected}
          min={orderDate || undefined}
          onChange={setExpected}
          placeholder={t("optional")}
          calendarLabel={t("expected")}
          aria-invalid={expectedBad || undefined}
          className={input(expectedBad)}
        />
      </label>
      <label className={cn(field, "sm:col-span-2")}>
        {t("remarks")}
        <MicField onText={(said) => setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))}>
          <input
            value={remarks}
            maxLength={REMARKS_MAX}
            placeholder={t("optional")}
            onChange={(e) => setRemarks(e.target.value)}
            className={cn(input(false), "pr-11")}
          />
        </MicField>
      </label>
    </div>
  );
}

// Save with the order's total on it, and why a save failed
export function SaveBlock() {
  const { t, total, saving, save, saveError } = useOrderEntry();
  return (
    <>
      <button
        type="button"
        data-recheck
        onClick={() => void save()}
        disabled={saving}
        aria-busy={saving}
        className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory shadow-md transition-colors hover:bg-chestnut/90 aria-busy:opacity-80"
      >
        {saving ? (
          <>
            <Spinner className="size-5" />
            <span>{t("saving")}</span>
          </>
        ) : (
          <>
            <span>{t("save")}</span>
            <span className="tabular">{rupees(total)}</span>
          </>
        )}
      </button>
      {saveError && <FieldMessage className="mt-0">{saveError}</FieldMessage>}
    </>
  );
}
