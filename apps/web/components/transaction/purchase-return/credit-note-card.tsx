"use client";

import { DateInput } from "~/components/ui/date-input";
import { cn } from "~/lib/utils";

import { indiaDay } from "../../account/balance";
import { fieldRow, input } from "../shared/form-basics";
import { NOTE_NUMBER_MAX, useReturnEntry } from "./state";

// a credit note number as GST allows a bill number: capitals, digits, / and -
export const noteNumberOnly = (v: string) => v.toUpperCase().replace(/[^A-Z0-9/-]/g, "").slice(0, NOTE_NUMBER_MAX);

// the Credit note card, as a purchase's Bill card: the supplier's credit note when they gave one, its number and its
// date (never before the purchase, never after today) side by side, each a row: label left, box right. Both optional
export function CreditNoteCard() {
  const { t, purchase, noteNumber, setNoteNumber, noteDate, setNoteDate } = useReturnEntry();
  const min = indiaDay(new Date(purchase.dateTime));
  const today = indiaDay(new Date());
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <label className={fieldRow}>
        <span>{t("creditNoteNumber")}</span>
        <input
          value={noteNumber}
          maxLength={NOTE_NUMBER_MAX}
          placeholder={t("optional")}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setNoteNumber(noteNumberOnly(e.target.value))}
          className={cn(input(false), "tabular uppercase")}
        />
      </label>
      <label className={fieldRow}>
        <span>{t("creditNoteDate")}</span>
        <DateInput
          value={noteDate}
          min={min}
          max={today}
          // a day outside the purchase's day and today is left as it was
          onChange={(d) => setNoteDate(d !== "" && (d > today || d < min) ? noteDate : d)}
          calendarLabel={t("creditNoteDate")}
          className={input(false)}
        />
      </label>
    </div>
  );
}
