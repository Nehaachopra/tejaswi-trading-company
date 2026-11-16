"use client";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { indiaDay } from "../../account/balance";
import { earliestDay, input, REMARKS_MAX } from "../shared/form-basics";
import { useSaleEntry } from "./state";

// length follows sales.vehicle_number
const VEHICLE_MAX = 15;

// the Details card, as a payment's: the vehicle the goods leave in (optional; capital letters and digits only) and the
// remarks (typed or spoken); the day and Save follow, last
export function DetailsCard() {
  const { t, tc, vehicle, setVehicle, remarks, setRemarks } = useSaleEntry();
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold sm:max-w-56">
        {t("vehicle")}
        <input
          value={vehicle}
          maxLength={VEHICLE_MAX}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="KA01AB1234"
          onChange={(e) => setVehicle(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, VEHICLE_MAX))}
          className={cn(input(false), "tabular uppercase")}
        />
      </label>
      <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
        {tc("q.remarks")}
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

// the day (today until changed; staff a week back at most), then Save with the total on it, and why a save failed
export function SaveBlock() {
  const { t, tc, isAdmin, day, setDay, tried, total, saving, save, saveError } = useSaleEntry();
  const today = indiaDay(new Date());
  return (
    <>
      <label className="mb-3 flex flex-col gap-2.5 text-xs font-semibold sm:max-w-72">
        <span>
          {tc("q.date")}
          <RequiredMark />
        </span>
        <DateInput
          value={day}
          min={earliestDay(isAdmin)}
          max={today}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) => setDay(d !== "" && (d > today || d < (earliestDay(isAdmin) ?? "")) ? day : d)}
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
            <span>{t("save")}</span>
            <span className="tabular">{rupees(total)}</span>
          </>
        )}
      </button>
      {saveError && <FieldMessage className="mt-0">{saveError}</FieldMessage>}
    </>
  );
}
