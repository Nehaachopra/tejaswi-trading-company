"use client";

import { type ReactNode } from "react";

import { rupees } from "~/lib/format";

import { TypedBanner } from "../shared/amount-banner";
import { type AmountRow } from "../shared/amount-table";
import { Figure, LeftRow, PaymentStage as SharedStage } from "../shared/payment-stage";
import { AutoSwitch } from "../shared/split-grid";
import { usePaymentCards } from "./paid-from";
import { usePaymentEntry } from "./state";

// the Amount stage of a payment against a due (a supplier, a loan repaid), on the shared one. On the left: Due left (or Advance left) with its arrow, Repay typed (the
// mic in the icon column), To pay with its own arrow; every row ends in the same icon column. On the right each arrow's
// breakup: the due's (Due, Repaid, what's left) and the payment's (Repaid, the TDS and any
// reverse-charge GST taken off, To pay). The cards stay below the stage (PaidFrom)
export function DueAmount({
  top,
  names,
  repay,
  problems,
  left,
  taken,
  notes,
}: {
  // above Due left: their PAN, only while TDS is taken and none is on record
  top?: ReactNode;
  // the box's name and what it's called in the breakups (a tax: Amount, Paid; otherwise Repay, Repaid)
  names?: { box: string; done: string };
  // Repay, typed (or said into its mic), cut at what can be paid; and its problems under it
  repay: { value: string; onChange: (raw: string) => void; max?: number; onCapped: (most: number) => void; invalid: boolean };
  problems: ReactNode;
  // what's left once it's repaid: the due, or the advance with them
  left: { label: string; amount: number };
  // what comes off Repay before To pay (TDS, reverse-charge GST)
  taken: AmountRow[];
  // under the payment's breakup (no TDS declared, the tax not worked out)
  notes?: ReactNode;
}) {
  const { t, value, heldAdvance, dueShown, settlesTotal, total, tax, gridPlaces, gridAuto, setGridAuto } =
    usePaymentEntry();
  // the cards, their meter outside them: Left to pay and its slider under To pay, pinned while the cards scroll, as a
  // purchase's
  const cards = { ...usePaymentCards(), meterOutside: true };
  const placed = Math.round(gridPlaces.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  // what's repaid: To pay with the TDS it carries
  const repaid = Math.round((total - (tax?.rcm?.gst ?? 0)) * 100) / 100;

  // Repay: typed, in sale's To receive box (the mic in the icon column), its problems under it
  const repayRow = (
    <>
      <TypedBanner
        id="amount-field"
        label={names?.box ?? t("repay")}
        value={repay.value}
        onChange={repay.onChange}
        max={repay.max}
        onCapped={repay.onCapped}
        invalid={repay.invalid}
      />
      {problems}
    </>
  );

  // the due's breakup: what was owed (or the advance with them), Repaid taken off, what's left on
  // chestnut
  const dueRows = (
    <>
      {heldAdvance > 0 ? (
        <Figure label={t("advancePart")} amount={rupees(heldAdvance)} />
      ) : (
        <Figure label={t("due")} amount={rupees(dueShown ?? 0)} />
      )}
      <Figure label={names?.done ?? t("repaid")} amount={`− ${rupees(settlesTotal)}`} />
      <LeftRow label={left.label} amount={left.amount} />
    </>
  );

  // the payment's breakup: Repaid, what comes off it, To pay on chestnut
  const payRows = (
    <>
      <Figure label={names?.done ?? t("repaid")} amount={rupees(repaid)} />
      {taken.map((r) => (
        <Figure key={r.key} label={r.label} amount={r.amount === null ? "—" : `− ${rupees(r.amount)}`} />
      ))}
      <LeftRow label={t("toPay")} amount={value} />
      {notes}
    </>
  );

  return (
    <SharedStage
      idPrefix="due-payment"
      top={top}
      breakup={null}
      ownBreakup={dueRows}
      breakupLabel={t("duePart")}
      leftSide={[{ key: "left", label: left.label, amount: left.amount }]}
      amountBox={repayRow}
      second={{
        label: <span className="font-semibold">{t("toPay")}</span>,
        value: (
          <span className="tabular flex min-h-14 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
            {rupees(value)}
          </span>
        ),
        title: t("paymentPart"),
        // its arrow and breakup only when To pay differs from Repay (TDS or reverse-charge GST taken off)
        box: Math.abs(repaid - value) >= 0.005 ? payRows : undefined,
      }}
      amount={value}
      placed={placed}
      leftLabel={t("leftToPay")}
      nothingLeftLabel={t("nothingLeft")}
      // Auto beside Left to pay: the word over its switch (it fills the cards from what each holds)
      leftSlot={<AutoSwitch stacked on={gridAuto} set={setGridAuto} />}
      cards={cards}
    />
  );
}
