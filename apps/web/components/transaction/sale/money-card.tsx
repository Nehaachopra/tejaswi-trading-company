"use client";

import { useTranslations } from "next-intl";

import { FieldMessage } from "~/components/ui/field-message";

import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { chip } from "../shared/form-basics";
import { useSaleEntry } from "./state";

// Cash or credit: two chips. Credit moves straight on to the customer; Cash brings the receipt's Received into cards
// under a line: a card for each place it came into (cash or a bank account), its amount, how it came in, our QR for UPI
// and its reference, under the bar of what's left to receive
export function MoneyCard() {
  const { t, kind, pickKind } = useSaleEntry();
  const api = useSaleCards();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("steps.money")}>
        {(["cash", "credit"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => pickKind(k)} className={chip(kind === k)}>
            {t(`kinds.${k}`)}
          </button>
        ))}
      </div>
      {kind === "cash" && (
        <div className="flex flex-col gap-2.5 border-t border-chestnut/15 pt-4">
          <AccountCards api={api} />
        </div>
      )}
    </div>
  );
}

// the bank cards with a receipt's words and parts, laid out as a payment's (every field a row): no cap at what a place
// holds and no balances shown (money comes in), no Auto. An account by UPI with no UPI ID of ours says to add one
function useSaleCards(): AccountCardsApi {
  const e = useSaleEntry();
  const t = useTranslations("transactions.receipt.form");
  const tpf = useTranslations("transactions.payment.form");
  const tc = useTranslations("transactions.chat");
  return {
    value: e.total,
    places: e.gridPlaces,
    setText: e.setGridText,
    setMode: e.setGridMode,
    tried: e.tried,
    capAtHeld: false,
    hideHeld: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    qrItems: e.qrItems,
    qrIdLabel: t("upiId"),
    qrId: () => ({ hideId: false }),
    upiPart: (place) =>
      e.upiIdsOf(place.id).length > 0 ? null : <FieldMessage className="mt-0 ml-auto w-[62%]">{e.t("noUpi")}</FieldMessage>,
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
