"use client";

import { FieldMessage } from "~/components/ui/field-message";
import { Reveal } from "~/components/ui/reveal";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { usePaymentEntry } from "./state";
import { FailNote } from "./notes";
import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { UpiField } from "./bank-cards";

// where it's paid from, once there's an amount: a card for each place it leaves (cash, a bank account), picked in the
// card itself with what each holds (the admin only), then its amount, how it was paid, the party's QR for UPI and its
// reference. Nothing is picked above the cards: all in cash, all from the bank or both is whatever the cards say. The
// cash-limit warning closes it
export function PaidFrom() {
  const { t, into, cashLimit, cashTodayFailed, retryCashToday, cashThatDay, overCashLimit } =
    usePaymentEntry();
  const cardsApi = usePaymentCards();
  return (
    <>
      {/* a card per place, Auto or not */}
      {/* keyed by the amount: another amount starts with a fresh card */}
      {into !== null && (
        // a faint line sets the cards apart from the amount and its breakup above
        <div className="border-t border-chestnut/15 pt-4">
          <AccountCards key={cardsApi.value} api={cardsApi} />
        </div>
      )}

      {/* the cash-limit warning, when there is one */}
      <Reveal follow show={overCashLimit || cashTodayFailed} gap="0.625rem">
        <div className="overflow-hidden rounded-control text-sm shadow-[0_0_5px_0] shadow-chestnut/25">
          {/* what was paid them in cash today couldn't be had, so the 40A(3) warning can't be checked */}
          <Reveal show={cashTodayFailed} gap="0px">
            <div className={cn("px-3 py-2.5", into !== "cash" && "border-t border-chestnut/15")}>
              {<FailNote text={t("cashTodayFailed")} retry={retryCashToday} />}
            </div>
          </Reveal>
          {/* section 40A(3): a warning only, the payment still saves */}
          <Reveal show={overCashLimit} gap="0px">
            <div className={cn("px-3 py-2.5", into !== "cash" && "border-t border-chestnut/15")}>
              <FieldMessage tone="warning" className="mt-0">
                {t("cashLimit", { amount: rupees(cashThatDay), limit: rupees(cashLimit) })}
              </FieldMessage>
            </div>
          </Reveal>
        </div>
      </Reveal>
    </>
  );
}

// the cards with a payment's words and parts: capped at what each place holds, Auto, no bar, how it was paid as rows,
// the payee's UPI ID box
function usePaymentCards(): AccountCardsApi {
  const e = usePaymentEntry();
  const { t, tc } = e;
  return {
    value: e.value,
    places: e.gridPlaces,
    setText: e.setGridText,
    setMode: e.setGridMode,
    tried: e.tried,
    capAtHeld: true,
    noBar: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    auto: { on: e.gridAuto, set: e.setGridAuto },
    qrItems: e.qrItems,
    qrIdLabel: t(e.upiLabel),
    // the payee's UPI ID above every QR, with a pen; hidden while it's being changed in its box
    qrId: () => ({ hideId: e.upiEditing, onEdit: () => e.setUpiEditing(true) }),
    upiPart: () => <UpiField row />,
    refs: e.refs,
    setRefs: e.setRefs,
    refLeft: e.refLeft,
    setRefLeft: e.setRefLeft,
    labels: {
      breakdown: t("breakdown"),
      account: t("account"),
      balance: t("balance"),
      // a short name, as it sits beside its box
      accountAmount: tc("q.amount"),
      anotherAccount: t("anotherAccount"),
      removeAccount: tc("removeAccount"),
      mode: t("paidBy"),
      modeMissing: t("pickMode"),
      barTotal: t("barTotal"),
      barGivenLabel: t("barPaidLabel"),
      capLeft: (amount) => t("capLeft", { amount }),
      capOnly: (amount) => t("capOnly", { amount }),
    },
  };
}
