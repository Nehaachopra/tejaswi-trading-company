"use client";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/icons/spinner";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { CashRefField } from "../../../transaction/shared/bank-mode";
import { input, REFERENCE_MAX, REMARKS_MAX } from "../../../transaction/shared/form-basics";
import { useReceiptEdit } from "./state";

// the Details stage, as a new receipt's: the cash part's bill or voucher number (when cash is used) beside the remarks;
// each bank account's reference is on its own card. The day and Save follow, last
export function DetailsStage() {
  const { tc, usesCash, cashRef, setCashRef, remarks, setRemarks } = useReceiptEdit();
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {usesCash && <CashRefField value={cashRef} onChange={setCashRef} max={REFERENCE_MAX} />}
      <label className="flex flex-col gap-2.5 text-xs font-semibold">
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

// the day (within the receipt's own month, never after today), then Save changes with the amount on it, and why a
// save failed
export function SaveBlock() {
  const { te, tc, day, setDay, dayMin, dayMax, tried, amount, saving, save, saveError } = useReceiptEdit();
  return (
    <>
      <label className="mb-3 flex flex-col gap-2.5 text-xs font-semibold sm:max-w-72">
        <span>
          {tc("q.date")}
          <RequiredMark />
        </span>
        <DateInput
          value={day}
          min={dayMin}
          max={dayMax}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) => setDay(d !== "" && (d > dayMax || d < dayMin) ? day : d)}
          calendarLabel={tc("q.date")}
          aria-invalid={(tried && day === "") || undefined}
          className={input(tried && day === "")}
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
            <span>{te("saving")}</span>
          </>
        ) : (
          <>
            <span>{te("save")}</span>
            <span className="tabular">{rupees(amount)}</span>
          </>
        )}
      </button>
      {saveError && <FieldMessage className="mt-0">{saveError}</FieldMessage>}
    </>
  );
}
