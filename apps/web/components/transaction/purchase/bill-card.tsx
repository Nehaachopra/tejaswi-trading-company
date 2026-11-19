"use client";

import { DateInput } from "~/components/ui/date-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";

import { earliestDay, fieldRow, input } from "../shared/form-basics";
import { BillAttach } from "./bill-attach";
import { BILL_NUMBER_MAX, billNumberOk, usePurchaseEntry } from "./state";

// the Bill card: the supplier's bill number (capital letters, digits, / and - only, as GST allows), its date (which
// dates the purchase; staff a week back at most) and its photo or PDF (optional, can be attached later), each a row:
// label left, box right (two columns on a wider screen)
export function BillCard() {
  const { t, tc, isAdmin, billNumber, setBillNumber, billDay, setBillDay, billUrl, setBillUrl, setBillBusy, tried, today } = usePurchaseEntry();
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
          min={earliestDay(isAdmin)}
          max={today}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) => setBillDay(d !== "" && (d > today || d < (earliestDay(isAdmin) ?? "")) ? billDay : d)}
          calendarLabel={tc("q.date")}
          aria-invalid={dayBad || undefined}
          className={input(dayBad)}
        />
      </label>
      <div className={cn(fieldRow, "sm:col-span-2")}>
        <span>{t("billPhoto")}</span>
        <BillAttach value={billUrl} onChange={setBillUrl} onBusy={setBillBusy} />
      </div>
    </div>
  );
}
