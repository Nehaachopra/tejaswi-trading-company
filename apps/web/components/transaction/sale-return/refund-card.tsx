"use client";

import { useTranslations } from "next-intl";

import { Switch } from "~/components/ui/switch";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { FixedBanner } from "../shared/amount-banner";
import { useReturnEntry } from "./state";

// a figure that isn't typed: its name on the left, the figure on the right; `strong` closes a part with a line above
function Figure({ label, amount, strong = false }: { label: string; amount: string; strong?: boolean }) {
  return (
    <div className={cn("tabular flex items-center justify-between gap-3 text-sm", strong && "border-t border-chestnut/30 pt-2 font-semibold")}>
      <span className="min-w-0">{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap text-base font-semibold", strong && "font-bold")}>{amount}</span>
    </div>
  );
}

// the Refund card. A customer's, as the sale's account breakup: what they owe (or hold as advance), the return taken
// off, then Due left / Advance left; when the return is more than they owe, "Pay back now" pays that part back from
// cash and banks. A walk-in: To pay back (the whole total), then where it's paid from. The places never go past what
// each holds
export function RefundCard() {
  const { t, customer, owed, total, after, over, payBackOn, setPayBackOn, payBack } = useReturnEntry();
  const cards = useRefundCards();
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:w-[calc(50%-1.5rem)]">
      {customer ? (
        <>
          <Figure label={owed < 0 ? t("advance") : t("due")} amount={rupees(Math.abs(owed))} />
          <Figure label={t("return")} amount={`− ${rupees(total)}`} />
          {payBack > 0 && <Figure label={t("paidBack")} amount={`+ ${rupees(payBack)}`} />}
          <Figure strong label={after + payBack < 0 ? t("advanceLeft") : t("dueLeft")} amount={rupees(Math.abs(after + payBack))} />
          {/* only what's over what they owe can be paid back now */}
          {over > 0 && (
            <div className="mt-2 flex min-h-11 items-center justify-between gap-3">
              <span id="pay-back" className="text-sm font-semibold">
                {t("payBackNow", { amount: rupees(over) })}
              </span>
              <Switch on={payBackOn} onFlip={() => setPayBackOn((on) => !on)} labelledBy="pay-back" />
            </div>
          )}
        </>
      ) : (
        <FixedBanner label={t("toPayBack")} amount={total} />
      )}
      {payBack > 0 && (
        <div className="mt-2">
          <AccountCards key={payBack} api={cards} />
        </div>
      )}
    </div>
  );
}

// the cards with a payment's words (every field a row): capped at what each place holds, no QR
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
      barLeft: tpf("leftToPay"),
      barDone: tpf("nothingLeft"),
      capLeft: (amount) => tpf("capLeft", { amount }),
      capOnly: (amount) => tpf("capOnly", { amount }),
    },
  };
}
