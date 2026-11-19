"use client";

import { Check, ChevronDown, ChevronRight, IndianRupee } from "lucide-react";
import { useId, useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { MicButton } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Switch } from "~/components/ui/switch";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi, type Refs } from "../shared/account-cards/types";
import { DueFlow } from "../shared/fold-group";
import { Meter } from "../shared/meter";
import { input, saidAmount } from "../shared/form-basics";
import { usePurchaseEntry } from "./state";

// a row: its name on the left (level with the box's first line), its figure or box on the right
function Row({ label, htmlFor, children }: { label: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <label htmlFor={htmlFor} className="flex min-h-11 min-w-0 items-center text-sm">
        {label}
      </label>
      <div className="w-[60%] shrink-0 [&_input]:text-right">{children}</div>
    </div>
  );
}

// a figure that isn't typed: its name on the left, the figure on the right; `strong` closes a part with a line above
function Figure({ label, amount, strong = false, className }: { label: React.ReactNode; amount: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn("tabular flex items-center justify-between gap-3 text-sm", strong && "border-t border-chestnut/30 pt-2 font-semibold", className)}>
      <span className="flex min-w-0 items-center">{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap text-base font-semibold", strong && "font-bold")}>{amount}</span>
    </div>
  );
}

// a row on the left: its name, its figure or box (ending at the same edge in every row), then a slot for the mic or the
// arrow at the right end (empty for a plain figure)
function Line({ label, value, slot }: { label?: React.ReactNode; value: React.ReactNode; slot?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex min-h-11 min-w-0 flex-1 items-center text-sm">{label}</span>
      <span className="w-[55%] shrink-0">{value}</span>
      <span className="grid size-10 shrink-0 place-items-center">{slot}</span>
    </div>
  );
}

// a figure on the left: at the right of its space, where a box's typed number ends
const figure = "tabular block pr-3.5 text-right text-base font-semibold";

// what's left, on chestnut: the amount that closes the breakup
function LeftRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="tabular flex items-center justify-between gap-3 rounded-control bg-chestnut px-3 py-2 text-ivory">
      <span className="text-sm font-semibold">{label}</span>
      <span className="font-heading text-lg font-bold">{rupees(amount)}</span>
    </div>
  );
}

// the Paid card (cash) or Due card (credit). Cash: on the left what's left (the due, the advance, or both, an arrow on
// each opening the breakup) over the amount to pay (its box never
// more than cash and the banks hold together), then what's left (plain) with an arrow at the right end, which opens the breakup:
// on the right (under it on a phone). The breakup: an advance they hold (over a line, room under it); the old due, the
// bill amount, then with an advance their sub total and Set off from advance (a switch); the due; the payment taken off
// it (its ⌄ opening what it goes to: the old due first, then the bill); then what's left on chestnut: the due and the
// advance when both are above nothing, otherwise the one that is, and when neither is, ₹0 of what the account had.
// Then the cards for where it's paid from. Credit: the bill amount (with an old due, it and the due) and the credit
// period in days (optional)
export function PaidCard() {
  const e = usePurchaseEntry();
  const { t, tpf, kind, tried, total, oldDue, dueNow, paid, setOff, heldAdvance, dueLeft, advance } = e;
  const setOffLabel = useId();
  const daysBad = tried && Number(e.creditDays) > 365;
  const cards = usePaidCards();
  // the breakup open (it starts open), and what the payment goes to under it
  const [breakupOpen, setBreakupOpen] = useState(true);
  const [towardsOpen, setTowardsOpen] = useState(false);
  // typed past what cash and the banks hold: cut to it, and it says so (until typed again)
  const [cut, setCut] = useState(false);

  if (kind === "credit")
    return (
      <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
        <Figure label={t("billAmount")} amount={rupees(total)} />
        {oldDue > 0 && (
          <>
            <Figure label={t("oldDue")} amount={rupees(oldDue)} />
            <Figure label={tpf("due")} amount={rupees(dueNow)} strong />
          </>
        )}
        <div className="mt-2">
          <Row htmlFor="credit-days" label={t("creditPeriod")}>
            <span className="relative block">
              <NumberInput
                id="credit-days"
                value={e.creditDays}
                maxDigits={3}
                max={365}
                placeholder="0"
                onChange={e.setCreditDays}
                aria-invalid={daysBad || undefined}
                className={cn(input(daysBad), "tabular pr-14 text-right")}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-chestnut/70">{t("days")}</span>
            </span>
          </Row>
        </div>
      </div>
    );

  const amountBad = tried && paid === 0 && setOff === 0;
  // what's left of the advance: what wasn't set off, and what's paid past all that's due
  const advanceLeft = Math.round((heldAdvance - setOff + advance) * 100) / 100;
  // the old due and the bill together, shown with an advance (what it's set off against)
  const subTotal = Math.round((oldDue + total) * 100) / 100;
  // what's left: both when both are above nothing (the advance first); otherwise the one that is; neither: ₹0 of what the account had (an
  // advance when it held one and owed nothing, a due otherwise)
  const left =
    dueLeft > 0 && advanceLeft > 0
      ? [
          { key: "advance", label: tpf("advanceLeft"), amount: advanceLeft },
          { key: "due", label: tpf("leftDue"), amount: dueLeft },
        ]
      : dueLeft > 0
        ? [{ key: "due", label: tpf("leftDue"), amount: dueLeft }]
        : advanceLeft > 0 || (heldAdvance > 0 && oldDue === 0)
          ? [{ key: "advance", label: tpf("advanceLeft"), amount: advanceLeft }]
          : [{ key: "due", label: tpf("leftDue"), amount: 0 }];

  return (
    <div className="flex flex-col gap-4">
      {/* the amounts on the left, the breakup on the right (under them on a phone) */}
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-12">
        {/* each row: its name, the figure ending at the same edge in every row, then the mic or the arrow in a slot of its
            own at the right end */}
        <div className="flex min-w-0 flex-col gap-2.5">
          {/* on top: what's left (the due, the advance, or both), an arrow on each line: opens the breakup (pointing down on a
              phone, where it opens under) */}
          <button
            type="button"
            onClick={() => setBreakupOpen((o) => !o)}
            aria-expanded={breakupOpen}
            aria-controls="purchase-breakup"
            aria-label={t("breakup")}
            className="group flex w-full flex-col gap-1 text-left"
          >
            {left.map((l) => (
              <Line
                key={l.key}
                label={<span className="font-semibold">{l.label}</span>}
                value={<span className={cn(figure, "font-bold")}>{rupees(l.amount)}</span>}
                // an arrow on each line (both open the breakup), as the mic above: a soft-cornered tile, filled on hover
                slot={
                  <span className="grid size-9 place-items-center rounded-control transition-colors group-hover:bg-chestnut/10">
                    <ChevronRight
                      // right, left once open; on a phone down, up once open
                      className={cn("size-5 transition-transform", breakupOpen ? "rotate-180 max-sm:-rotate-90" : "max-sm:rotate-90")}
                      aria-hidden
                    />
                  </span>
                }
              />
            ))}
          </button>
          <Line
            label={
              <label htmlFor="paid-field" className="flex items-center">
                {t("toPayAmount")}
                {setOff === 0 && <RequiredMark />}
              </label>
            }
            value={
              <span className="relative block">
                <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2 text-ivory" aria-hidden />
                <NumberInput
                  id="paid-field"
                  value={e.paidText}
                  decimals={2}
                  maxDigits={13}
                  // never more than cash and the banks hold together; typing past it is cut there, with a warning
                  max={e.payCap ?? undefined}
                  onCapped={() => setCut(true)}
                  placeholder="0"
                  onChange={(v) => {
                    setCut(false);
                    e.typePaid(v);
                  }}
                  aria-invalid={amountBad || undefined}
                  // chestnut whether typed or not; left empty when it's needed, only the card's message says so
                  className={cn(
                    input(false),
                    "min-h-12 bg-chestnut pl-11 pr-3.5 text-right font-heading text-xl font-bold tabular text-ivory caret-ivory shadow-none placeholder:text-ivory/60",
                  )}
                />
              </span>
            }
            // the soft corner of every control (not a circle), filled on hover as the arrow below
            slot={<MicButton onText={(said) => saidAmount(said, e.typePaid)} className="rounded-[var(--radius-control)]" />}
          />
          {cut && e.payCap !== null && (
            <Line
              value={
                <FieldMessage tone="warning" className="mt-0">
                  {tpf("capOnly", { amount: rupees(e.payCap) })}
                </FieldMessage>
              }
            />
          )}
          {/* what's still to place in cash and the bank cards below, filling as they take their parts; green with a tick
              once nothing is left */}
          {paid > 0 && (
            <>
              <Line
                label={tpf("leftToPay")}
                value={
                  e.splitTotal === paid ? (
                    <span className={cn(figure, "flex items-center justify-end text-success")} aria-label={tpf("nothingLeft")}>
                      <Check className="size-5" strokeWidth={2.5} aria-hidden />
                    </span>
                  ) : (
                    <span className={cn(figure, "font-bold")}>{rupees(Math.max(0, Math.round((paid - e.splitTotal) * 100) / 100))}</span>
                  )
                }
              />
              {/* the slider under it, ending where the figures end (clear of the mic and arrow column) */}
              <Meter
                bare
                label={tpf("leftToPay")}
                figure={0}
                share={Math.min(100, (e.splitTotal / paid) * 100)}
                done={e.splitTotal === paid}
                className="-mt-1 mr-12"
              />
            </>
          )}
        </div>

        {/* the breakup */}
        {breakupOpen && (
          <div id="purchase-breakup" className="flex min-w-0 flex-col gap-2.5 rounded-control bg-chestnut/[0.04] p-3">
            {heldAdvance > 0 && <Figure label={tpf("advancePart")} amount={rupees(heldAdvance)} className="mb-3.5 border-b border-chestnut/30 pb-2" />}
            <Figure label={t("oldDue")} amount={rupees(oldDue)} />
            <Figure label={t("billAmount")} amount={rupees(total)} />
            {heldAdvance > 0 && (
              <>
                <Figure label={t("subTotal")} amount={rupees(subTotal)} strong />
                <Figure
                  label={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span id={setOffLabel}>{e.ts("setOff")}</span>
                      <Switch small on={e.setOffOn} onFlip={e.setSetOffOn} labelledBy={setOffLabel} />
                    </span>
                  }
                  amount={setOff > 0 ? `− ${rupees(setOff)}` : rupees(0)}
                />
              </>
            )}
            <Figure label={tpf("due")} amount={rupees(dueNow)} strong />
            {/* the payment taken off, its ⌄ opening what it goes to */}
            <Figure
              label={
                <>
                  {tpf("payGroup")}
                  <button
                    type="button"
                    onClick={() => setTowardsOpen((o) => !o)}
                    aria-expanded={towardsOpen}
                    aria-label={tpf("towardsGroup")}
                    className="ml-1 grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/8"
                  >
                    <ChevronDown className={cn("size-4 transition-transform", towardsOpen && "rotate-180")} aria-hidden />
                  </button>
                </>
              }
              amount={`− ${rupees(paid)}`}
            />
            {towardsOpen && (
              <DueFlow
                wholeLabel={tpf("payGroup")}
                whole={paid}
                dueLabel={t("oldDue")}
                due={e.towardsOld}
                advanceLabel={t("billAmount")}
                advance={e.towardsBill}
                paidLabel={tpf("paidShare")}
                owedBefore={0}
                noWhole
              />
            )}
            {left.map((l) => (
              <LeftRow key={l.key} label={l.label} amount={l.amount} />
            ))}
          </div>
        )}
      </div>

      {/* where it's paid from: a card for each place, once there's an amount */}
      {paid > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-chestnut/15 pt-4">
          <AccountCards key={paid} api={cards} />
        </div>
      )}
    </div>
  );
}

// the cards with a payment's words and parts (every field a row): capped at what each place holds, Auto (off to start
// with), no QR
function usePaidCards(): AccountCardsApi {
  const e = usePurchaseEntry();
  const { tc, tpf } = e;
  // each bank account's reference, kept with how it paid (one typed before a way was picked is left out)
  const refs: Refs = Object.fromEntries(
    Object.entries(e.bankRefs).flatMap(([id, text]) => {
      const mode = e.bankModes[id];
      return mode ? [[id, { mode, text }]] : [];
    }),
  );
  return {
    value: e.paid,
    places: e.places,
    setText: e.setSplit,
    setMode: (id, mode) => e.setBankModes((all) => ({ ...all, [id]: mode })),
    tried: e.tried,
    capAtHeld: true,
    // its meter sits under To pay
    meterOutside: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    auto: { on: e.splitAuto, set: e.setSplitAuto },
    qrItems: [],
    qrId: () => ({ hideId: false }),
    upiPart: () => null,
    refs,
    setRefs: (update) => {
      const next = typeof update === "function" ? update(refs) : update;
      e.setBankRefs(Object.fromEntries(Object.entries(next).map(([id, r]) => [id, r.text])));
    },
    refLeft: e.refLeft,
    setRefLeft: e.setRefLeft,
    labels: {
      breakdown: tpf("breakdown"),
      account: tpf("account"),
      balance: tpf("balance"),
      accountAmount: tc("q.amount"),
      anotherAccount: tpf("anotherAccount"),
      removeAccount: tc("removeAccount"),
      mode: tpf("paidBy"),
      modeMissing: tpf("pickMode"),
      barLeft: tpf("leftToPay"),
      barDone: tpf("nothingLeft"),
      capLeft: (amount) => tpf("capLeft", { amount }),
      capOnly: (amount) => tpf("capOnly", { amount }),
    },
  };
}
