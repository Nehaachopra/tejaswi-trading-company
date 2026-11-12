"use client";

import { Note } from "~/components/ui/note";

import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { OurUpiPart, useOurUpiKept } from "./our-upi";
import { useReceiptEntry } from "./state";

// where it came into, once there's an amount: a card for each place it came into (cash, a bank account), picked in
// the card itself, then its amount, how it came in, our QR for UPI and its reference. Nothing is picked above the
// cards: all in cash, all into the bank or both is whatever the cards say. A bank's loan comes into a bank only
export function ReceivedInto() {
  const { t, into, bankLoan } = useReceiptEntry();
  const cardsApi = useReceiptCards();
  const usesBank = into === "bank" || into === "both";
  if (!usesBank) return null;
  return (
    // a faint line sets the cards apart from the amount and its breakup above; keyed by the place, so a new one starts
    // with fresh cards
    <div className="flex flex-col gap-2.5 border-t border-chestnut/15 pt-4">
      {bankLoan && <Note className="text-chestnut/70">{t("bankOnly")}</Note>}
      <AccountCards key={into} api={cardsApi} />
    </div>
  );
}

// the bank cards with a receipt's words and parts, laid out as a payment's (every field a row): no cap at what a place
// holds (money comes in), no Auto, our UPI ID
function useReceiptCards(): AccountCardsApi {
  const e = useReceiptEntry();
  const { t, tc, tpf } = e;
  const kept = useOurUpiKept();
  return {
    value: e.value,
    places: e.gridPlaces,
    setText: e.setGridText,
    setMode: e.setGridMode,
    tried: e.tried,
    capAtHeld: false,
    noBar: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    qrItems: e.qrItems,
    qrIdLabel: t("upiId"),
    // a UPI ID typed here shows above its QR once kept, with a pen; one saved on the account shows without one
    qrId: (id) => {
      const saved = (e.banks?.find((b) => b.id === id)?.upiIds.length ?? 0) > 0;
      return saved
        ? { hideId: false }
        : { hideId: !kept(id), onEdit: () => e.setOurUpiEditing(id) };
    },
    upiPart: (place) => <OurUpiPart accountId={place.id} />,
    refs: e.refs,
    setRefs: e.setRefs,
    refLeft: e.refLeft,
    setRefLeft: e.setRefLeft,
    labels: {
      breakdown: tpf("breakdown"),
      account: tpf("account"),
      balance: tpf("balance"),
      accountAmount: t("accountAmount"),
      anotherAccount: tpf("anotherAccount"),
      removeAccount: tc("removeAccount"),
      mode: t("receivedBy"),
      modeMissing: t("pickMode"),
      barTotal: t("barTotal"),
      barGivenLabel: t("barInLabel"),
      capLeft: (amount) => t("capLeft", { amount }),
      capOnly: (amount) => t("capLeft", { amount }),
    },
  };
}
