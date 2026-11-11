"use client";

import { Note } from "~/components/ui/note";
import { rupees } from "~/lib/format";

import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { type Place, PlacePicker } from "../shared/place-picker";
import { OurUpiPart, useOurUpiKept } from "./our-upi";
import { useReceiptEntry } from "./state";

// where it came into: Cash, Bank or Cash + Bank as an accordion with the bank accounts' look, each with what it holds
// (the admin only), collapsed to the pick. A bank's loan comes into a bank only, so Cash and Cash + Bank are muted for
// it. `part` "top" is the accordion (beside the amount); "rest" is the bank cards under it, the card's full width
export function ReceivedInto({ part }: { part: "top" | "rest" }) {
  const {
    t,
    tc,
    tpf,
    into,
    setInto,
    setBankId,
    setBankMode,
    setCashPart,
    setAccountsOpen,
    resetGrid,
    tried,
    cashHeld,
    banksHeld,
    canBank,
    bankLoan,
  } = useReceiptEntry();
  const cardsApi = useReceiptCards();
  const places: Place<"cash" | "bank" | "both">[] = [
    {
      id: "cash",
      name: tc("cash"),
      hint: cashHeld === null ? undefined : rupees(cashHeld),
      disabled: !!bankLoan,
    },
    {
      id: "bank",
      name: tpf("bankPlace"),
      hint: banksHeld === null ? undefined : rupees(banksHeld),
      disabled: !canBank,
    },
    {
      id: "both",
      name: tpf("cashAndBank"),
      hint: cashHeld === null || banksHeld === null ? undefined : rupees(cashHeld + banksHeld),
      disabled: !canBank || !!bankLoan,
    },
  ];
  const usesBank = into === "bank" || into === "both";
  if (part === "top")
    return (
      <>
        {/* all three until one is picked, then only the pick; another pick starts the breakdown again */}
        <PlacePicker
          label={t("steps.into")}
          places={places}
          value={into}
          invalid={tried && into === null}
          onPick={(id) => {
            resetGrid();
            setBankId(null);
            setCashPart("");
            if (id === "cash") {
              setInto("cash");
              setBankMode(null);
            } else {
              setInto(id);
              if (id === "bank") setAccountsOpen((n) => n + 1);
            }
          }}
        />
        {bankLoan && <Note className="text-chestnut/70">{t("bankOnly")}</Note>}
      </>
    );
  // Bank, or Cash + Bank: a card per place, keyed by the place so a new one starts with fresh cards
  return usesBank ? <AccountCards key={into} api={cardsApi} /> : null;
}

// the bank cards with a receipt's words and parts: no cap at what a place holds (money comes in), no Auto, our UPI ID
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
    qrItems: e.qrItems,
    qrRow: true,
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
