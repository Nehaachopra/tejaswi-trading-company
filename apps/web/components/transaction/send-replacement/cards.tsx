"use client";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/icons/spinner";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { fieldRow, input, REMARKS_MAX } from "../shared/form-basics";
import { useSendEntry, VEHICLE_MAX } from "./state";

// the Details card, as a purchase's: the vehicle the packs go in (optional; capital letters and digits only), the date
// (not before the return, never after today) and the remarks (typed or spoken), each a row: label left, box right (side
// by side on a wider screen); Save follows
export function DetailsCard() {
  const { ts, tc, pending, vehicle, setVehicle, day, setDay, today, remarks, setRemarks, tried } = useSendEntry();
  const dayBad = tried && day === "";
  const min = pending.returnDate;
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <label className={fieldRow}>
        <span>{ts("vehicle")}</span>
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
        <span>
          {tc("q.date")}
          <RequiredMark />
        </span>
        <DateInput
          value={day}
          min={min}
          max={today}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) => setDay(d !== "" && (d > today || d < min) ? day : d)}
          calendarLabel={tc("q.date")}
          aria-invalid={dayBad || undefined}
          className={input(dayBad)}
        />
      </label>
      <label className={fieldRow}>
        <span>{tc("q.remarks")}</span>
        <MicField onText={(said) => setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))}>
          <input value={remarks} maxLength={REMARKS_MAX} placeholder={tc("hints.remarks")} onChange={(e) => setRemarks(e.target.value)} className={cn(input(false), "pr-11")} />
        </MicField>
      </label>
    </div>
  );
}

// Save with the bill's total on it, and why a save failed
export function SaveBlock() {
  const { t, total, saving, save, saveError } = useSendEntry();
  return (
    <>
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
            <span>{t("save")}</span>
            <span className="tabular">{rupees(total)}</span>
          </>
        )}
      </button>
      {saveError && <FieldMessage className="mt-0">{saveError}</FieldMessage>}
    </>
  );
}
