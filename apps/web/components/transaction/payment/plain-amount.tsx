"use client";

import { type ReactNode } from "react";

import { useTranslations } from "next-intl";

import { rupees } from "~/lib/format";
import { useOpenLoansOf } from "~/providers/dues";

import { TypedBanner } from "../shared/amount-banner";
import { Figure, LeftRow, PaymentStage as SharedStage } from "../shared/payment-stage";
import { AutoSwitch } from "../shared/split-grid";
import { usePaymentCards } from "./paid-from";
import { useOriginalPayment } from "./original-payment";
import { usePaymentEntry } from "./state";

// a loan given's Amount stage, on the shared one, as a supplier's: Loan due with its arrow (what they'll owe on their
// loans once this is given; on the right the old due, this amount added, Loan due on chestnut), the amount
// typed in sale's To receive box (the mic beside it), To pay (no TDS, so no arrow), then Left to pay with its slider
// and the cards
export function PlainAmount({
  label,
  amount,
  problems,
}: {
  label: string;
  // the amount, typed (or said into its mic), cut at what can be paid
  amount: { value: string; onChange: (raw: string) => void; max?: number; onCapped: (most: number) => void; invalid: boolean };
  // under it: what stops it (more than cash and the banks hold…)
  problems: ReactNode;
}) {
  const { t, value, to, gridPlaces, gridAuto, setGridAuto } = usePaymentEntry();
  const tpick = useTranslations("transactions.picker");
  // "Old due", as a sale's and a purchase's breakup start
  const tsale = useTranslations("transactions.sale");
  // what's left on their open loans before this one (someone new: nothing)
  const { loans } = useOpenLoansOf({ kind: "loanGiven", partyId: null }, true);
  const partyId = to?.kind === "ledger" ? to.ledger.referenceId : null;
  const before =
    Math.round((loans ?? []).filter((d) => d.partyId === partyId).reduce((sum, d) => sum + d.left, 0) * 100) / 100;
  const after = Math.round((before + value) * 100) / 100;
  const cards = { ...usePaymentCards(), meterOutside: true };
  const original = useOriginalPayment();
  const placed = Math.round(gridPlaces.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  return (
    <SharedStage
      idPrefix="plain-payment"
      breakup={null}
      // Loan due ›: what was due, this amount added, what they'll owe
      ownBreakup={
        <>
          <Figure label={tsale("oldDue")} amount={rupees(before)} />
          <Figure label={label} amount={`+ ${rupees(value)}`} />
          <LeftRow label={tpick("loanDue")} amount={after} />
        </>
      }
      breakupLabel={tpick("loanDue")}
      leftSide={[{ key: "loanDue", label: tpick("loanDue"), amount: after }]}
      // To pay: the amount itself (nothing taken off), so no arrow
      second={{
        label: <span className="font-semibold">{t("toPay")}</span>,
        value: (
          <span className="tabular flex min-h-14 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
            {rupees(value)}
          </span>
        ),
        title: t("toPay"),
      }}
      amountBox={(arrow) => (
        <>
          <TypedBanner
            slot={arrow}
            id="amount-field"
            label={label}
            value={amount.value}
            onChange={amount.onChange}
            max={amount.max}
            onCapped={amount.onCapped}
            invalid={amount.invalid}
          />
          {problems}
        </>
      )}
      original={original}
      amount={value}
      placed={placed}
      leftLabel={t("leftToPay")}
      nothingLeftLabel={t("nothingLeft")}
      leftSlot={<AutoSwitch stacked on={gridAuto} set={setGridAuto} />}
      cards={cards}
    />
  );
}
