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
import { useSaleEntry } from "./state";

// length follows sales.vehicle_number
const VEHICLE_MAX = 15;

// the Details card, as a payment's: the vehicle the goods leave in (optional; capital letters and digits only) and the
// remarks (typed or spoken), each a row: label left, box right (side by side on a wider screen); the day and Save
// follow, last
export function DetailsCard() {
  const { t, tc, vehicle, setVehicle, remarks, setRemarks } = useSaleEntry();
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <label className={fieldRow}>
        <span>{t("vehicle")}</span>
        <input
          value={vehicle}
          maxLength={VEHICLE_MAX}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="KA01AB1234"
          onChange={(e) =>
            setVehicle(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, VEHICLE_MAX),
            )
          }
          className={cn(input(false), "tabular uppercase")}
        />
      </label>
      <label className={fieldRow}>
        <span>{tc("q.remarks")}</span>
        <MicField
          onText={(said) =>
            setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))
          }
        >
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

// the day as a row (today until changed; staff a week back at most), level with the left column above, then Save with the total on it, and why a save failed
export function SaveBlock() {
  const { t, tc, isAdmin, day, setDay, tried, total, saving, save, saveError, editing } = useSaleEntry();
  const today = indiaDay(new Date());
  // an edit's day stays within the sale's own month (and never after today)
  const month = editing ? indiaDay(new Date(editing.dateTime)).slice(0, 7) : null;
  const monthEnd = month ? indiaDay(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12))) : null;
  const min = month ? `${month}-01` : earliestDay(isAdmin);
  const max = monthEnd && monthEnd < today ? monthEnd : today;
  return (
    <>
      <label className={cn(fieldRow, "mb-3 sm:w-[calc(50%-0.75rem)]")}>
        <span>
          {tc("q.date")}
          <RequiredMark />
        </span>
        <DateInput
          value={day}
          min={min}
          max={max}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) => setDay(d !== "" && (d > max || d < (min ?? "")) ? day : d)}
          calendarLabel={tc("q.date")}
          aria-invalid={(tried && day === "") || undefined}
          className={input(day === "")}
        />
      </label>
      <button
        type="button"
        data-recheck
        onClick={() => void save()}
        disabled={saving}
        aria-busy={saving}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-chestnut px-4 font-heading text-lg font-bold text-ivory shadow-md transition-colors hover:bg-chestnut/90 aria-busy:opacity-80"
      >
        {saving ? (
          <>
            <Spinner className="size-5" />
            <span>{t("saving")}</span>
          </>
        ) : (
          <>
            <span>{editing ? t("edit.save") : t("save")}</span>
            <span className="tabular">{rupees(total)}</span>
          </>
        )}
      </button>
      {saveError && <FieldMessage className="mt-0">{saveError}</FieldMessage>}
    </>
  );
}
