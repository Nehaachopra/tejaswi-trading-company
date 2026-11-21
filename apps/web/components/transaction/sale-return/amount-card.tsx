"use client";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { useReturnEntry } from "./state";

// a row of the amount: its name on the left, its figure on the right
const row = "flex min-w-0 items-center justify-between gap-3";
const figure = "tabular flex items-baseline justify-between gap-3 text-sm";

// the Amount card: the bill as it stands, the items coming back taken off it, then the new bill in the chestnut box (the
// discount and the charges stay inside both, unchanged); then what was paid towards it taken off, and what's left:
// To pay (paid over: paid back, or carried to the exchange) or To receive (still owed). Half the card wide on a wider
// screen
export function AmountCard() {
  const { t, sale, total, billAfter, balance } = useReturnEntry();
  return (
    <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
      <div className={figure}>
        <span className="min-w-0">{t("bill")}</span>
        <span className="shrink-0 whitespace-nowrap text-base font-semibold">{rupees(sale.billNow)}</span>
      </div>
      <div className={figure}>
        <span className="min-w-0">{t("lessItemsReturned")}</span>
        <span className="shrink-0 whitespace-nowrap text-base font-semibold">− {rupees(total)}</span>
      </div>
      {/* the new bill, under a line, in the To receive row's fixed look */}
      <div className={cn(row, "mt-1 border-t border-chestnut/30 pt-2.5")}>
        <span className="min-w-0 text-sm font-semibold">{t("newBill")}</span>
        <span className="tabular flex min-h-14 w-[60%] shrink-0 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
          {rupees(billAfter)}
        </span>
      </div>
      <div className={figure}>
        <span className="min-w-0">{t("lessAmountPaid")}</span>
        <span className="shrink-0 whitespace-nowrap text-base font-semibold">− {rupees(sale.paid)}</span>
      </div>
      {/* what's left either way: paid over is ours To pay, still owed is ours To receive */}
      <div className={cn(figure, "border-t border-chestnut/30 pt-2.5")}>
        <span className="min-w-0 font-bold">{balance < 0 ? t("toPay") : balance > 0 ? t("toReceive") : t("toPay")}</span>
        <span className="shrink-0 whitespace-nowrap font-heading text-lg font-bold">{rupees(Math.abs(balance))}</span>
      </div>
    </div>
  );
}
