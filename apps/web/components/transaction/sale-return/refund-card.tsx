"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";

import { rupees } from "~/lib/format";
import { usePhone } from "~/lib/use-phone";
import { cn } from "~/lib/utils";

import { figure, Figure, LeftRow, Line } from "../sale/received-card";
import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { FixedBanner } from "../shared/amount-banner";
import { Meter } from "../shared/meter";
import { useReturnEntry } from "./state";

const round2 = (n: number) => Math.round(n * 100) / 100;

// the Refund card, as the sale's Received card: on the left what's left on their account once it's paid back (Advance
// left and / or Due left, an arrow on each opening the breakup) and To pay back (fixed: what the return has over all
// they owe, now); the breakup on the right on a computer (it starts open), or slid to on a phone (‹ Breakup back), as
// the sale's: an advance they hold (over a line), the old due, this bill (the new bill), with an advance their sub
// total and what of it is set off, the due, what was received on the bill (taken off), what's paid back now (added),
// then what's left on chestnut. Then, with money to pay back, Left to refund with its slider, pinned while the cards
// below scroll, and a card for each place it's paid back from, none past what it holds
export function RefundCard() {
  const { t, sale, customer, billAfter, payBack, splitTotal } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const tr = useTranslations("transactions.receipt.form");
  const cards = useRefundCards();
  const done = splitTotal === payBack;
  // the account: an advance they hold, what they owe on other bills, this bill as returned, with an advance their sub
  // total and what of it is set off (only against what's still owed once what was received is taken off), the due; then
  // what was received taken off and what's paid back added; what's left is a due and / or an advance
  const held = customer?.held ?? 0;
  const oldDue = customer ? Math.max(0, round2(customer.owed - (sale.billNow - sale.paid))) : 0;
  const thisBill = billAfter;
  const subTotal = round2(oldDue + thisBill);
  const setOff = held > 0 ? Math.min(held, Math.max(0, round2(subTotal - sale.paid))) : 0;
  const due = round2(subTotal - setOff);
  const dueLeft = Math.max(0, round2(due - sale.paid + payBack));
  const advanceLeft = round2(held - setOff);
  // on the left: Due left always (₹0 too), an advance left above it
  const leftSide = [
    ...(advanceLeft > 0 ? [{ key: "advance", label: ts("advanceLeft"), amount: advanceLeft }] : []),
    { key: "due", label: ts("leftDue"), amount: dueLeft },
  ];

  // on a computer the breakup beside (it starts open); on a phone the card slid to it (it starts on the amounts)
  const phone = usePhone();
  const [breakupOpen, setBreakupOpen] = useState(true);
  const [slid, setSlid] = useState(false);
  const shown = phone ? slid : breakupOpen;

  // a phone's two panels: as tall as the one showing, the other kept out of reach
  const mainRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const panel = slid ? sideRef.current : mainRef.current;
    if (!phone || !panel) return;
    const fit = () => setHeight(panel.offsetHeight);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(panel);
    return () => watch.disconnect();
  }, [phone, slid]);
  // a computer's breakup lies over the right half: the part is kept at least as tall as it, and the cards start below it
  const amountsRef = useRef<HTMLDivElement>(null);
  const breakupRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [beside, setBeside] = useState({ breakup: 0, push: 0 });
  useLayoutEffect(() => {
    if (phone) return;
    const fit = () => {
      const breakupH = breakupRef.current?.offsetHeight ?? 0;
      const natural = (amountsRef.current?.offsetHeight ?? 0) + 10 + (stickyRef.current?.offsetHeight ?? 0) + 10 + 6;
      setBeside({ breakup: breakupH, push: breakupH ? Math.max(0, breakupH + 16 - natural) : 0 });
    };
    fit();
    const watch = new ResizeObserver(fit);
    for (const el of [amountsRef.current, breakupRef.current, stickyRef.current]) if (el) watch.observe(el);
    return () => watch.disconnect();
  }, [phone, breakupOpen]);
  // on sliding, the cursor goes to the back arrow (or back to the arrow that opened it)
  const back = useRef<HTMLButtonElement>(null);
  const arrowRow = useRef<HTMLButtonElement>(null);
  const slide = (to: boolean) => {
    setSlid(to);
    setTimeout(() => (to ? back : arrowRow).current?.focus({ preventScroll: true }), 320);
  };

  // the amounts: Due left (its arrow opening the breakup), then To pay back in its fixed box
  const amounts = (
    <div className="flex min-w-0 flex-col gap-2.5">
      <button
        ref={arrowRow}
        type="button"
        onClick={() => (phone ? slide(true) : setBreakupOpen((o) => !o))}
        aria-expanded={shown}
        aria-controls="return-breakup"
        aria-label={ts("breakup")}
        className="group flex w-full flex-col gap-1 text-left"
      >
        {leftSide.map((l) => (
          <Line
            key={l.key}
            label={<span className="font-semibold">{l.label}</span>}
            value={<span className={cn(figure, "font-bold")}>{rupees(l.amount)}</span>}
            slot={
              <span className="grid size-9 place-items-center rounded-control transition-colors group-hover:bg-chestnut/10">
                <ChevronRight className={cn("size-5 transition-transform", !phone && breakupOpen && "rotate-180")} aria-hidden />
              </span>
            }
          />
        ))}
      </button>
      {payBack > 0 && <FixedBanner label={t("toPayBack")} amount={payBack} />}
    </div>
  );

  // the breakup
  const breakup = (
    <div id="return-breakup" className="flex min-w-0 flex-col gap-2.5 rounded-control bg-chestnut/[0.04] p-3">
      {held > 0 && <Figure label={tr("advancePart")} amount={rupees(held)} className="mb-3.5 border-b border-chestnut/30 pb-2" />}
      {customer && <Figure label={ts("oldDue")} amount={rupees(oldDue)} />}
      <Figure label={ts("thisBill")} amount={rupees(thisBill)} />
      {held > 0 && (
        <>
          <Figure label={ts("subTotal")} amount={rupees(subTotal)} strong />
          <Figure label={ts("setOff")} amount={setOff > 0 ? `− ${rupees(setOff)}` : rupees(0)} />
        </>
      )}
      <Figure label={tr("due")} amount={rupees(due)} strong />
      <Figure label={t("received")} amount={`− ${rupees(sale.paid)}`} />
      <Figure label={t("paidBack")} amount={`+ ${rupees(payBack)}`} />
      {advanceLeft > 0 && <LeftRow label={ts("advanceLeft")} amount={advanceLeft} />}
      {(dueLeft > 0 || advanceLeft <= 0) && <LeftRow label={ts("leftDue")} amount={dueLeft} />}
    </div>
  );

  // what's still to place, filling as the cards take their parts; green with a tick once nothing is left
  const leftToRefund = (
    <div ref={stickyRef} className="sticky top-16 z-10 -mx-1 flex flex-col gap-2.5 bg-ivory px-1 pb-1 sm:w-[calc(50%-1rem)]">
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
  );

  return (
    <div className="flex flex-col gap-4">
      {/* with the breakup beside on a computer, at least as tall as it */}
      <div className="relative flex flex-col gap-1.5 sm:gap-2.5" style={{ minHeight: phone ? undefined : beside.breakup || undefined }}>
        {phone ? (
          // on a phone: the amounts, and the breakup to their right; the arrow slides the card to it, its ‹ Breakup back
          <div className="-mx-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
            <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", slid && "-translate-x-1/2")}>
              <div ref={mainRef} inert={slid} className="w-1/2 min-w-0 p-1">
                {amounts}
              </div>
              <div ref={sideRef} inert={!slid} className="flex w-1/2 min-w-0 flex-col gap-1 p-1">
                <button ref={back} type="button" onClick={() => slide(false)} className="flex min-h-11 w-full items-center gap-1.5 text-left text-sm font-semibold">
                  <ChevronLeft className="size-5 shrink-0" aria-hidden />
                  {ts("breakup")}
                </button>
                {breakup}
              </div>
            </div>
          </div>
        ) : (
          // on a computer: the amounts on the left; the breakup (while open) over the right half
          <>
            <div ref={amountsRef} className="w-[calc(50%-1.5rem)]">
              {amounts}
            </div>
            {breakupOpen && (
              <div ref={breakupRef} className="absolute right-0 top-0 w-[calc(50%-1.5rem)]">
                {breakup}
              </div>
            )}
          </>
        )}
        {/* with money to pay back: Left to refund, and where it's paid back from (on a computer, starting below the
            breakup) */}
        {payBack > 0 && (
          <>
            {leftToRefund}
            <div className="flex flex-col gap-2.5 border-t border-chestnut/15 pt-4" style={{ marginTop: 6 + (phone ? 0 : beside.push) }}>
              <AccountCards key={payBack} api={cards} />
            </div>
          </>
        )}
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
