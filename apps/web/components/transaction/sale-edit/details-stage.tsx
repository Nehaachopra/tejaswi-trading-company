"use client";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/icons/spinner";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { indiaDay } from "../../account/balance";
import { fieldRow, input } from "../shared/form-basics";
import { useSaleEdit } from "./state";

// length follows sales.vehicle_number
const VEHICLE_MAX = 15;

// an edit's details stage, as a sale's Save block: the vehicle it went in (optional; capital letters and digits only)
// and the date (within the sale's own month, never after today), each a row (side by side on a wider screen), then
// Save changes with the total on it, and why a save failed
export function DetailsStage() {
  const { t, tc, sale, day, setDay, vehicle, setVehicle, tried, total, saving, save, saveError } =
    useSaleEdit();
  const today = indiaDay(new Date());
  // the sale's month: its first day to its last (or today, if sooner)
  const month = indiaDay(new Date(sale.dateTime)).slice(0, 7);
  const monthEnd = indiaDay(
    new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12)),
  );
  const min = `${month}-01`;
  // with returns: not past the first one's day
  const capped = monthEnd < today ? monthEnd : today;
  const max = sale.firstReturnDate && sale.firstReturnDate < capped ? sale.firstReturnDate : capped;
  return (
    <>
      <div className="mb-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
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
          <span>
            {tc("q.date")}
            <RequiredMark />
          </span>
          <DateInput
            value={day}
            min={min}
            max={max}
            // a day typed outside what the picker offers is left as it was
            onChange={(d) => setDay(d !== "" && (d > max || d < min) ? day : d)}
            calendarLabel={tc("q.date")}
            aria-invalid={(tried && day === "") || undefined}
            className={input(day === "")}
          />
        </label>
      </div>
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
            <span>{t("edit.save")}</span>
            <span className="tabular">{rupees(total)}</span>
          </>
        )}
      </button>
      {saveError && <FieldMessage className="mt-0">{saveError}</FieldMessage>}
    </>
  );
}
