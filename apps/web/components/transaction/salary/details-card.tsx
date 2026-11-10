"use client";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { indiaDay } from "../../account/balance";
import { input, REFERENCE_MAX, REMARKS_MAX } from "../shared/form-basics";
import { useSalaryEntry } from "./state";

// the reference (a bank payment's UTR or cheque no., a cash voucher no.) beside the remarks, as a receipt has them
export function DetailsCard() {
  const { t, tc, reference, setReference, remarks, setRemarks, cashUsed } = useSalaryEntry();
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {cashUsed && (
          <label className="flex flex-col gap-2.5 text-xs font-semibold">
            {t("reference")}
            <input
              value={reference}
              maxLength={REFERENCE_MAX}
              placeholder={t("referenceHint")}
              // letters, digits, - and / only, in capitals, as the server keeps it
              onChange={(e) =>
                setReference(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9/-]/g, "")
                    .slice(0, REFERENCE_MAX),
                )
              }
              autoCapitalize="characters"
              className={cn(input(false), "tabular")}
            />
          </label>
        )}
        <label className="flex flex-col gap-2.5 text-xs font-semibold">
          {tc("q.remarks")}
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
    </div>
  );
}

// the day (today to start with; never after it), then Save with the amount on it, and why a save failed
export function SaveBlock() {
  const { t, tc, kind, day, setDay, tried, value, saving, creating, save, saveError } =
    useSalaryEntry();
  const busy = saving || creating;
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
          max={today}
          onChange={(d) => setDay(d !== "" && d > today ? day : d)}
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
            <span>{t(kind === "advance" ? "save.advance" : "save.salary")}</span>
            <span className="tabular">{rupees(value)}</span>
          </>
        )}
      </button>
      {saveError && <FieldMessage className="mt-0">{saveError}</FieldMessage>}
    </>
  );
}
