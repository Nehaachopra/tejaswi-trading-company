"use client";

import { useTranslations } from "next-intl";

import { rupees } from "~/lib/format";

import { type AccountCardsApi } from "../shared/account-cards/types";
import { FixedBanner } from "../shared/amount-banner";
import { DueStage } from "../shared/due-stage";
import { Figure, PaymentStage as SharedStage } from "../shared/payment-stage";
import { useReturnEntry } from "./state";

// a purchase return's payment stage. In cash, on the shared one as money coming in (the supplier pays it back): To
// receive (the refund, fixed), Left to receive with its slider, and a card for each place it comes into, no cap. On
// credit: the due stage, what we owe the supplier less the refund (an advance with them when it's more)
export function PaymentStage() {
  const e = useReturnEntry();
  const tr = useTranslations("transactions.receipt.form");
  const ts = useTranslations("transactions.sale");
  const cards = useRefundCards();

  if (!e.cashRefund)
    return (
      <DueStage
        bill={null}
        oldDue={e.oldDue}
        // (the whole return: replaced items' part stays on their account too)
        paid={{ label: e.t("returnTotal"), amount: e.total }}
        due={e.owedAfter}
        after={e.advanceAfter > 0 && <Figure label={ts("advanceLeft")} amount={rupees(e.advanceAfter)} />}
        tried={e.tried}
      />
    );

  return (
    <SharedStage
      idPrefix="purchase-return"
      breakup={null}
      breakupLabel={ts("breakup")}
      amount={e.payBack}
      placed={e.splitTotal}
      leftLabel={e.t("leftToReceive")}
      nothingLeftLabel={tr("nothingLeft")}
      cards={cards}
      amountBox={<FixedBanner label={e.t("toReceive")} amount={e.payBack} />}
    />
  );
}

// the bank cards as a receipt's (money comes in): no cap at what a place holds and no balances shown, how each
// received it and its reference; Left to receive and its slider sit above them
function useRefundCards(): AccountCardsApi {
  const e = useReturnEntry();
  const tr = useTranslations("transactions.receipt.form");
  const tpf = useTranslations("transactions.payment.form");
  return {
    value: e.payBack,
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
      breakdown: tpf("breakdown"),
      account: tpf("account"),
      accountAmount: tr("accountAmount"),
      anotherAccount: tpf("anotherAccount"),
      removeAccount: e.tc("removeAccount"),
      mode: tr("receivedBy"),
      modeMissing: tr("pickMode"),
      barLeft: e.t("leftToReceive"),
      barDone: tr("nothingLeft"),
      capLeft: (amount) => tr("capLeft", { amount }),
      capOnly: (amount) => tr("capLeft", { amount }),
    },
  };
}
