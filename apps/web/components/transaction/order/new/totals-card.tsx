"use client";

import { IndianRupee } from "lucide-react";
import { useTranslations } from "next-intl";

import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { SCROLL_BOX } from "../../shared/cart-button";
import { input } from "../../shared/form-basics";
import { OrderCartCards } from "./cart-button";
import { ProductDetailsCard } from "./product-details-card";
import { useOrderEntry } from "./state";

// a row of the amounts: its name on the left, its figure (or box) on the right
const row = "flex min-w-0 items-center justify-between gap-3";
const plainRow = "tabular flex items-baseline justify-between gap-3 text-sm";
const figure = "shrink-0 whitespace-nowrap text-base font-semibold";
// the discount's box: large and bold, ₹ inside on the left (as a sale's)
const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular text-right";

// the Cart card, as a sale's: on the left (first on a phone) the cart's cards (a tap opens the line card to change one);
// on the right the amounts, with the sale's labels: Items (count), Amount (the cart's total with GST), Discount (a ₹
// box, never more than the items' price before GST, as the server takes it), then the Total in the chestnut box
export function TotalsCard() {
  const { t, lines, itemsValue, linesTotal, discount, setDiscount, roundOff, total } = useOrderEntry();
  const ts = useTranslations("transactions.sale");

  // the discount, cut at the items' price before GST while typing
  const typeDiscount = (v: string) => setDiscount(Number(v) > itemsValue ? String(itemsValue) : v);

  return (
    // the cart on the left (on a phone, first), the amounts on the right
    <div className="grid items-start gap-6 sm:grid-cols-2 sm:gap-12">
      {/* the cart: its cards (nothing yet: a note in their place), and the line card over the page */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className={SCROLL_BOX}>
          {lines.length === 0 ? <p className="py-6 text-center text-sm opacity-70">{t("cartEmpty")}</p> : <OrderCartCards />}
        </div>
        <ProductDetailsCard />
      </div>

      {/* the amounts */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className={plainRow}>
          <span className="min-w-0">{ts("items")}</span>
          <span className={figure}>{lines.length}</span>
        </div>
        <div className={plainRow}>
          <span className="min-w-0">{ts("amount")}</span>
          <span className={figure}>{rupees(linesTotal)}</span>
        </div>

        {/* the discount: a ₹ box */}
        <div className={row}>
          <label htmlFor="order-discount" className="min-w-0 text-sm">
            {ts("discount")}
          </label>
          <span className="relative block w-[60%] shrink-0">
            <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2" aria-hidden />
            <NumberInput
              id="order-discount"
              value={discount}
              decimals={2}
              maxDigits={8}
              placeholder="0"
              onChange={typeDiscount}
              className={cn(input(false), amountBox)}
            />
          </span>
        </div>

        {/* the total is rounded to the rupee: what that adds or takes off */}
        {roundOff !== 0 && (
          <div className={plainRow}>
            <span className="min-w-0">{ts("roundOff")}</span>
            <span className="shrink-0 whitespace-nowrap font-semibold">{roundOff > 0 ? `+ ${rupees(roundOff)}` : `− ${rupees(-roundOff)}`}</span>
          </div>
        )}

        {/* the Total, under a line, in the chestnut box (as a sale's), as wide as the box above */}
        <div className={cn(row, "mt-1 border-t border-chestnut/30 pt-2.5")}>
          <span className="min-w-0 text-sm font-semibold">{ts("edit.total")}</span>
          <span className="tabular flex min-h-14 w-[60%] shrink-0 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
            {rupees(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
