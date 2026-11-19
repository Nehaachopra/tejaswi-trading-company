"use client";

import { IndianRupee } from "lucide-react";
import { useId, useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Switch } from "~/components/ui/switch";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi, type Refs } from "../shared/account-cards/types";
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

// a figure that isn't typed: its name on the left, the figure on the right
function Figure({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className={cn("tabular flex items-baseline justify-between gap-3 text-sm", strong && "border-t border-chestnut/30 pt-2")}>
      <span className="min-w-0">{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap text-base font-semibold", strong && "font-bold")}>{rupees(amount)}</span>
    </div>
  );
}

// the Paid card (cash) or Due card (credit). Cash, as a supplier payment's amount: the due part (this bill, and with an
// advance already with them, Set off from advance as a switch), then the payment part: what's paid now in its box (any
// part of what's left, never more; cut there with a warning), closing with Due left; then the cards for where it's paid
// from, each never more than it holds. Credit: this bill and the credit period in days (optional)
export function PaidCard() {
  const e = usePurchaseEntry();
  const { t, ts, kind, tried, total, billLeft, paid, setOff, heldAdvance, dueLeft } = e;
  const setOffLabel = useId();
  // typed past what's left: cut to it, and it says so (until typed again)
  const [cut, setCut] = useState(false);
  const daysBad = tried && Number(e.creditDays) > 365;
  const cards = usePaidCards();

  if (kind === "credit")
    return (
      <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
        <Figure label={ts("thisBill")} amount={total} />
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
    );

  const amountBad = tried && paid === 0 && setOff === 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
        {/* the due part: this bill, an advance with them set off (a switch), what's left to pay */}
        <Figure label={ts("thisBill")} amount={total} />
        {heldAdvance > 0 && (
          <>
            <Figure label={t("advance")} amount={heldAdvance} />
            <div className="tabular flex items-center justify-between gap-3 text-sm">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span id={setOffLabel}>{ts("setOff")}</span>
                <Switch small on={e.setOffOn} onFlip={e.setSetOffOn} labelledBy={setOffLabel} />
              </span>
              <span className="shrink-0 whitespace-nowrap text-base font-semibold">{setOff > 0 ? `− ${rupees(setOff)}` : rupees(0)}</span>
            </div>
            <Figure label={t("toPayNow")} amount={billLeft} strong />
          </>
        )}

        {/* the payment part: what's paid now, then what stays owed */}
        <div className="mt-2 flex flex-col gap-1.5">
          <Row
            htmlFor="paid-field"
            label={
              <>
                {t("paidNow")}
                {setOff === 0 && <RequiredMark />}
              </>
            }
          >
            <MicField onText={(said) => saidAmount(said, e.typePaid)}>
              <IndianRupee className={cn("pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2", paid > 0 && "text-ivory")} aria-hidden />
              <NumberInput
                id="paid-field"
                value={e.paidText}
                decimals={2}
                maxDigits={13}
                max={billLeft}
                placeholder="0"
                onChange={(v) => {
                  setCut(false);
                  e.typePaid(v);
                }}
                onCapped={() => setCut(true)}
                aria-invalid={amountBad || undefined}
                className={cn(
                  input(amountBad),
                  "min-h-12 pl-11 pr-12 font-heading text-xl font-bold tabular",
                  paid > 0 && !amountBad && "bg-chestnut text-ivory caret-ivory shadow-none",
                )}
              />
            </MicField>
          </Row>
          {cut && (
            <FieldMessage tone="warning" className="ml-auto mt-0 w-[60%]">
              {t("onlyPay", { amount: rupees(billLeft) })}
            </FieldMessage>
          )}
        </div>
        <Figure label={t("dueLeft")} amount={dueLeft} strong />
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
