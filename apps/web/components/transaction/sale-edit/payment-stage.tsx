"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { FixedBanner, TypedBanner } from "../shared/amount-banner";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { Figure, type LeftItem, PaymentStage as SharedStage } from "../shared/payment-stage";
import { OriginalReceived } from "./original-received";
import { useSaleEdit } from "./state";

// an edit's payment stage, on the shared one, as a sale's: what's left with arrows to the breakup, then To receive
// (cash: typed for a customer, fixed for a walk-in; Refund now when the bill went down; credit: none), Remaining and the
// cards. The breakup: the old due (a customer's), this bill, the due, Original sale received (its ⌄ opening where it
// came in), then what's received now or refunded, and Due left (with an advance left on credit)
export function PaymentStage() {
  const e = useSaleEdit();
  const { t, credit, refunding, walkIn, editPaid, editLeft, received, total, tried } = e;
  const tr = useTranslations("transactions.receipt.form");
  const [originalOpen, setOriginalOpen] = useState(false);
  const saleCards = useEditCards();
  // a refund goes out of the cards: how it was paid, what's left to refund
  const cards: AccountCardsApi = refunding ? { ...saleCards, labels: { ...saleCards.labels, mode: t("edit.paidBy"), barLeft: t("edit.leftToRefund") } } : saleCards;

  // what's left: Due left, and on credit an advance left when the bill went below what was paid
  const left: LeftItem[] =
    credit && e.editAdvanceLeft > 0
      ? [
          { key: "advance", label: t("advanceLeft"), amount: e.editAdvanceLeft },
          { key: "due", label: t("leftDue"), amount: editLeft },
        ]
      : [{ key: "due", label: t("leftDue"), amount: editLeft }];

  return (
    <SharedStage
      idPrefix="sale-edit"
      breakupLabel={t("breakup")}
      amount={received}
      placed={e.gridTotal}
      leftLabel={t("edit.remaining")}
      nothingLeftLabel={tr("nothingLeft")}
      cards={cards}
      leftSide={left}
      // To receive: fixed (a refund, a walk-in) or typed (a customer's, no more than the bill still has owed); none on credit
      amountBox={
        credit ? null : refunding || walkIn ? (
          <FixedBanner label={refunding ? t("edit.refundNow") : t("toReceiveOnly")} amount={received} />
        ) : (
          <TypedBanner
            id="received-field"
            label={t("toReceiveOnly")}
            value={e.receivedText}
            onChange={e.typeReceived}
            max={e.editDueLeft}
            invalid={tried && received === 0}
          />
        )
      }
      breakup={{
        heldAdvance: 0,
        advanceLabel: tr("advancePart"),
        // (a walk-in has no account, so no old due)
        oldDue: e.hasAccount ? e.oldDue : null,
        oldDueLabel: t("oldDue"),
        bill: total,
        billLabel: t("thisBill"),
        subTotalLabel: t("subTotal"),
        setOff: { on: false, flip: () => {}, amount: 0, label: t("setOff") },
        due: e.dueNow,
        dueLabel: tr("due"),
        // what the original sale received taken off, its ⌄ opening where it came in; then what's received now taken
        // off, or what's refunded added back
        beforePay: (
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
                      <ChevronDown className={cn("size-4 transition-transform", originalOpen && "rotate-180")} aria-hidden />
                    </button>
                  )}
                </>
              }
              amount={`− ${rupees(editPaid)}`}
            />
            {originalOpen && editPaid > 0 && <OriginalReceived />}
            {/* (credit takes nothing now) */}
            {!credit && (
              <Figure label={refunding ? t("edit.refundNow") : t("edit.received")} amount={refunding ? `+ ${rupees(received)}` : `− ${rupees(received)}`} />
            )}
          </>
        ),
        pay: null,
        left,
      }}
    />
  );
}

// the bank cards as a sale's: no cap at what a place holds, no balances shown, no Auto; Remaining and its slider sit
// above them. An account by UPI with no UPI ID of ours says to add one
function useEditCards(): AccountCardsApi {
  const e = useSaleEdit();
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
    upiPart: (place) => (e.upiIdsOf(place.id).length > 0 ? null : <FieldMessage className="mt-0 ml-auto w-[62%]">{e.t("noUpi")}</FieldMessage>),
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
