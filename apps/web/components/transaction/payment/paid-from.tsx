"use client";

import { Note } from "~/components/ui/note";
import { Reveal } from "~/components/ui/reveal";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { usePaymentEntry } from "./state";
import { type Place, PlacePicker } from "../shared/place-picker";
import { FailNote } from "./notes";
import { ManualAccounts } from "./manual-account-card";

// where it's paid from: cash, a bank or both, picked from an accordion with the bank accounts' look, each with what
// it holds (the admin only), collapsed to the pick; then one
// panel with a row for each part in use, its amount on the right. The bank's row goes on with how it was paid (two
// by two), the party's QR for UPI, then the account it left. Cash + Bank types either part and the other follows;
// the bank's steps wait for its part. The cash-limit warning closes the panel
export function PaidFrom({ part }: { part: "top" | "rest" }) {
  const {
    t,
    tc,
    into,
    setInto,
    setBankId,
    setBankMode,
    setAccountsOpen,
    tried,
    cashHeld,
    banksHeld,
    canCash,
    canBank,
    cashCovers,
    bankCovers,
    offerBoth,
    pickBoth,
    cashLimit,
    cashTodayFailed,
    retryCashToday,
    cashThatDay,
    overCashLimit,
  } = usePaymentEntry();
  // all three, always, for every kind of payment: one that can't pay it (nothing held, or not enough for this
  // amount) shows muted
  const places: Place<"cash" | "bank" | "both">[] = [
    {
      id: "cash",
      name: tc("cash"),
      hint: cashHeld === null ? undefined : rupees(cashHeld),
      disabled: !(canCash && cashCovers),
    },
    {
      id: "bank",
      name: t("bankPlace"),
      hint: banksHeld === null ? undefined : rupees(banksHeld),
      disabled: !(canBank && bankCovers),
    },
    {
      id: "both",
      name: t("cashAndBank"),
      // all the money there is: cash and every bank account, as Cash and Bank show them
      hint: cashHeld === null || banksHeld === null ? undefined : rupees(cashHeld + banksHeld),
      disabled: !offerBoth,
    },
  ];
  const usesBank = into === "bank" || into === "both";
  // the top: cash, bank or both
  if (part === "top")
    return (
      <>
        {/* cash, bank or both as an accordion with the bank accounts' look: all three with what each holds (the admin
          only) until one is picked, then only the pick; one that can't pay it is muted */}
        <PlacePicker
          label={t("steps.source")}
          places={places}
          value={into}
          invalid={tried && into === null}
          onPick={(id) => {
            setBankId(null);
            if (id === "cash") {
              setInto("cash");
              setBankMode(null);
            } else if (id === "both") pickBoth();
            else {
              setInto("bank");
              setAccountsOpen((n) => n + 1);
            }
          }}
        />
      </>
    );
  // the rest, the card's full width
  return (
    <>
      {/* Bank, or Cash + Bank: a card per place, Auto or not */}
      {usesBank && <ManualAccounts />}

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
              <Note className="text-amber-700">
                {t("cashLimit", { amount: rupees(cashThatDay), limit: rupees(cashLimit) })}
              </Note>
            </div>
          </Reveal>
        </div>
      </Reveal>
    </>
  );
}
