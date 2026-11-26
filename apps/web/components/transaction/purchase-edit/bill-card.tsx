"use client";

import { DateInput } from "~/components/ui/date-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";

import { BILL_NUMBER_MAX, billNumberOk } from "../purchase/state";
import { fieldRow, input } from "../shared/form-basics";
import { usePurchaseEdit } from "./state";

// an edit's Bill card, as a purchase's (no photo: it's changed on the purchase's page): the supplier's bill number
// (capital letters, digits, / and - only) and its date (within the purchase's own month, never after today) side by
// side, each a row: label left, box right
export function BillCard() {
  const { t, tc, billNumber, setBillNumber, billDay, setBillDay, dayMin, dayMax, tried } = usePurchaseEdit();
  const numberBad = tried && !billNumberOk(billNumber);
  const dayBad = tried && billDay === "";
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <label className={fieldRow}>
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
          min={dayMin}
          max={dayMax}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) => setBillDay(d !== "" && (d > dayMax || d < dayMin) ? billDay : d)}
          calendarLabel={tc("q.date")}
          aria-invalid={dayBad || undefined}
          className={input(dayBad)}
        />
      </label>
    </div>
  );
}
