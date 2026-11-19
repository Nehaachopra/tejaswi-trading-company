"use client";

import { useRef, useState } from "react";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";

import { earliestDay, fieldRow, input } from "../shared/form-basics";
import { BillAttach, type BillRead } from "./bill-attach";
import { BILL_NUMBER_MAX, billNumberOk, usePurchaseEntry } from "./state";

// the Bill card: the supplier's bill on top (a photo or PDF, optional, can be attached later), then its number (capital
// letters, digits, / and - only, as GST allows) and its date (which dates the purchase; staff a week back at most) side
// by side, each a row: label left, box right
export function BillCard() {
  const { t, tc, isAdmin, billNumber, setBillNumber, billDay, setBillDay, billUrl, setBillUrl, setBillBusy, tried, today } = usePurchaseEntry();
  const numberBad = tried && !billNumberOk(billNumber);
  const dayBad = tried && billDay === "";
  // the number and date filled from the bill (only into empty fields): a note says to check them. The read ends a while
  // after the upload, so it looks at the fields as they are then, never over something typed meanwhile
  const [filled, setFilled] = useState(false);
  const now = useRef({ billNumber, billDay });
  now.current = { billNumber, billDay };
  function onRead(found: BillRead) {
    const { billNumber, billDay } = now.current;
    let any = false;
    if (found.number && billNumber === "") {
      setBillNumber(found.number);
      any = true;
    }
    // a day the form takes: today or before, and not before what this person may date
    if (found.date && billDay === "" && found.date <= today && found.date >= (earliestDay(isAdmin) ?? "")) {
      setBillDay(found.date);
      any = true;
    }
    setFilled(any);
  }
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {/* the bill on top, in the left column (the right one empty) */}
      <div className={cn(fieldRow, "sm:col-start-1")}>
        <span>{t("billPhoto")}</span>
        <BillAttach value={billUrl} onChange={setBillUrl} onBusy={setBillBusy} onRead={onRead} />
      </div>
      {/* the number and date read from the bill: to be checked */}
      {filled && (
        <FieldMessage tone="warning" className="mt-0 sm:col-span-2">
          {t("billFilled")}
        </FieldMessage>
      )}
      {/* then its number and date, side by side */}
      <label className={cn(fieldRow, "sm:col-start-1")}>
        <span>
          {t("billNumber")}
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
          {t("billDate")}
          <RequiredMark />
        </span>
        <DateInput
          value={billDay}
          min={earliestDay(isAdmin)}
          max={today}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) => setBillDay(d !== "" && (d > today || d < (earliestDay(isAdmin) ?? "")) ? billDay : d)}
          calendarLabel={tc("q.date")}
          aria-invalid={dayBad || undefined}
          className={input(dayBad)}
        />
      </label>
    </div>
  );
}
