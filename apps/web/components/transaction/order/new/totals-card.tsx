"use client";

import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { useOrderEntry } from "./state";

// a row: the label on the left, its figure in bold on the right
const row = "flex items-center justify-between gap-3";
const figure = "shrink-0 whitespace-nowrap text-base font-semibold";

// the Amount card: the items' price before GST, the discount (typed, never more than that price), the GST, and the
// price after GST
export function TotalsCard() {
  const { t, itemsValue, discount, setDiscount, gstValue, total } = useOrderEntry();

  // the discount, cut at the items' price while typing
  const typeDiscount = (v: string) => setDiscount(Number(v) > itemsValue ? String(itemsValue) : v);

  return (
    // on a wider screen the breakup sits in the left half, as a payment's amount does; a phone takes the full width
    <div className="tabular flex min-w-0 flex-col gap-3 text-sm font-normal sm:w-[calc(50%-1.5rem)]">
      <div className={row}>
        <span className="min-w-0">{t("totals.items")}</span>
        <span className={figure}>{rupees(itemsValue)}</span>
      </div>

      {/* the discount: a ₹ box */}
      <label className={row}>
        <span className="min-w-0">{t("totals.discount")}</span>
        <span className="flex min-h-11 w-32 shrink-0 items-center gap-[3px] rounded-control px-3 shadow-[0_0_5px_0] shadow-chestnut/40 transition-shadow focus-within:shadow-chestnut/80">
          <span className="text-base text-chestnut/60">₹</span>
          <NumberInput
            value={discount}
            decimals={2}
            maxDigits={8}
            onChange={typeDiscount}
            placeholder="0"
            className="tabular w-full min-w-0 flex-1 bg-transparent text-right text-base font-bold outline-none placeholder:text-chestnut/40"
          />
        </span>
      </label>

      <div className={row}>
        <span className="min-w-0">{t("totals.gst")}</span>
        <span className={figure}>{rupees(gstValue)}</span>
      </div>

      {/* the price after GST: a line above, as under a sum; bold and larger */}
      <div className={cn(row, "border-t border-chestnut/30 pt-3")}>
        <span className="min-w-0 font-bold">{t("totals.total")}</span>
        <span className="shrink-0 whitespace-nowrap font-heading text-xl font-bold">{rupees(total)}</span>
      </div>
    </div>
  );
}
