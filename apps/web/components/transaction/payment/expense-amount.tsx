"use client";

import { type ComponentProps, type ReactNode } from "react";

import { rupees } from "~/lib/format";

import { TypedBanner } from "../shared/amount-banner";
import { Figure, type LeftItem, LeftRow, PaymentStage as SharedStage } from "../shared/payment-stage";
import { AutoSwitch } from "../shared/split-grid";
import { usePaymentCards } from "./paid-from";
import { useOriginalPayment } from "./original-payment";
import { usePaymentEntry } from "./state";

// a row of To pay's breakup: its name, the figure (null: still being worked out), added (+), taken off (−) or neither,
// and a sum closing what's above it (a line over it)
export type PayRow = { key: string; label: ReactNode; amount: number | null; sign?: "+" | "−" | "×"; strong?: boolean };

// an expense's Amount stage, on the shared one (as a supplier's). On the left: rent's Rent / month with its arrow (each
// godown's rent, on the right), then the box typed (Expense; rent's Months), To pay with its arrow (only when there's
// something to break down: the GST on the bill, the TDS, the reverse-charge GST), then Left to pay with its slider and
// the cards. Every row ends in the same icon column
export function ExpenseAmount({
  top,
  first,
  input,
  problems,
  payRows,
  notes,
}: {
  // above everything: their PAN, only while TDS is taken and none is on record
  top?: ReactNode;
  // rent: Rent / month on the left, its arrow opening each godown's rent
  first?: { item: LeftItem; label: string; box: ReactNode };
  // the box typed: its label, value and limits, in sale's To receive look
  input: ComponentProps<typeof TypedBanner>;
  // under it: what stops it (more than cash and the banks hold, labour over its limit…)
  problems: ReactNode;
  // To pay's breakup, above To pay itself; null: nothing to break down (no arrow)
  payRows: PayRow[] | null;
  // under the breakup (no TDS declared, the tax not worked out)
  notes?: ReactNode;
}) {
  const { t, value, gridPlaces, gridAuto, setGridAuto } = usePaymentEntry();
  const cards = { ...usePaymentCards(), meterOutside: true };
  const original = useOriginalPayment();
  const placed = Math.round(gridPlaces.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const figureOf = (r: PayRow) =>
    r.amount === null ? "—" : r.sign === "×" ? `× ${r.amount}` : `${r.sign ? `${r.sign} ` : ""}${rupees(r.amount)}`;
  return (
    <SharedStage
      idPrefix="expense-payment"
      top={top}
      breakup={null}
      ownBreakup={first?.box}
      breakupLabel={first?.label ?? ""}
      leftSide={first ? [first.item] : []}
      amountBox={(arrow) => (
        <>
          <TypedBanner {...input} slot={arrow} />
          {problems}
        </>
      )}
      original={original}
      second={{
        label: <span className="font-semibold">{t("toPay")}</span>,
        value: (
          <span className="tabular flex min-h-14 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
            {rupees(value)}
          </span>
        ),
        title: t("paymentPart"),
        box: payRows && (
          <>
            {payRows.map((r) => (
              <Figure key={r.key} label={r.label} amount={figureOf(r)} strong={r.strong} />
            ))}
            <LeftRow label={t("toPay")} amount={value} />
            {notes}
          </>
        ),
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
