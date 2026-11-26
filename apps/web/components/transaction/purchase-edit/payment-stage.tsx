"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { rupees } from "~/lib/format";

import { type AccountCardsApi } from "../shared/account-cards/types";
import { TypedBanner } from "../shared/amount-banner";
import { DueStage } from "../shared/due-stage";
import { Figure, type LeftItem, Line, PaymentStage as SharedStage } from "../shared/payment-stage";
import { AutoSwitch } from "../shared/split-grid";
import { UpiIdField } from "../shared/upi-id-field";
import { usePurchaseEdit } from "./state";

// an edit's payment stage. Credit: the due stage (the bill, what was paid, what we'll owe after, the credit period).
// Cash with the bill up: the purchase form's card: what's left with arrows to the breakup, To pay (typed, never more
// than cash and the banks hold together), Left to pay with Auto, the cards. Cash with the bill down: To receive (typed,
// never more than the cut; the rest comes off what we owe), Left to receive and a card for each place it comes into
export function PaymentStage() {
  const e = usePurchaseEdit();
  const tr = useTranslations("transactions.receipt.form");
  const payCards = usePaidCards();
  const backCards = useBackCards();
  // typed past what cash and the banks hold: cut to it, and it says so (until typed again)
  const [cut, setCut] = useState(false);

  if (e.credit)
    return (
      <DueStage
        bill={e.total}
        oldDue={e.oldDue}
        paid={e.paid > 0 ? { label: e.te("alreadyPaid"), amount: e.paid } : null}
        due={e.owedAfter}
        after={e.advanceAfter > 0 && <Figure label={e.ts("advanceLeft")} amount={rupees(e.advanceAfter)} />}
        days={e.creditDays}
        setDays={e.setCreditDays}
        tried={e.tried}
      />
    );

  if (e.takingBack)
    return (
      <SharedStage
        idPrefix="purchase-edit"
        breakup={null}
        breakupLabel={e.ts("breakup")}
        amount={e.moving}
        placed={e.splitTotal}
        leftLabel={e.te("leftToReceive")}
        nothingLeftLabel={tr("nothingLeft")}
        cards={backCards}
        // To receive: typed, never more than the cut
        amountBox={
          <TypedBanner
            id="received-field"
            label={e.te("toReceive")}
            value={e.paidText}
            onChange={e.typePaid}
            max={e.cut}
            invalid={e.tried && e.moving === 0}
            required
          />
        }
      />
    );

  const amountBad = e.tried && e.payNow === 0 && e.setOff === 0;
  // what's left of the advance: what wasn't set off, and what's paid past all that's due
  const advanceLeft = Math.round((e.heldAdvance - e.setOff + e.advance) * 100) / 100;
  const left: LeftItem[] =
    e.dueLeft > 0 && advanceLeft > 0
      ? [
          { key: "advance", label: e.tpf("advanceLeft"), amount: advanceLeft },
          { key: "due", label: e.tpf("leftDue"), amount: e.dueLeft },
        ]
      : e.dueLeft > 0
        ? [{ key: "due", label: e.tpf("leftDue"), amount: e.dueLeft }]
        : advanceLeft > 0 || (e.heldAdvance > 0 && e.oldDue === 0)
          ? [{ key: "advance", label: e.tpf("advanceLeft"), amount: advanceLeft }]
          : [{ key: "due", label: e.tpf("leftDue"), amount: 0 }];
  // on the left: Due left always, ₹0 too (with an advance left, under it)
  const leftSide = left.some((l) => l.key === "due") ? left : [...left, { key: "due", label: e.tpf("leftDue"), amount: 0 }];

  return (
    <SharedStage
      idPrefix="purchase-edit"
      breakupLabel={e.t("breakup")}
      leftSide={leftSide}
      // To pay: never more than cash and the banks hold together, typing past it is cut there with a warning
      amountBox={
        <>
          <TypedBanner
            id="paid-field"
            label={e.t("toPayAmount")}
            value={e.paidText}
            onChange={(v) => {
              setCut(false);
              e.typePaid(v);
            }}
            max={e.payCap ?? undefined}
            onCapped={() => setCut(true)}
            invalid={amountBad}
            required={e.setOff === 0}
          />
          {cut && e.payCap !== null && (
            <Line
              value={
                <FieldMessage tone="warning" className="mt-0">
                  {e.tpf("capOnly", { amount: rupees(e.payCap) })}
                </FieldMessage>
              }
            />
          )}
        </>
      }
      amount={e.payNow}
      placed={e.splitTotal}
      leftLabel={e.tpf("leftToPay")}
      nothingLeftLabel={e.tpf("nothingLeft")}
      // Auto beside Left to pay: the word over its switch (it fills the cards from what each holds)
      leftSlot={<AutoSwitch stacked on={e.splitAuto} set={e.setSplitAuto} />}
      cards={payCards}
      breakup={{
        heldAdvance: e.heldAdvance,
        advanceLabel: e.tpf("advancePart"),
        oldDue: e.oldDue,
        oldDueLabel: e.t("oldDue"),
        // this bill: what's left of it after what was paid towards it
        bill: e.billLeft,
        billLabel: e.te("billLeft"),
        subTotalLabel: e.t("subTotal"),
        setOff: { on: e.setOffOn, flip: e.setSetOffOn, amount: e.setOff, label: e.ts("setOff") },
        due: e.dueNow,
        dueLabel: e.tpf("due"),
        pay: { label: e.tpf("payGroup"), toggleLabel: e.tpf("towardsGroup"), amount: e.payNow, whole: e.payNow, towardsOld: e.towardsOld, towardsBill: e.towardsBill, paidLabel: e.tpf("paidShare") },
        left,
      }}
    />
  );
}

// the cards with a payment's words and parts (every field a row), as a purchase's: capped at what each place holds,
// Auto, the supplier's QR in each card paying by UPI (their UPI ID asked once when none is kept)
function usePaidCards(): AccountCardsApi {
  const e = usePurchaseEdit();
  return {
    value: e.payNow,
    places: e.places,
    setText: e.setSplitText,
    setMode: e.setBankMode,
    tried: e.tried,
    capAtHeld: true,
    meterOutside: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    auto: { on: e.splitAuto, set: e.setSplitAuto },
    qrItems: e.qrItems,
    qrIdLabel: e.tpf("supplierUpi"),
    qrId: () => ({ hideId: e.upiId.editing, onEdit: () => e.upiId.setEditing(true) }),
    upiPart: (place) =>
      place.id === e.places.find((x) => x.amount > 0 && x.mode === "upi")?.id ? (
        <UpiIdField row show={e.asksUpi && !e.upiKept} label={e.tpf("supplierUpi")} state={e.upiId} />
      ) : null,
    refs: e.refs,
    setRefs: e.setRefs,
    refLeft: e.refLeft,
    setRefLeft: e.setRefLeft,
    labels: {
      breakdown: e.tpf("breakdown"),
      account: e.tpf("account"),
      balance: e.tpf("balance"),
      accountAmount: e.tc("q.amount"),
      anotherAccount: e.tpf("anotherAccount"),
      removeAccount: e.tc("removeAccount"),
      mode: e.tpf("paidBy"),
      modeMissing: e.tpf("pickMode"),
      barLeft: e.tpf("leftToPay"),
      barDone: e.tpf("nothingLeft"),
      capLeft: (amount) => e.tpf("capLeft", { amount }),
      capOnly: (amount) => e.tpf("capOnly", { amount }),
    },
  };
}

// the cards for money coming back, as a receipt's (no cap, balances hidden), how each account received it
function useBackCards(): AccountCardsApi {
  const e = usePurchaseEdit();
  const tr = useTranslations("transactions.receipt.form");
  return {
    value: e.moving,
    places: e.places,
    setText: e.setSplitText,
    setMode: e.setBankMode,
    tried: e.tried,
    capAtHeld: false,
    hideHeld: true,
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
      breakdown: e.tpf("breakdown"),
      account: e.tpf("account"),
      accountAmount: tr("accountAmount"),
      anotherAccount: e.tpf("anotherAccount"),
      removeAccount: e.tc("removeAccount"),
      mode: tr("receivedBy"),
      modeMissing: tr("pickMode"),
      barLeft: e.te("leftToReceive"),
      barDone: tr("nothingLeft"),
      capLeft: (amount) => tr("capLeft", { amount }),
      capOnly: (amount) => tr("capLeft", { amount }),
    },
  };
}
