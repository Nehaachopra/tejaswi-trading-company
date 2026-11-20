"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Note } from "~/components/ui/note";
import { RequiredMark } from "~/components/ui/required-mark";
import { Switch } from "~/components/ui/switch";
import { rupees } from "~/lib/format";
import { usePhone } from "~/lib/use-phone";
import { cn } from "~/lib/utils";

import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { DueFlow } from "../shared/fold-group";
import { Meter } from "../shared/meter";
import { OriginalReceived } from "./original-received";
import { SALE_TDS_RATE, useSaleEntry } from "./state";
import { FixedBanner, TypedBanner } from "../shared/amount-banner";

// a row: its name on the left (level with the box's first line), its figure or box on the right, as a receipt's
const underValue = "ml-auto w-[60%]";
function Row({
  label,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <label htmlFor={htmlFor} className="flex min-h-11 min-w-0 items-center text-sm">
        {label}
      </label>
      <div className="w-[60%] shrink-0 [&_input]:text-right">{children}</div>
    </div>
  );
}

// a part's heading inside the card (PAN, then Received), as the card's own name reads
const partHeading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// a figure that isn't typed: its name on the left, the figure on the right; `strong` closes a part with a line above
function Figure({
  label,
  amount,
  strong = false,
  className,
}: {
  label: React.ReactNode;
  amount: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "tabular flex items-center justify-between gap-3 text-sm",
        strong && "border-t border-chestnut/30 pt-2 font-semibold",
        className,
      )}
    >
      <span className="flex min-w-0 items-center">{label}</span>
      <span
        className={cn("shrink-0 whitespace-nowrap text-base font-semibold", strong && "font-bold")}
      >
        {amount}
      </span>
    </div>
  );
}

// a row on the left, as the purchase's Paid card: its name, its figure or box (ending at the same edge in every row),
// then a slot for the mic or the arrow at the right end (empty for a plain figure)
export function Line({
  label,
  value,
  slot,
}: {
  label?: React.ReactNode;
  value: React.ReactNode;
  slot?: React.ReactNode;
}) {
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
function LeftRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="tabular flex items-center justify-between gap-3 rounded-control bg-chestnut px-3 py-2 text-ivory">
      <span className="text-sm font-semibold">{label}</span>
      <span className="font-heading text-lg font-bold">{rupees(amount)}</span>
    </div>
  );
}

// the Received card (a cash sale's, after the customer), laid out as the purchase's Paid card. A saved customer's: on
// the left three things: what's left (the due, the advance, or both, an arrow on each opening the breakup), To receive
// (its box, with the mic), then Left to receive with its slider, pinned under the header while the account cards below
// scroll. The breakup on the right (on a phone the card slides to it, ‹ Breakup back): an advance they have with us
// (over a line), the old due, this bill, then with an advance their sub total and Set off from advance (a switch); the
// due; the amount received taken off it (its ⌄ opening what it goes towards, the old due first) and the TDS they
// deducted (a switch; the PAN is asked above once TDS is on and none is saved); then what's left on chestnut. A
// walk-in pays the bill: To receive (the bill), then Left to receive and the cards. A credit sale shows only the three
// due rows. An edit (cash moving) has the full layout, a walk-in's too: no TDS or set off; the breakup adds Original
// sale received (its ⌄ opening where it came in) above what's received now, or Refund now when the bill went down
export function ReceivedCard() {
  const e = useSaleEntry();
  const { t, tc, kind, tried, total, oldDue, dueNow, received, tdsCan, tdsOnIt, panNeeded } = e;
  const { isEdit, refunding, editPaid, editLeft } = e;
  const [originalOpen, setOriginalOpen] = useState(false);
  const tr = useTranslations("transactions.receipt.form");
  const tdsLabel = useId();
  const setOffLabel = useId();
  const cards = useSaleCards();
  const filled = received > 0;
  const amountBad = tried && received === 0 && e.setOff === 0;
  const panBad = tried && panNeeded && !/^[A-Z]{5}\d{4}[A-Z]$/.test(e.pan);
  // their PAN is asked: TDS on, an amount in, none saved
  const askPan = tdsCan && filled && panNeeded;

  // on a computer the breakup beside (it starts open); on a phone the card slid to it (it starts on the amounts); and
  // what the receipt goes towards under it
  const phone = usePhone();
  const [breakupOpen, setBreakupOpen] = useState(true);
  const [slid, setSlid] = useState(false);
  const shown = phone ? slid : breakupOpen;
  const [towardsOpen, setTowardsOpen] = useState(false);

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
  }, [phone, slid, kind, tdsCan]);
  // a computer's breakup lies over the right half: the card is kept at least as tall as it, and the account cards start
  // below it (pushed down by what the amounts and Left to receive fall short of it)
  const amountsRef = useRef<HTMLDivElement>(null);
  const breakupRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [beside, setBeside] = useState({ breakup: 0, push: 0 });
  useLayoutEffect(() => {
    if (phone) return;
    const fit = () => {
      const breakupH = breakupRef.current?.offsetHeight ?? 0;
      // where the cards' line falls on its own: the amounts, a gap, Left to receive, a gap, its own 6px
      const natural =
        (amountsRef.current?.offsetHeight ?? 0) +
        10 +
        (stickyRef.current?.offsetHeight ?? 0) +
        10 +
        6;
      setBeside({ breakup: breakupH, push: breakupH ? Math.max(0, breakupH + 16 - natural) : 0 });
    };
    fit();
    const watch = new ResizeObserver(fit);
    for (const el of [amountsRef.current, breakupRef.current, stickyRef.current])
      if (el) watch.observe(el);
    return () => watch.disconnect();
  }, [phone, breakupOpen, filled, kind, tdsCan]);
  // on sliding, the cursor goes to the back arrow (or back to the arrow that opened it)
  const back = useRef<HTMLButtonElement>(null);
  const arrowRow = useRef<HTMLButtonElement>(null);
  const slide = (to: boolean) => {
    setSlid(to);
    setTimeout(
      () =>
        (to ? back : arrowRow).current?.focus({
          preventScroll: true,
          focusVisible: false,
        } as FocusOptions),
      320,
    );
  };

  // a credit sale: only what they'll owe, nothing to type (an edit's: Due left on the left, the breakup on the right)
  const credit = kind === "credit";
  if (credit && !isEdit)
    return (
      <div className="flex flex-col gap-2 sm:max-w-80">
        <Figure label={t("thisBill")} amount={rupees(total)} />
        <Figure label={t("oldDue")} amount={rupees(oldDue)} />
        <Figure label={tr("due")} amount={rupees(dueNow)} strong />
      </div>
    );

  // what's still to place in cash and the bank cards below, filling as they take their parts; green with a tick once
  // nothing is left. Pinned under the header while the cards scroll
  // its name: an edit's (tried there first) "Remaining", refund or not
  const leftLabel = isEdit ? t("edit.remaining") : tr("leftToReceive");
  const leftToReceive = filled && (
    <div
      ref={stickyRef}
      className="sticky top-16 z-10 -mx-1 flex flex-col gap-2.5 bg-ivory px-1 pb-1 sm:w-[calc(50%-1rem)]"
    >
      <Line
        label={leftLabel}
        value={
          e.gridTotal === received ? (
            <span
              className={cn(figure, "flex items-center justify-end text-success")}
              aria-label={tr("nothingLeft")}
            >
              <Check className="size-5" strokeWidth={2.5} aria-hidden />
            </span>
          ) : (
            <span className={cn(figure, "font-bold")}>
              {rupees(Math.max(0, Math.round((received - e.gridTotal) * 100) / 100))}
            </span>
          )
        }
      />
      {/* the slider under it, the full width of the rows above (the mic and arrow column too) */}
      <Meter
        bare
        label={leftLabel}
        figure={0}
        share={Math.min(100, (e.gridTotal / received) * 100)}
        done={e.gridTotal === received}
        className="-mt-1"
      />
    </div>
  );
  // where it came into: a card for each place, once there's an amount (on a computer, starting below the breakup)
  const accountCards = filled && (
    <div
      className="flex flex-col gap-2.5 border-t border-chestnut/15 pt-4"
      style={{ marginTop: 6 + (phone || !tdsCan ? 0 : beside.push) }}
    >
      <AccountCards
        key={received}
        // a refund goes out of them: how it was paid, what's left to refund
        api={
          refunding
            ? {
                ...cards,
                labels: {
                  ...cards.labels,
                  mode: t("edit.paidBy"),
                  barLeft: t("edit.leftToRefund"),
                },
              }
            : cards
        }
      />
    </div>
  );

  // a walk-in pays the bill: only what's to be received, then Left to receive and where it came into
  if (!tdsCan && !isEdit)
    return (
      <div className="flex flex-col gap-1.5 sm:gap-2.5">
        <div className="sm:w-[calc(50%-1.5rem)]">
          <FixedBanner label={t("toReceiveOnly")} amount={received} />
        </div>
        {leftToReceive}
        {accountCards}
      </div>
    );

  // the advance still with us after this sale: what wasn't set off against the bill, and what's paid over what's due
  const advanceLeft = Math.round((e.heldAdvance - e.setOff + e.advance) * 100) / 100;
  // the old due and the bill together, shown with an advance (what it's set off against)
  const subTotal = Math.round((oldDue + total) * 100) / 100;
  // what's left: both when both are above nothing (the advance first); otherwise the one that is; neither: ₹0 of what
  // the account had (an advance when it held one and owed nothing, a due otherwise)
  // (an edit leaves only a due: what's received now is capped at what the bill still has owed on it)
  const left = isEdit
    ? credit && e.editAdvanceLeft > 0
      ? [
          { key: "advance", label: t("advanceLeft"), amount: e.editAdvanceLeft },
          { key: "due", label: t("leftDue"), amount: editLeft },
        ]
      : [{ key: "due", label: t("leftDue"), amount: editLeft }]
    : e.leftDue > 0 && advanceLeft > 0
      ? [
          { key: "advance", label: t("advanceLeft"), amount: advanceLeft },
          { key: "due", label: t("leftDue"), amount: e.leftDue },
        ]
      : e.leftDue > 0
        ? [{ key: "due", label: t("leftDue"), amount: e.leftDue }]
        : advanceLeft > 0 || (e.heldAdvance > 0 && oldDue === 0)
          ? [{ key: "advance", label: t("advanceLeft"), amount: advanceLeft }]
          : [{ key: "due", label: t("leftDue"), amount: 0 }];
  // on the left: Due left always, ₹0 too (with an advance left, under it)
  const leftSide = left.some((l) => l.key === "due")
    ? left
    : [...left, { key: "due", label: t("leftDue"), amount: 0 }];

  // the amounts: what's left (an arrow on each line opening the breakup), then To receive in its box with the mic
  const amounts = (
    <div className="flex min-w-0 flex-col gap-2.5">
      <button
        ref={arrowRow}
        type="button"
        onClick={() => (phone ? slide(true) : setBreakupOpen((o) => !o))}
        aria-expanded={shown}
        aria-controls="sale-breakup"
        aria-label={t("breakup")}
        className="group flex w-full flex-col gap-1 text-left"
      >
        {leftSide.map((l) => (
          <Line
            key={l.key}
            label={<span className="font-semibold">{l.label}</span>}
            value={<span className={cn(figure, "font-bold")}>{rupees(l.amount)}</span>}
            // an arrow on each line (both open the breakup): a soft-cornered tile, filled on hover
            slot={
              <span className="grid size-9 place-items-center rounded-control transition-colors group-hover:bg-chestnut/10">
                <ChevronRight
                  className={cn(
                    "size-5 transition-transform",
                    !phone && breakupOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </span>
            }
          />
        ))}
      </button>
      {/* To receive: fixed (a refund, a walk-in's edit) or typed (a customer's); none on an edit to credit */}
      {isEdit && credit ? null : refunding || e.editWalkIn ? (
        <FixedBanner
          label={refunding ? t("edit.refundNow") : t("toReceiveOnly")}
          amount={received}
        />
      ) : (
        <TypedBanner
          id="received-field"
          label={t("toReceiveOnly")}
          value={e.receivedText}
          onChange={e.typeReceived}
          // an edit takes no more than the bill still has owed on it
          max={isEdit ? e.editDueLeft : undefined}
          invalid={amountBad}
          required={e.setOff === 0}
        />
      )}
    </div>
  );

  // the breakup
  const breakup = (
    <div
      id="sale-breakup"
      className="flex min-w-0 flex-col gap-2.5 rounded-control bg-chestnut/[0.04] p-3"
    >
      {e.heldAdvance > 0 && (
        <Figure
          label={tr("advancePart")}
          amount={rupees(e.heldAdvance)}
          className="mb-3.5 border-b border-chestnut/30 pb-2"
        />
      )}
      {/* (a walk-in's edit has no account, so no old due) */}
      {!(isEdit && !e.editing?.customer) && <Figure label={t("oldDue")} amount={rupees(oldDue)} />}
      <Figure label={t("thisBill")} amount={rupees(total)} />
      {e.heldAdvance > 0 && (
        <>
          <Figure label={t("subTotal")} amount={rupees(subTotal)} strong />
          <Figure
            label={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span id={setOffLabel}>{t("setOff")}</span>
                <Switch small on={e.setOffOn} onFlip={e.setSetOffOn} labelledBy={setOffLabel} />
              </span>
            }
            amount={e.setOff > 0 ? `− ${rupees(e.setOff)}` : rupees(0)}
          />
        </>
      )}
      <Figure label={tr("due")} amount={rupees(dueNow)} strong />
      {/* an edit: what the original sale received taken off, its ⌄ opening where it came in; then what's received now
          taken off, or what's refunded added back */}
      {isEdit && (
        <>
          <Figure
            label={
              <>
                {t("edit.originalReceived")}
                {/* (its ⌄ only when something was received) */}
                {editPaid > 0 && (
                  <button
                    type="button"
                    onClick={() => setOriginalOpen((o) => !o)}
                    aria-expanded={originalOpen}
                    aria-label={t("edit.originalBreakdown")}
                    className="ml-1 grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/8"
                  >
                    <ChevronDown
                      className={cn("size-4 transition-transform", originalOpen && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                )}
              </>
            }
            amount={`− ${rupees(editPaid)}`}
          />
          {originalOpen && editPaid > 0 && <OriginalReceived />}
          {/* (credit takes nothing now) */}
          {!credit && (
            <Figure
              label={refunding ? t("edit.refundNow") : t("edit.received")}
              amount={refunding ? `+ ${rupees(received)}` : `− ${rupees(received)}`}
            />
          )}
        </>
      )}
      {/* the amount received taken off, its ⌄ opening what it goes towards */}
      {!isEdit && (
        <Figure
          label={
            <>
              {tr("receiptGroup")}
              <button
                type="button"
                onClick={() => setTowardsOpen((o) => !o)}
                aria-expanded={towardsOpen}
                aria-label={tr("towardsGroup")}
                className="ml-1 grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/8"
              >
                <ChevronDown
                  className={cn("size-4 transition-transform", towardsOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
            </>
          }
          amount={`− ${rupees(received)}`}
        />
      )}
      {/* the TDS they deducted: a switch, its rate once on (not in an edit) */}
      {!isEdit && (
        <Figure
          label={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span id={tdsLabel}>{tc("sum.tds")}</span>
              <Switch small on={tdsOnIt} onFlip={e.flipTds} labelledBy={tdsLabel} />
              {tdsOnIt && <span className="tabular text-xs font-semibold">{SALE_TDS_RATE}%</span>}
            </span>
          }
          amount={e.tdsAmount > 0 ? `− ${rupees(e.tdsAmount)}` : rupees(0)}
        />
      )}
      {!isEdit && towardsOpen && (
        <DueFlow
          wholeLabel={tr("receiptGroup")}
          whole={e.settles}
          dueLabel={t("oldDue")}
          due={e.towardsOld}
          advanceLabel={t("thisBill")}
          advance={e.towardsBill}
          paidLabel=""
          owedBefore={0}
          noWhole
        />
      )}
      {left.map((l) => (
        <LeftRow key={l.key} label={l.label} amount={l.amount} />
      ))}
      {tdsOnIt && filled && <Note className="text-chestnut/70">{tr("tdsNote194Q")}</Note>}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* their PAN (TDS on, an amount in, none saved): under its own heading above the Received heading (the card's own
          name is hidden then) */}
      {askPan && (
        <>
          <section className="flex min-w-0 flex-col gap-2.5 sm:max-w-[calc(50%-1.5rem)]">
            <h3 className={partHeading}>PAN</h3>
            <Row
              htmlFor="pan-field"
              label={
                <>
                  {t("pan")}
                  <RequiredMark />
                </>
              }
            >
              <input
                id="pan-field"
                value={e.pan}
                maxLength={10}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="ABCDE1234F"
                onChange={(ev) =>
                  e.setPan(
                    ev.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 10),
                  )
                }
                aria-invalid={panBad || undefined}
                className={cn(
                  "tabular min-h-11 w-full min-w-0 px-3 text-base uppercase placeholder:text-chestnut/60",
                  fieldClass(panBad),
                )}
              />
            </Row>
            {panBad && (
              <FieldMessage className={cn("mt-0", underValue)}>{t("panBad")}</FieldMessage>
            )}
          </section>
          <h3 className={cn(partHeading, "-mb-2")}>{t("steps.received")}</h3>
        </>
      )}

      {/* with the breakup beside on a computer, at least as tall as it */}
      <div
        className="relative flex flex-col gap-1.5 sm:gap-2.5"
        style={{ minHeight: phone ? undefined : beside.breakup || undefined }}
      >
        {phone ? (
          // on a phone, as the purchase's Paid card: the amounts, and the breakup to their right; the arrow slides the
          // card to it, its ‹ Breakup back. As tall as the panel showing (room at the sides for the boxes' soft edges)
          <div
            className="-mx-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none"
            style={{ height }}
          >
            <div
              className={cn(
                "flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none",
                slid && "-translate-x-1/2",
              )}
            >
              <div ref={mainRef} inert={slid} className="w-1/2 min-w-0 p-1">
                {amounts}
              </div>
              <div ref={sideRef} inert={!slid} className="flex w-1/2 min-w-0 flex-col gap-1 p-1">
                <button
                  ref={back}
                  type="button"
                  onClick={() => slide(false)}
                  className="flex min-h-11 w-full items-center gap-1.5 text-left text-sm font-semibold"
                >
                  <ChevronLeft className="size-5 shrink-0" aria-hidden />
                  {t("breakup")}
                </button>
                {breakup}
              </div>
            </div>
          </div>
        ) : (
          // on a computer: the amounts on the left; the breakup (while open) on the right, laid over the card's right
          // half so it never pushes Left to receive down
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
        {leftToReceive}
        {accountCards}
      </div>
    </div>
  );
}

// the bank cards with a receipt's words and parts, laid out as a payment's (every field a row): no cap at what a place
// holds and no balances shown (money comes in), no Auto; Left to receive and its slider sit above them. An account by
// UPI with no UPI ID of ours says to add one
export function useSaleCards(): AccountCardsApi {
  const e = useSaleEntry();
  const t = useTranslations("transactions.receipt.form");
  const tpf = useTranslations("transactions.payment.form");
  const tc = useTranslations("transactions.chat");
  return {
    value: e.received,
    places: e.gridPlaces,
    setText: e.setGridText,
    setMode: e.setGridMode,
    tried: e.tried,
    capAtHeld: false,
    hideHeld: true,
    meterOutside: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    qrItems: e.qrItems,
    qrIdLabel: t("upiId"),
    qrId: () => ({ hideId: false }),
    upiPart: (place) =>
      e.upiIdsOf(place.id).length > 0 ? null : (
        <FieldMessage className="mt-0 ml-auto w-[62%]">{e.t("noUpi")}</FieldMessage>
      ),
    refs: e.refs,
    setRefs: e.setRefs,
    refLeft: e.refLeft,
    setRefLeft: e.setRefLeft,
    labels: {
      breakdown: tpf("breakdown"),
      account: tpf("account"),
      accountAmount: t("accountAmount"),
      anotherAccount: tpf("anotherAccount"),
      removeAccount: tc("removeAccount"),
      mode: t("receivedBy"),
      modeMissing: t("pickMode"),
      barLeft: t("leftToReceive"),
      barDone: t("nothingLeft"),
      capLeft: (amount) => t("capLeft", { amount }),
      capOnly: (amount) => t("capLeft", { amount }),
    },
  };
}
