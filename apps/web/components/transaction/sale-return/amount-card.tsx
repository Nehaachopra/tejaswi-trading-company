"use client";

import { IndianRupee } from "lucide-react";
import { useTranslations } from "next-intl";

import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { input } from "../shared/form-basics";
import { useReturnEntry } from "./state";

// a row of the amount, as the sale's: its name on the left, its box on the right
const row = "flex min-w-0 items-center justify-between gap-3";
// the amount's box: large and bold, ₹ inside on the left
const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular text-right";
const figure = "tabular flex items-baseline justify-between gap-3 text-sm";

// the Amount card, as the sale's (an edit's): the bill as if what comes back had never been sold. The items, then the
// cash discount and the transport, packing and loading charges in their boxes as the sale had them (a return never
// changes them), the round off, Total in the chestnut box; then what was paid towards the bill (taken off) and the
// balance left (paid over shows with a minus: that's paid back, or carried to the exchange). Half the card wide on a
// wider screen
export function AmountCard() {
  const { sale, figures, billAfter, balance } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const fields = [
    { key: "discount", label: ts("discount"), value: sale.discount },
    { key: "transport", label: ts("transport"), value: sale.transportCharges },
    { key: "packing", label: ts("packing"), value: sale.packingCharges },
    { key: "loading", label: ts("loadingCharges"), value: sale.loadingCharges },
  ];
  const roundOff = figures.after.roundOff / 100;
  return (
    <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
      {/* the items still sold, as the sale's: room under it */}
      <div className={cn(figure, "mb-2")}>
        <span className="min-w-0">{ts("items")}</span>
        <span className="shrink-0 whitespace-nowrap text-base font-semibold">{rupees(figures.after.itemsTotal / 100)}</span>
      </div>
      {/* the discount and the charges, in their boxes, as the sale had them */}
      {fields.map((f) => (
        <div key={f.key} className={row}>
          <label htmlFor={`return-${f.key}`} className="min-w-0 text-sm">
            {f.label}
          </label>
          <span className="relative block w-[60%] shrink-0">
            <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2" aria-hidden />
            <NumberInput id={`return-${f.key}`} value={f.value > 0 ? String(f.value) : ""} decimals={2} placeholder="0" readOnly onChange={() => undefined} className={cn(input(false), amountBox)} />
          </span>
        </div>
      ))}
      {/* the total is rounded to the rupee: what that adds or takes off */}
      {roundOff !== 0 && (
        <div className={figure}>
          <span className="min-w-0">{ts("roundOff")}</span>
          <span className="shrink-0 whitespace-nowrap font-semibold">{roundOff > 0 ? `+ ${rupees(roundOff)}` : `− ${rupees(-roundOff)}`}</span>
        </div>
      )}
      {/* the Total, under a line, in the To receive row's fixed look */}
      <div className={cn(row, "mt-1 border-t border-chestnut/30 pt-2.5")}>
        <span className="min-w-0 text-sm font-semibold">{ts("edit.total")}</span>
        <span className="tabular flex min-h-14 w-[60%] shrink-0 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
          {rupees(billAfter)}
        </span>
      </div>
      {/* what was paid towards the bill (taken off), and the balance left either way */}
      <div className={figure}>
        <span className="min-w-0">{ts("edit.amountPaid")}</span>
        <span className="shrink-0 whitespace-nowrap text-base font-semibold">− {rupees(sale.paid)}</span>
      </div>
      <div className={cn(figure, "border-t border-chestnut/30 pt-2.5")}>
        <span className="min-w-0 font-bold">{ts("edit.balanceLeft")}</span>
        <span className="shrink-0 whitespace-nowrap font-heading text-lg font-bold">{balance < 0 ? `− ${rupees(-balance)}` : rupees(balance)}</span>
      </div>
    </div>
  );
}
