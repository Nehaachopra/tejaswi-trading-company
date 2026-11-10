"use client";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { indiaDay } from "../../account/balance";
import { input, REMARKS_MAX } from "../shared/form-basics";
import { useOtherEntry } from "./state";

// why the entry is made (required: a journal needs its reason)
export function DetailsCard() {
  const { t, remarks, setRemarks, tried } = useOtherEntry();
  const bad = tried && remarks.trim() === "";
  return (
    <label className="flex flex-col gap-2.5 text-xs font-semibold">
      <span>
        {t("why")}
        <RequiredMark />
      </span>
      <MicField onText={(said) => setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))}>
        <input
          value={remarks}
          maxLength={REMARKS_MAX}
          placeholder={t("whyHint")}
          onChange={(e) => setRemarks(e.target.value)}
          aria-invalid={bad || undefined}
          className={cn(input(bad), "pr-11")}
        />
      </MicField>
    </label>
  );
}

// the day (today to start with; never after it), then Save with the amount on it, and why a save failed
export function SaveBlock() {
  const { t, tc, day, setDay, tried, value, saving, creating, save, saveError } = useOtherEntry();
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
          // a day after today is left as it was
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
            <span>{t("save")}</span>
            <span className="tabular">{rupees(value)}</span>
          </>
        )}
      </button>
      {saveError && <FieldMessage className="mt-0">{saveError}</FieldMessage>}
    </>
  );
}
