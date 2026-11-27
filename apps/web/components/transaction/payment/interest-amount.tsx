"use client";

import { useTranslations } from "next-intl";
import { type ReactNode } from "react";

import { rupees } from "~/lib/format";

import { TypedBanner } from "../shared/amount-banner";
import { type AmountRow } from "../shared/amount-table";
import { Figure, LeftRow, PaymentStage as SharedStage } from "../shared/payment-stage";
import { AutoSwitch } from "../shared/split-grid";
import { usePaymentCards } from "./paid-from";
import { usePaymentEntry } from "./state";

// interest paid's Amount stage, on the shared one (as a supplier's). On the left: Interest / month with its arrow (how
// it's worked out: what's left on the loan at its rate a year, on the right), Months typed, To pay with its arrow (Interest
// / month times the months, the TDS taken off, To pay, on the right), then Left to pay with its slider and the cards.
// Every row ends in the same icon column
export function InterestAmount({
  top,
  problems,
  taken,
  notes,
}: {
  // above Interest / month: their PAN, only while TDS is taken and none is on record
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
    loan,
    interestMonths,
    setInterestMonths,
    interestTyped,
    setInterestTyped,
    atLeastOne,
    gridPlaces,
    gridAuto,
    setGridAuto,
  } = usePaymentEntry();
  const tl = useTranslations("transactions.loan");
  const cards = { ...usePaymentCards(), meterOutside: true };
  const placed = Math.round(gridPlaces.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const interest = Math.round((total - (tax?.rcm?.gst ?? 0)) * 100) / 100;
  const monthsBad = tried && value === 0 && interestTyped === null;

  // Months, then what stops it
  const rows = (
    <>
      {/* in the Repay box's look: the chestnut frame, what's typed in ivory, the mic beside */}
      <TypedBanner
        id="months-field"
        label={t("months")}
        value={interestTyped !== null ? "" : interestMonths}
        onChange={(v) => {
          setInterestTyped(null);
          setInterestMonths(atLeastOne(v));
        }}
        max={120}
        invalid={monthsBad}
        rupee={false}
        decimals={0}
        maxDigits={3}
        placeholder="--"
      />
      {problems}
    </>
  );

  // Interest / month: what's left on the loan at its rate a year, a twelfth of it; its arrow opens how it's worked out
  const rate = loan?.interestRate ?? 0;
  const left = loan?.left ?? 0;
  const monthly = Math.round((left * rate) / 12) / 100;
  const calcRows = (
    <>
      <Figure label={t("loanLeft")} amount={rupees(left)} />
      <Figure label={tl("rate")} amount={`${rate}%`} />
      <LeftRow label={t("interestMonthly")} amount={monthly} />
    </>
  );

  // To pay's breakup: Interest / month times the months, the interest they come to, the TDS taken off, To pay
  const payRows = (
    <>
      <Figure label={t("interestMonthly")} amount={rupees(monthly)} />
      <Figure label={t("months")} amount={`× ${interestMonths || "0"}`} />
      <Figure label={t("interestDue")} amount={rupees(interest)} strong />
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
      // Interest / month ›, first, opening how it's worked out
      ownBreakup={calcRows}
      breakupLabel={t("interestMonthly")}
      leftSide={[{ key: "monthly", label: t("interestMonthly"), amount: monthly }]}
      // then Months
      amountBox={rows}
      second={{
        label: <span className="font-semibold">{t("toPay")}</span>,
        value: (
          <span className="tabular flex min-h-14 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
            {rupees(value)}
          </span>
        ),
        title: t("paymentPart"),
        // its arrow and breakup once the months make it something
        box: value > 0 ? payRows : undefined,
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
