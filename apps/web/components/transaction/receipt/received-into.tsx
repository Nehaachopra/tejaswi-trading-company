"use client";

import { Note } from "~/components/ui/note";
import { rupees } from "~/lib/format";

import { type Place, PlacePicker } from "../shared/place-picker";
import { OurUpiNeeded } from "./bank-cards";
import { ShowQrButton, SplitGrid } from "../shared/split-grid";
import { useReceiptEntry } from "./state";

// where it came into: Cash, Bank or Cash + Bank as an accordion with the bank accounts' look, each with what it holds
// (the admin only), collapsed to the pick; then one panel with
// a row for each part in use, its amount on the right. Cash + Bank types either part and the other follows; the bank's
// account cards wait for its part. A bank's loan comes into a bank only, so Cash and Cash + Bank are muted for it
export function ReceivedInto() {
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
    tried,
    cashHeld,
    banksHeld,
    canBank,
    bankLoan,
    gridPlaces,
    setGridText,
    setGridMode,
    qrItems,
    qrItem,
    setQrPick,
  } = useReceiptEntry();
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
  return (
    <>
      {/* an accordion with the bank accounts' look: all three until one is picked, then only the pick */}
      <PlacePicker
        label={t("steps.into")}
        places={places}
        value={into}
        invalid={tried && into === null}
        onPick={(id) => {
          setBankId(null);
          setCashPart("");
          if (id === "cash") {
            setInto("cash");
            setBankMode(null);
          } else {
            setInto(id);
            // the bank alone: its accounts' list opens by itself
            if (id === "bank") setAccountsOpen((n) => n + 1);
          }
        }}
      />
      {bankLoan && <Note className="text-chestnut/70">{t("bankOnly")}</Note>}

      {/* Bank, or Cash + Bank: a box each, what came into it typed; an account by UPI with none of ours asks for one */}
      {usesBank && (
        <SplitGrid
          places={gridPlaces}
          onText={setGridText}
          onMode={setGridMode}
          capAtHeld={false}
          modeLabel={t("receivedBy")}
          modeMissing={t("pickMode")}
          tried={tried}
          extra={(p) => (
            <>
              {p.id !== "cash" && <OurUpiNeeded bankId={p.id} mode={p.mode} />}
              {qrItems.length > 1 && qrItems.some((q) => q.key === p.id) && (
                <ShowQrButton shown={qrItem?.key === p.id} onShow={() => setQrPick(p.id)} />
              )}
            </>
          )}
        />
      )}
    </>
  );
}
