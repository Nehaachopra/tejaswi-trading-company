"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";

import { Switch } from "~/components/ui/switch";
import { rupees } from "~/lib/format";
import { usePhone } from "~/lib/use-phone";
import { cn } from "~/lib/utils";

import { AccountCards } from "./account-cards/account-cards";
import { type AccountCardsApi } from "./account-cards/types";
import { DueFlow } from "./fold-group";
import { Meter } from "./meter";

// a figure that isn't typed: its name on the left, the figure on the right; `strong` closes a part with a line above
export function Figure({ label, amount, strong = false, className }: { label: ReactNode; amount: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn("tabular flex items-center justify-between gap-3 text-sm", strong && "border-t border-chestnut/30 pt-2 font-semibold", className)}>
      <span className="flex min-w-0 items-center">{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap text-base font-semibold", strong && "font-bold")}>{amount}</span>
    </div>
  );
}

// a row on the left: its name, its figure or box (ending at the same edge in every row), then a slot for the mic, the
// arrow or Auto at the right end (empty for a plain figure)
export function Line({ label, value, slot }: { label?: ReactNode; value: ReactNode; slot?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex min-h-11 min-w-0 flex-1 items-center text-sm">{label}</span>
      <span className="w-[55%] shrink-0">{value}</span>
      <span className="grid size-10 shrink-0 place-items-center">{slot}</span>
    </div>
  );
}

// a figure on the left: at the right of its space, where a box's typed number ends
export const figure = "tabular block pr-3.5 text-right text-base font-semibold";

// what's left, on chestnut: the amount that closes the breakup
export function LeftRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="tabular flex items-center justify-between gap-3 rounded-control bg-chestnut px-3 py-2 text-ivory">
      <span className="text-sm font-semibold">{label}</span>
      <span className="font-heading text-lg font-bold">{rupees(amount)}</span>
    </div>
  );
}

// a figure row with a ⌄ beside its name that opens what's under it
function FoldFigure({ label, amount, open, setOpen, toggleLabel }: { label: string; amount: string; open: boolean; setOpen: (v: boolean) => void; toggleLabel: string }) {
  return (
    <Figure
      label={
        <>
          {label}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={toggleLabel}
            className="ml-1 grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/8"
          >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </>
      }
      amount={amount}
    />
  );
}

// a row of what's left (the due, the advance): its name and amount
export type LeftItem = { key: string; label: string; amount: number };

// the breakup's parts: an advance they hold (over a line), the old due (none: left out), the bill, then with an advance
// the sub total and Set off from advance (a switch); the due; `beforePay` (an edit's rows); the payment taken off (its ⌄
// opening what it goes to: the old due first, then the bill); `afterPay` (a sale's TDS); what's left on chestnut; then
// `footer` (a note)
export type Breakup = {
  heldAdvance: number;
  advanceLabel: string;
  oldDue: number | null;
  oldDueLabel: string;
  bill: number;
  billLabel: string;
  subTotalLabel: string;
  setOff: { on: boolean; flip: (v: boolean) => void; amount: number; label: string };
  due: number;
  dueLabel: string;
  beforePay?: ReactNode;
  pay: { label: string; toggleLabel: string; amount: number; whole: number; towardsOld: number; towardsBill: number; paidLabel: string } | null;
  afterPay?: ReactNode;
  left: LeftItem[];
  footer?: ReactNode;
};

// the payment stage shared by sale (Received) and purchase (Paid), for cash. With a breakup: on the left what's left
// (the due, the advance, or both, an arrow on each opening the breakup), then the amount's box; the breakup on the right
// (on a phone the stage slides to it, ‹ Breakup back). Without one (a walk-in sale): only the amount. Once there's an
// amount: Left to receive / Left to pay with its slider, pinned under the header while the account cards below scroll
// (on a computer the cards start below the breakup). `top`: what comes first (a sale's PAN, an exchange's figures).
// `ownBreakup`: the breakup's rows in place of a Breakup's (a payment's due). `second`: a row under the amount's box with
// its own arrow and its own breakup (a payment's To pay), under the first on a computer, slid to on a phone. No
// `cards`: no Left to pay and no cards (the payment has its own below the stage)
// no `box`: the row alone, its icon column left empty
export type SecondBreakup = { label: ReactNode; value: ReactNode; title: string; box?: ReactNode };
export function PaymentStage({
  idPrefix,
  top,
  breakup,
  ownBreakup,
  second,
  breakupLabel,
  leftSide = [],
  amountBox,
  amount,
  placed,
  leftLabel,
  nothingLeftLabel,
  leftSlot,
  cards,
}: {
  idPrefix: string;
  top?: ReactNode;
  breakup: Breakup | null;
  ownBreakup?: ReactNode;
  second?: SecondBreakup;
  breakupLabel: string;
  // the rows of what's left on the left, each opening the breakup
  leftSide?: LeftItem[];
  // the amount's box (typed or fixed), with any warning under it
  amountBox: ReactNode;
  // the amount received or paid, and how much of it the cards have taken so far
  amount: number;
  placed: number;
  leftLabel: string;
  nothingLeftLabel: string;
  // beside Left to pay (a purchase's Auto)
  leftSlot?: ReactNode;
  cards?: AccountCardsApi;
}) {
  const filled = amount > 0;
  const breakupId = `${idPrefix}-breakup`;
  const setOffLabel = useId();
  // on a computer the breakup beside (it starts open); on a phone the stage slid to it (it starts on the amounts); and
  // what the payment goes to under it
  const phone = usePhone();
  const [breakupOpen, setBreakupOpen] = useState(true);
  const [slid, setSlid] = useState(false);
  const shown = phone ? slid : breakupOpen;
  // the second row's breakup: open beside on a computer; on a phone which breakup the stage slid to
  const [secondOpen, setSecondOpen] = useState(true);
  const [slidTo, setSlidTo] = useState<"first" | "second">("first");
  const [towardsOpen, setTowardsOpen] = useState(false);
  const withBreakup = breakup !== null || ownBreakup !== undefined;

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
  }, [phone, slid, withBreakup]);
  // a computer's breakup lies over the right half: the stage is kept at least as tall as it, and the account cards start
  // below it (pushed down by what the amounts and Left to pay fall short of it)
  const amountsRef = useRef<HTMLDivElement>(null);
  const breakupRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [beside, setBeside] = useState({ breakup: 0, push: 0 });
  useLayoutEffect(() => {
    if (phone) return;
    const fit = () => {
      const breakupH = breakupRef.current?.offsetHeight ?? 0;
      // where the cards' line falls on its own: the amounts, a gap, Left to pay, a gap, its own 6px
      const natural = (amountsRef.current?.offsetHeight ?? 0) + 10 + (stickyRef.current?.offsetHeight ?? 0) + 10 + 6;
      setBeside({ breakup: breakupH, push: breakupH ? Math.max(0, breakupH + 16 - natural) : 0 });
    };
    fit();
    const watch = new ResizeObserver(fit);
    for (const el of [amountsRef.current, breakupRef.current, stickyRef.current]) if (el) watch.observe(el);
    return () => watch.disconnect();
  }, [phone, breakupOpen, secondOpen, filled, withBreakup]);
  // on sliding, the cursor goes to the back arrow (or back to the arrow that opened it)
  const back = useRef<HTMLButtonElement>(null);
  const arrowRow = useRef<HTMLButtonElement>(null);
  const secondArrow = useRef<HTMLButtonElement>(null);
  const slide = (to: boolean, which: "first" | "second" = slidTo) => {
    if (to) setSlidTo(which);
    setSlid(to);
    const from = which === "second" ? secondArrow : arrowRow;
    setTimeout(() => (to ? back : from).current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions), 320);
  };

  // what's still to place in cash and the bank cards below, filling as they take their parts; green with a tick once
  // nothing is left. Pinned under the header while the cards scroll
  const leftToPlace = filled && cards && (
    <div ref={stickyRef} className="sticky top-16 z-10 -mx-1 flex flex-col gap-2.5 bg-ivory px-1 pb-1 sm:w-[calc(50%-1rem)]">
      <Line
        label={leftLabel}
        value={
          placed === amount ? (
            <span className={cn(figure, "flex items-center justify-end text-success")} aria-label={nothingLeftLabel}>
              <Check className="size-5" strokeWidth={2.5} aria-hidden />
            </span>
          ) : (
            <span className={cn(figure, "font-bold")}>{rupees(Math.max(0, Math.round((amount - placed) * 100) / 100))}</span>
          )
        }
        slot={leftSlot}
      />
      {/* the slider under it, the full width of the rows above (the mic and arrow column too) */}
      <Meter bare label={leftLabel} figure={0} share={Math.min(100, (placed / amount) * 100)} done={placed === amount} className="-mt-1" />
    </div>
  );
  // where it goes: a card for each place, once there's an amount (on a computer, starting below the breakup)
  const accountCards = filled && cards && (
    <div className="flex flex-col gap-2.5 border-t border-chestnut/15 pt-4" style={{ marginTop: 6 + (phone || !withBreakup ? 0 : beside.push) }}>
      <AccountCards key={amount} api={cards} />
    </div>
  );

  // no breakup (a walk-in sale): what comes first, the amount, then what's left to place and the cards
  if (!withBreakup)
    return (
      <div className="flex flex-col gap-1.5 sm:gap-2.5">
        {top}
        {amountBox && <div className="sm:w-[calc(50%-1.5rem)]">{amountBox}</div>}
        {leftToPlace}
        {accountCards}
      </div>
    );

  const subTotal = breakup ? Math.round(((breakup.oldDue ?? 0) + breakup.bill) * 100) / 100 : 0;

  // the amounts: what's left (an arrow on each line opening the breakup), then the amount's box
  const amounts = (
    <div className="flex min-w-0 flex-col gap-2.5">
      <button
        ref={arrowRow}
        type="button"
        onClick={() => (phone ? slide(true, "first") : setBreakupOpen((o) => !o))}
        aria-expanded={phone ? slid && slidTo === "first" : shown}
        aria-controls={breakupId}
        aria-label={breakupLabel}
        className="group flex w-full flex-col gap-1 text-left"
      >
        {leftSide.map((l) => (
          <Line
            key={l.key}
            label={<span className="font-semibold">{l.label}</span>}
            value={<span className={cn(figure, "font-bold")}>{rupees(l.amount)}</span>}
            // an arrow on each line (both open the breakup): a soft-cornered tile, filled on hover; right, left once
            // open beside (on a phone always right: it slides there)
            slot={
              <span className="grid size-9 place-items-center rounded-control transition-colors group-hover:bg-chestnut/10">
                <ChevronRight className={cn("size-5 transition-transform", !phone && breakupOpen && "rotate-180")} aria-hidden />
              </span>
            }
          />
        ))}
      </button>
      {amountBox}
      {/* the second row (a payment's To pay): its arrow opens its own breakup */}
      {second && (
        <Line
          label={second.label}
          value={second.value}
          slot={
            second.box && (
            <button
              ref={secondArrow}
              type="button"
              onClick={() => (phone ? slide(true, "second") : setSecondOpen((o) => !o))}
              aria-expanded={phone ? slid && slidTo === "second" : secondOpen}
              aria-controls={`${breakupId}-second`}
              aria-label={second.title}
              className="grid size-9 place-items-center rounded-control transition-colors hover:bg-chestnut/10"
            >
              <ChevronRight className={cn("size-5 transition-transform", !phone && secondOpen && "rotate-180")} aria-hidden />
            </button>
            )
          }
        />
      )}
    </div>
  );

  // the second row's breakup
  const secondBox = second?.box && (
    <div id={`${breakupId}-second`} className="flex min-w-0 flex-col gap-2.5 rounded-control bg-chestnut/[0.04] p-3">
      {second.box}
    </div>
  );

  // the breakup: its own rows, or a Breakup's
  const breakupBox = !breakup ? (
    <div id={breakupId} className="flex min-w-0 flex-col gap-2.5 rounded-control bg-chestnut/[0.04] p-3">
      {ownBreakup}
    </div>
  ) : (
    <div id={breakupId} className="flex min-w-0 flex-col gap-2.5 rounded-control bg-chestnut/[0.04] p-3">
      {breakup.heldAdvance > 0 && (
        <Figure label={breakup.advanceLabel} amount={rupees(breakup.heldAdvance)} className="mb-3.5 border-b border-chestnut/30 pb-2" />
      )}
      {breakup.oldDue !== null && <Figure label={breakup.oldDueLabel} amount={rupees(breakup.oldDue)} />}
      <Figure label={breakup.billLabel} amount={rupees(breakup.bill)} />
      {breakup.heldAdvance > 0 && (
        <>
          <Figure label={breakup.subTotalLabel} amount={rupees(subTotal)} strong />
          <Figure
            label={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span id={setOffLabel}>{breakup.setOff.label}</span>
                <Switch small on={breakup.setOff.on} onFlip={breakup.setOff.flip} labelledBy={setOffLabel} />
              </span>
            }
            amount={breakup.setOff.amount > 0 ? `− ${rupees(breakup.setOff.amount)}` : rupees(0)}
          />
        </>
      )}
      <Figure label={breakup.dueLabel} amount={rupees(breakup.due)} strong />
      {breakup.beforePay}
      {/* the payment taken off, its ⌄ opening what it goes to */}
      {breakup.pay && (
        <>
          <FoldFigure label={breakup.pay.label} toggleLabel={breakup.pay.toggleLabel} amount={`− ${rupees(breakup.pay.amount)}`} open={towardsOpen} setOpen={setTowardsOpen} />
          {towardsOpen && (
            <DueFlow
              wholeLabel={breakup.pay.label}
              whole={breakup.pay.whole}
              dueLabel={breakup.oldDueLabel}
              due={breakup.pay.towardsOld}
              advanceLabel={breakup.billLabel}
              advance={breakup.pay.towardsBill}
              paidLabel={breakup.pay.paidLabel}
              owedBefore={0}
              noWhole
            />
          )}
        </>
      )}
      {breakup.afterPay}
      {breakup.left.map((l) => (
        <LeftRow key={l.key} label={l.label} amount={l.amount} />
      ))}
      {breakup.footer}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {top}
      {/* with the breakup beside on a computer, at least as tall as it */}
      <div className="relative flex flex-col gap-1.5 sm:gap-2.5" style={{ minHeight: phone ? undefined : beside.breakup || undefined }}>
        {phone ? (
          // on a phone: the amounts, and the breakup to their right; the arrow slides the stage to it, its ‹ Breakup
          // back. As tall as the panel showing (room at the sides for the boxes' soft edges)
          <div className="-mx-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
            <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", slid && "-translate-x-1/2")}>
              <div ref={mainRef} inert={slid} className="w-1/2 min-w-0 p-1">
                {amounts}
              </div>
              <div ref={sideRef} inert={!slid} className="flex w-1/2 min-w-0 flex-col gap-1 p-1">
                <button ref={back} type="button" onClick={() => slide(false)} className="flex min-h-11 w-full items-center gap-1.5 text-left text-sm font-semibold">
                  <ChevronLeft className="size-5 shrink-0" aria-hidden />
                  {secondBox && slidTo === "second" ? second.title : breakupLabel}
                </button>
                {secondBox && slidTo === "second" ? secondBox : breakupBox}
              </div>
            </div>
          </div>
        ) : (
          // on a computer: the amounts on the left; the breakup (while open) on the right, laid over the stage's right
          // half so it never pushes Left to pay down
          <>
            <div ref={amountsRef} className="w-[calc(50%-1.5rem)]">
              {amounts}
            </div>
            {(breakupOpen || (secondBox && secondOpen)) && (
              <div ref={breakupRef} className="absolute right-0 top-0 flex w-[calc(50%-1.5rem)] flex-col gap-3">
                {breakupOpen && breakupBox}
                {secondOpen && secondBox}
              </div>
            )}
          </>
        )}
        {leftToPlace}
        {accountCards}
      </div>
    </div>
  );
}
