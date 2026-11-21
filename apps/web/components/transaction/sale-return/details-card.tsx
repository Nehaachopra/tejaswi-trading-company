"use client";

import { ArrowRight } from "lucide-react";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/icons/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { indiaDay } from "../../account/balance";
import { fieldRow, input, REMARKS_MAX } from "../shared/form-basics";
import { PlacePicker } from "../shared/place-picker";
import { type Reason, REASON_MAX, REASONS, useReturnEntry } from "./state";

// the Details card: why it came back (an accordion of the reasons, every one open until one is picked; Other asks
// what), then the remarks (typed or spoken), each a row: label left, box right; the day and Save (an exchange: Next, to
// its new sale) follow, last
export function DetailsCard() {
  const { t, tc, reasonKind, setReasonKind, reason, setReason, remarks, setRemarks, tried } = useReturnEntry();
  const reasonBad = tried && (reasonKind === null || (reasonKind === "other" && reason.trim() === ""));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:w-[calc(50%-0.75rem)]">
        <span className="text-sm">
          {t("reason")}
          <RequiredMark />
        </span>
        <PlacePicker<Reason>
          label={t("reason")}
          places={REASONS.map((r) => ({ id: r, name: t(`reasons.${r}`), disabled: false }))}
          value={reasonKind}
          onPick={setReasonKind}
          invalid={tried && reasonKind === null}
        />
        {/* Other: what it was */}
        {reasonKind === "other" && (
          <input
            autoFocus
            value={reason}
            maxLength={REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            aria-label={t("reasonOther")}
            placeholder={t("reasonOther")}
            aria-invalid={reasonBad || undefined}
            className={input(reasonBad)}
          />
        )}
      </div>
      <label className={cn(fieldRow, "sm:w-[calc(50%-0.75rem)]")}>
        <span>{tc("q.remarks")}</span>
        <MicField onText={(said) => setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))}>
          <input value={remarks} maxLength={REMARKS_MAX} placeholder={tc("hints.remarks")} onChange={(e) => setRemarks(e.target.value)} className={cn(input(false), "pr-11")} />
        </MicField>
      </label>
    </div>
  );
}

// the day as a row (today until changed; never before the sale), then Save with the total on it (an exchange: Next, to
// the new sale), and why a save failed
export function SaveBlock() {
  const { t, tc, sale, day, setDay, tried, total, mode, saving, save, saveError } = useReturnEntry();
  const today = indiaDay(new Date());
  const min = indiaDay(new Date(sale.dateTime));
  const max = sale.lastDay < today ? sale.lastDay : today;
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
          onChange={(d) => setDay(d !== "" && (d > max || d < min) ? day : d)}
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
        ) : mode === "exchange" ? (
          <>
            <span>{t("toNewSale")}</span>
            <ArrowRight className="size-5" aria-hidden />
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
