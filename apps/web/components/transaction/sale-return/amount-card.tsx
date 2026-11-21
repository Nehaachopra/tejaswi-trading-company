"use client";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { useReturnEntry } from "./state";

// a figure row: its name on the left, the figure on the right
const row = "tabular flex items-baseline justify-between gap-3 text-sm";

// the Amount card, as the sale's: the items coming back (at the price they sold at, GST in it), the cash discount's
// share taken back (− ₹), the round off when there is one, then Total in the chestnut box. Charges are never refunded.
// Half the card wide on a wider screen
export function AmountCard() {
  const { t, figures, total } = useReturnEntry();
  return (
    <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
      <div className={row}>
        <span className="min-w-0">{t("items")}</span>
        <span className="shrink-0 whitespace-nowrap text-base font-semibold">{rupees(figures.itemsTotal / 100)}</span>
      </div>
      {figures.discount > 0 && (
        <div className={row}>
          <span className="min-w-0">{t("discountBack")}</span>
          <span className="shrink-0 whitespace-nowrap font-semibold">− {rupees(figures.discount / 100)}</span>
        </div>
      )}
      {figures.roundOff !== 0 && (
        <div className={row}>
          <span className="min-w-0">{t("roundOff")}</span>
          <span className="shrink-0 whitespace-nowrap font-semibold">
            {figures.roundOff > 0 ? `+ ${rupees(figures.roundOff / 100)}` : `− ${rupees(-figures.roundOff / 100)}`}
          </span>
        </div>
      )}
      {/* the Total, under a line, in the To receive row's fixed look */}
      <div className={cn("flex min-w-0 items-center justify-between gap-3", "mt-1 border-t border-chestnut/30 pt-2.5")}>
        <span className="min-w-0 text-sm font-semibold">{t("total")}</span>
        <span className="tabular flex min-h-14 w-[60%] shrink-0 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
          {rupees(total)}
        </span>
      </div>
    </div>
  );
}
