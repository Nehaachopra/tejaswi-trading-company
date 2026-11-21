"use client";

import { useTranslations } from "next-intl";

import { rupees } from "~/lib/format";

import { type AccountCardsApi } from "../shared/account-cards/types";
import { FixedBanner } from "../shared/amount-banner";
import { DueStage } from "../shared/due-stage";
import { Figure, PaymentStage as SharedStage } from "../shared/payment-stage";
import { useReturnEntry } from "./state";

// a refund's payment stage. In cash (a walk-in's always), on the shared one as money going out: To refund (the
// return's total, fixed), Left to refund with its slider, and a card for each place it's paid back from, none past
// what it holds. On credit (a customer's): the due stage, what they owe less the return
export function PaymentStage() {
  const e = useReturnEntry();
  const tr = useTranslations("transactions.receipt.form");
  const ts = useTranslations("transactions.sale");
  const cards = useRefundCards();

  // on credit: the due stage, as a credit sale's: what they owe, the return taken off, the due (and an advance when
  // the return is more than they owe); no credit period
  if (!e.cashRefund)
    return (
      <DueStage
        bill={null}
        oldDue={e.oldDue}
        paid={{ label: e.t("returnTotal"), amount: e.total }}
        due={e.owedAfter}
        after={e.advanceAfter > 0 && <Figure label={ts("advanceLeft")} amount={rupees(e.advanceAfter)} />}
        tried={e.tried}
      />
    );

  return (
    <SharedStage
      idPrefix="sale-return"
      breakup={null}
      breakupLabel={ts("breakup")}
      amount={e.payBack}
      placed={e.splitTotal}
      leftLabel={e.t("leftToRefund")}
      nothingLeftLabel={tr("nothingLeft")}
      cards={cards}
      amountBox={<FixedBanner label={e.t("toRefund")} amount={e.payBack} />}
    />
  );
}

// the bank cards as a payment's (money goes out): each place never past what it holds, how each paid it back and its
// reference; Left to refund and its slider sit above them
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
