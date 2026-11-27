"use client";

import { IndianRupee, Pencil } from "lucide-react";
import { type ReactNode, useState } from "react";

import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type AmountRow } from "../shared/amount-table";
import { Figure, LeftRow, Line, figure, PaymentStage as SharedStage } from "../shared/payment-stage";
import { AutoSwitch } from "../shared/split-grid";
import { usePaymentCards } from "./paid-from";
import { input } from "./shared";
import { usePaymentEntry } from "./state";

// interest paid's Amount stage, on the shared one (as a supplier's). On the left: Months typed, then the interest they
// come to (its pen, in the icon column, types it over from a statement), then To pay; every row ends in the same icon
// column. To pay's arrow, only when the TDS makes it differ from the interest, opens its breakup on the right
// (Interest, the TDS taken off, To pay). Then Left to pay with its slider and the cards
export function InterestAmount({
  top,
  problems,
  taken,
  notes,
}: {
  // above Months: their PAN, only while TDS is taken and none is on record
  top?: ReactNode;
  // under the interest: what stops it (more than cash and the banks hold…)
  problems: ReactNode;
  // what comes off the interest before To pay (the TDS)
  taken: AmountRow[];
  // under the breakup (the tax not worked out)
  notes?: ReactNode;
}) {
  const {
    t,
    tried,
    value,
    total,
    tax,
    tooMuch,
    interestMonths,
    setInterestMonths,
    interestTyped,
    setInterestTyped,
    interestWorked,
    calcDue,
    atLeastOne,
    gridPlaces,
    gridAuto,
    setGridAuto,
  } = usePaymentEntry();
  const cards = { ...usePaymentCards(), meterOutside: true };
  const placed = Math.round(gridPlaces.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  // the interest: worked out from the months, or typed over (its pen opens the box)
  const [editing, setEditing] = useState(false);
  const typing = editing || interestTyped !== null;
  const interest = Math.round((total - (tax?.rcm?.gst ?? 0)) * 100) / 100;
  const monthsBad = tried && calcDue === 0 && interestTyped === null;
  const interestBad = (tried && calcDue === 0) || tooMuch;

  // Months, then the interest, then what stops it
  const rows = (
    <>
      <Line
        label={
          <label htmlFor="months-field" className="flex items-center font-semibold">
            {t("months")}
            <RequiredMark />
          </label>
        }
        value={
          <NumberInput
            id="months-field"
            value={interestTyped !== null ? "" : interestMonths}
            onChange={(v) => {
              setInterestTyped(null);
              setEditing(false);
              setInterestMonths(atLeastOne(v));
            }}
            maxDigits={3}
            max={120}
            placeholder="--"
            aria-invalid={monthsBad || undefined}
            className={cn(input(monthsBad), "tabular text-right")}
          />
        }
      />
      <Line
        label={
          <label htmlFor="amount-field" className="flex items-center font-semibold">
            {t("interestDue")}
          </label>
        }
        value={
          typing ? (
            <span className="relative block">
              <IndianRupee className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2" aria-hidden />
              <NumberInput
                id="amount-field"
                autoFocus={editing}
                value={interestTyped ?? (interestWorked > 0 ? String(interestWorked) : "")}
                onChange={setInterestTyped}
                decimals={2}
                maxDigits={13}
                placeholder="0"
                aria-invalid={interestBad || undefined}
                className={cn(input(interestBad), "tabular pl-9 text-right")}
              />
            </span>
          ) : (
            <span className={figure}>{rupees(calcDue)}</span>
          )
        }
        // the pen types it over (from a statement); none once it's being typed
        slot={
          !typing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t("interestDue")}
              className="grid size-9 place-items-center rounded-control hover:bg-chestnut/[0.08]"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          )
        }
      />
      {problems}
    </>
  );

  // To pay's breakup: the interest, the TDS taken off, To pay on chestnut
  const payRows = (
    <>
      <Figure label={t("interestDue")} amount={rupees(interest)} />
      {taken.map((r) => (
        <Figure key={r.key} label={r.label} amount={r.amount === null ? "—" : `− ${rupees(r.amount)}`} />
      ))}
      <LeftRow label={t("toPay")} amount={value} />
      {notes}
    </>
  );

  return (
    <SharedStage
      idPrefix="interest-payment"
      top={top}
      breakup={null}
      breakupLabel={t("paymentPart")}
      amountBox={rows}
      second={{
        label: <span className="font-semibold">{t("toPay")}</span>,
        value: (
          <span className="tabular flex min-h-14 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
            {rupees(value)}
          </span>
        ),
        title: t("paymentPart"),
        // its arrow and breakup only when To pay differs from the interest (TDS taken off)
        box: Math.abs(interest - value) >= 0.005 ? payRows : undefined,
      }}
      amount={value}
      placed={placed}
      leftLabel={t("leftToPay")}
      nothingLeftLabel={t("nothingLeft")}
      leftSlot={<AutoSwitch stacked on={gridAuto} set={setGridAuto} />}
      cards={cards}
    />
  );
}
