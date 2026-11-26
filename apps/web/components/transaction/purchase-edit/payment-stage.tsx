"use client";

import { useTranslations } from "next-intl";

import { rupees } from "~/lib/format";

import { type AccountCardsApi } from "../shared/account-cards/types";
import { FixedBanner } from "../shared/amount-banner";
import { DueStage } from "../shared/due-stage";
import { Figure, PaymentStage as SharedStage } from "../shared/payment-stage";
import { usePurchaseEdit } from "./state";

// an edit's payment stage. Cash: on the shared one, a fixed amount and a card for each place it moves through: the bill
// below what was paid, the supplier gives the rest back (To receive, no cap, as a purchase return's refund); the bill
// up, the rise is paid now (To pay, each place never more than it holds). Credit: the due stage, the bill less what was
// paid, what we'll owe them after (an advance with them when it's below nothing) and the credit period (only when it
// is on credit)
export function PaymentStage() {
  const e = usePurchaseEdit();
  const tr = useTranslations("transactions.receipt.form");
  const cards = useMoveCards();

  if (e.credit)
    return (
      <DueStage
        bill={e.total}
        oldDue={e.oldDue}
        paid={e.paid > 0 ? { label: e.te("alreadyPaid"), amount: e.paid } : null}
        due={e.owedAfter}
        after={e.advanceAfter > 0 && <Figure label={e.ts("advanceLeft")} amount={rupees(e.advanceAfter)} />}
        days={e.asksDays ? e.creditDays : undefined}
        setDays={e.asksDays ? e.setCreditDays : undefined}
        tried={e.tried}
      />
    );

  return (
    <SharedStage
      idPrefix="purchase-edit"
      breakup={null}
      breakupLabel={e.ts("breakup")}
      amount={e.moving}
      placed={e.splitTotal}
      leftLabel={e.takingBack ? e.te("leftToReceive") : e.tpf("leftToPay")}
      nothingLeftLabel={e.takingBack ? tr("nothingLeft") : e.tpf("nothingLeft")}
      cards={cards}
      amountBox={<FixedBanner label={e.takingBack ? e.te("toReceive") : e.te("toPay")} amount={e.moving} />}
    />
  );
}

// the cards: money coming back as a receipt's (no cap, balances hidden), money paid out as a payment's (each place
// never more than it holds, balances shown); how each account moved it and its reference
function useMoveCards(): AccountCardsApi {
  const e = usePurchaseEdit();
  const tr = useTranslations("transactions.receipt.form");
  const back = e.takingBack;
  return {
    value: e.moving,
    places: e.places,
    setText: e.setSplitText,
    setMode: e.setBankMode,
    tried: e.tried,
    capAtHeld: !back,
    hideHeld: back,
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
      balance: e.tpf("balance"),
      accountAmount: back ? tr("accountAmount") : e.tc("q.amount"),
      anotherAccount: e.tpf("anotherAccount"),
      removeAccount: e.tc("removeAccount"),
      mode: back ? tr("receivedBy") : e.tpf("paidBy"),
      modeMissing: back ? tr("pickMode") : e.tpf("pickMode"),
      barLeft: back ? e.te("leftToReceive") : e.tpf("leftToPay"),
      barDone: back ? tr("nothingLeft") : e.tpf("nothingLeft"),
      capLeft: (amount) => (back ? tr("capLeft", { amount }) : e.tpf("capLeft", { amount })),
      capOnly: (amount) => (back ? tr("capLeft", { amount }) : e.tpf("capOnly", { amount })),
    },
  };
}
