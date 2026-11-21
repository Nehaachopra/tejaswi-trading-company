"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { figure, Line } from "../sale/received-card";
import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { FixedBanner } from "../shared/amount-banner";
import { Meter } from "../shared/meter";
import { useReturnEntry } from "./state";

// a figure of the breakup: its name on the left, the figure on the right; `strong` closes a part with a line above
function Figure({ label, amount, strong = false }: { label: string; amount: string; strong?: boolean }) {
  return (
    <div className={cn("tabular flex items-center justify-between gap-3 text-sm", strong && "border-t border-chestnut/30 pt-2 font-semibold")}>
      <span className="min-w-0">{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap text-base font-semibold", strong && "font-bold")}>{amount}</span>
    </div>
  );
}

// the Refund card, as the sale's Received card: on the left To pay back (the balance paid over, all of it now); on the
// right (under it on a phone) the breakup: this bill as returned, what was paid towards it, To pay; then Left to refund
// with its slider, pinned while the cards below scroll, then a card for each place it's paid back from, none past what
// it holds
export function RefundCard() {
  const { t, payBack, splitTotal, billAfter, sale } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const tr = useTranslations("transactions.receipt.form");
  const cards = useRefundCards();
  const done = splitTotal === payBack;
  return (
    <div className="flex flex-col gap-1.5 sm:gap-2.5">
      <div className="grid items-start gap-3 sm:grid-cols-2 sm:gap-12">
        <FixedBanner label={t("toPayBack")} amount={payBack} />
        <div className="flex min-w-0 flex-col gap-2.5 rounded-control bg-chestnut/[0.04] p-3">
          <Figure label={ts("thisBill")} amount={rupees(billAfter)} />
          <Figure label={ts("edit.amountPaid")} amount={`− ${rupees(sale.paid)}`} />
          <Figure strong label={t("toPay")} amount={rupees(payBack)} />
        </div>
      </div>
      {/* what's still to place, filling as the cards take their parts; green with a tick once nothing is left */}
      <div className="sticky top-16 z-10 -mx-1 flex flex-col gap-2.5 bg-ivory px-1 pb-1 sm:w-[calc(50%-1rem)]">
        <Line
          label={t("leftToRefund")}
          value={
            done ? (
              <span className={cn(figure, "flex items-center justify-end text-success")} aria-label={tr("nothingLeft")}>
                <Check className="size-5" strokeWidth={2.5} aria-hidden />
              </span>
            ) : (
              <span className={cn(figure, "font-bold")}>{rupees(Math.max(0, Math.round((payBack - splitTotal) * 100) / 100))}</span>
            )
          }
        />
        <Meter bare label={t("leftToRefund")} figure={0} share={Math.min(100, (splitTotal / payBack) * 100)} done={done} className="-mt-1" />
      </div>
      <div className="flex flex-col gap-2.5 border-t border-chestnut/15 pt-4">
        <AccountCards key={payBack} api={cards} />
      </div>
    </div>
  );
}

// the cards with a payment's words (every field a row): capped at what each place holds, no QR; Left to refund sits
// above them
function useRefundCards(): AccountCardsApi {
  const e = useReturnEntry();
  const tpf = useTranslations("transactions.payment.form");
  return {
    value: e.payBack,
    places: e.places,
    setText: e.setSplitText,
    setMode: e.setBankMode,
    tried: e.tried,
    capAtHeld: true,
    meterOutside: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    qrItems: [],
    qrId: () => ({ hideId: false }),
    upiPart: () => null,
    refs: e.refs,
    setRefs: e.setRefs,
    refLeft: e.refLeft,
    setRefLeft: e.setRefLeft,
    labels: {
      breakdown: tpf("breakdown"),
      account: tpf("account"),
      balance: tpf("balance"),
      accountAmount: e.tc("q.amount"),
      anotherAccount: tpf("anotherAccount"),
      removeAccount: e.tc("removeAccount"),
      mode: tpf("paidBy"),
      modeMissing: tpf("pickMode"),
      barLeft: e.t("leftToRefund"),
      barDone: tpf("nothingLeft"),
      capLeft: (amount) => tpf("capLeft", { amount }),
      capOnly: (amount) => tpf("capOnly", { amount }),
    },
  };
}
