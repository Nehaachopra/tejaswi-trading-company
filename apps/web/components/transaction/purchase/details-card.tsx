"use client";

import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/icons/spinner";
import { MicField } from "~/components/ui/mic-button";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { fieldRow, input, REMARKS_MAX } from "../shared/form-basics";
import { usePurchaseEntry } from "./state";

// length follows purchases.vehicle_number
const VEHICLE_MAX = 15;

// the Details card, as the sale's: the vehicle the goods came in (optional; capital letters and digits only) and the
// remarks (typed or spoken), each a row: label left, box right (side by side on a wider screen); Save follows
export function DetailsCard() {
  const { ts, tc, vehicle, setVehicle, remarks, setRemarks } = usePurchaseEntry();
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

// Save with the total on it, and why a save failed
export function SaveBlock() {
  const { t, ts, total, saving, save, saveError } = usePurchaseEntry();
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
            <span>{ts("saving")}</span>
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
