"use client";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/icons/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { indiaDay } from "../../account/balance";
import { earliestDay, fieldRow, input, REMARKS_MAX } from "../shared/form-basics";
import { useDrawingEntry } from "./state";

// the remarks (typed or spoken), as a sale's: a row, label left, box right; the day and Save follow, last
export function DetailsCard() {
  const { tc, remarks, setRemarks } = useDrawingEntry();
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <label className={fieldRow}>
        <span>{tc("q.remarks")}</span>
        <MicField onText={(said) => setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))}>
          <input
            value={remarks}
            maxLength={REMARKS_MAX}
            placeholder={tc("hints.remarks")}
            onChange={(e) => setRemarks(e.target.value)}
            className={cn(input(false), "pr-11")}
          />
        </MicField>
      </label>
    </div>
  );
}

// the day as a row, as a sale's (today to start with; never after it), level with the remarks above, then Save with
// what it comes to on it, and why a save failed
export function SaveBlock() {
  const { t, tc, day, setDay, tried, total, saving, creating, save, saveError } = useDrawingEntry();
  const busy = saving || creating;
  const today = indiaDay(new Date());
  return (
    <>
      <label className={cn(fieldRow, "mb-3 sm:w-[calc(50%-0.75rem)]")}>
        <span>
          {tc("q.date")}
          <RequiredMark />
        </span>
        <DateInput
          value={day}
          min={earliestDay(true)}
          max={today}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) => setDay(d !== "" && (d > today || d < (earliestDay(true) ?? "")) ? day : d)}
          calendarLabel={tc("q.date")}
          aria-invalid={(tried && day === "") || undefined}
          className={input(day === "")}
        />
      </label>
      <button
        type="button"
        data-recheck
        onClick={() => void save()}
        disabled={busy}
        aria-busy={busy}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory shadow-md transition-colors hover:bg-chestnut/90 aria-busy:opacity-80"
      >
        {busy ? (
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
