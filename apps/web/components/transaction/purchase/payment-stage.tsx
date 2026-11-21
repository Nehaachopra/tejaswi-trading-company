"use client";

import { useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { rupees } from "~/lib/format";

import { type AccountCardsApi, type Refs } from "../shared/account-cards/types";
import { TypedBanner } from "../shared/amount-banner";
import { DueStage } from "../shared/due-stage";
import { type LeftItem, Line, PaymentStage as SharedStage } from "../shared/payment-stage";
import { AutoSwitch } from "../shared/split-grid";
import { UpiIdField } from "../shared/upi-id-field";
import { usePurchaseEntry } from "./state";

// a purchase's payment stage (Paid, cash), on the shared one: what's left with arrows to the breakup, To pay (typed,
// never more than cash and the banks hold together: typing past it is cut there with a warning), Left to pay with Auto
// beside it, then the cards for where it's paid from. Credit: the shared due stage instead
export function PaymentStage() {
  const e = usePurchaseEntry();
  const { t, tpf, kind, tried, total, oldDue, dueNow, paid, setOff, heldAdvance, dueLeft, advance } = e;
  const cards = usePaidCards();
  // typed past what cash and the banks hold: cut to it, and it says so (until typed again)
  const [cut, setCut] = useState(false);

  // credit: the shared due stage (the bill, the old due, the due and the credit period)
  if (kind === "credit") return <DueStage bill={total} oldDue={oldDue} due={dueNow} days={e.creditDays} setDays={e.setCreditDays} tried={tried} />;

  const amountBad = tried && paid === 0 && setOff === 0;
  // what's left of the advance: what wasn't set off, and what's paid past all that's due
  const advanceLeft = Math.round((heldAdvance - setOff + advance) * 100) / 100;
  // what's left: both when both are above nothing (the advance first); otherwise the one that is; neither: ₹0 of what
  // the account had (an advance when it held one and owed nothing, a due otherwise)
  const left: LeftItem[] =
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
  // on the left: Due left always, ₹0 too (with an advance left, under it)
  const leftSide = left.some((l) => l.key === "due") ? left : [...left, { key: "due", label: tpf("leftDue"), amount: 0 }];

  return (
    <SharedStage
      idPrefix="purchase"
      breakupLabel={t("breakup")}
      leftSide={leftSide}
      // To pay: never more than cash and the banks hold together, typing past it is cut there with a warning
      amountBox={
        <>
          <TypedBanner
            id="paid-field"
            label={t("toPayAmount")}
            value={e.paidText}
            onChange={(v) => {
              setCut(false);
              e.typePaid(v);
            }}
            max={e.payCap ?? undefined}
            onCapped={() => setCut(true)}
            invalid={amountBad}
            required={setOff === 0}
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
        </>
      }
      amount={paid}
      placed={e.splitTotal}
      leftLabel={tpf("leftToPay")}
      nothingLeftLabel={tpf("nothingLeft")}
      // Auto beside Left to pay: the word over its switch (it fills the cards from what each holds)
      leftSlot={<AutoSwitch stacked on={e.splitAuto} set={e.setSplitAuto} />}
      cards={cards}
      breakup={{
        heldAdvance,
        advanceLabel: tpf("advancePart"),
        oldDue,
        oldDueLabel: t("oldDue"),
        bill: total,
        billLabel: t("billAmount"),
        subTotalLabel: t("subTotal"),
        setOff: { on: e.setOffOn, flip: e.setSetOffOn, amount: setOff, label: e.ts("setOff") },
        due: dueNow,
        dueLabel: tpf("due"),
        pay: { label: tpf("payGroup"), toggleLabel: tpf("towardsGroup"), amount: paid, whole: paid, towardsOld: e.towardsOld, towardsBill: e.towardsBill, paidLabel: tpf("paidShare") },
        left,
      }}
    />
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
    // the supplier's QR in each card paying by UPI, their UPI ID above it with a pen (hidden while it's changed in its box)
    qrItems: e.qrItems,
    qrIdLabel: tpf("supplierUpi"),
    qrId: () => ({ hideId: e.upiId.editing, onEdit: () => e.upiId.setEditing(true) }),
    // by UPI: the supplier's UPI ID box while there's none kept, once (in the first card paying by UPI)
    upiPart: (place) =>
      place.id === e.places.find((p) => p.amount > 0 && p.mode === "upi")?.id ? (
        <UpiIdField row show={e.asksUpi && !e.upiKept} label={tpf("supplierUpi")} state={e.upiId} />
      ) : null,
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
