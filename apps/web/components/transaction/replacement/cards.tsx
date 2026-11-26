"use client";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/icons/spinner";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { BillAttach } from "../purchase/bill-attach";
import { BILL_NUMBER_MAX, billNumberOk } from "../purchase/state";
import { fieldRow, input, REMARKS_MAX } from "../shared/form-basics";
import { useReplacement } from "./state";

// the Bill card, as a purchase's: the supplier's bill on top (a photo or PDF, optional), then its number (capital
// letters, digits, / and - only) and its date (not before the return, never after today) side by side, each a row
export function BillCard() {
  const { tp, tc, pending, billNumber, setBillNumber, billDay, setBillDay, billUrl, setBillUrl, setBillBusy, today, tried } = useReplacement();
  const numberBad = tried && !billNumberOk(billNumber);
  const dayBad = tried && billDay === "";
  const min = pending.returnDate;
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {/* the bill on top, in the left column (the right one empty) */}
      <div className={cn(fieldRow, "sm:col-start-1")}>
        <span>{tp("billPhoto")}</span>
        <BillAttach value={billUrl} onChange={setBillUrl} onBusy={setBillBusy} />
      </div>
      <label className={cn(fieldRow, "sm:col-start-1")}>
        <span>
          {tp("billNumber")}
          <RequiredMark />
        </span>
        <input
          value={billNumber}
          maxLength={BILL_NUMBER_MAX}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) =>
            setBillNumber(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9/-]/g, "")
                .slice(0, BILL_NUMBER_MAX),
            )
          }
          aria-invalid={numberBad || undefined}
          className={cn(input(numberBad), "tabular uppercase")}
        />
      </label>
      <label className={fieldRow}>
        <span>
          {tp("billDate")}
          <RequiredMark />
        </span>
        <DateInput
          value={billDay}
          min={min}
          max={today}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) => setBillDay(d !== "" && (d > today || d < min) ? billDay : d)}
          calendarLabel={tc("q.date")}
          aria-invalid={dayBad || undefined}
          className={input(dayBad)}
        />
      </label>
    </div>
  );
}

// the Details card: the remarks (typed or spoken), half the card wide; Save follows
export function DetailsCard() {
  const { tc, remarks, setRemarks } = useReplacement();
  return (
    <label className={cn(fieldRow, "sm:w-[calc(50%-0.75rem)]")}>
      <span>{tc("q.remarks")}</span>
      <MicField onText={(said) => setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))}>
        <input value={remarks} maxLength={REMARKS_MAX} placeholder={tc("hints.remarks")} onChange={(e) => setRemarks(e.target.value)} className={cn(input(false), "pr-11")} />
      </MicField>
    </label>
  );
}

// Save with the bill's total on it, and why a save failed
export function SaveBlock() {
  const { t, total, saving, save, saveError } = useReplacement();
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
