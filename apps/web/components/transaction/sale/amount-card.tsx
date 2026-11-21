"use client";

import { IndianRupee } from "lucide-react";
import { useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { SCROLL_BOX } from "../shared/cart-button";
import { CartTotalRow } from "../shared/cart-cards";
import { input } from "../shared/form-basics";
import { SaleCartCards } from "./cart-button";
import { ProductCard } from "./product-card";
import { useSaleEntry } from "./state";

// a row of the amount, as a payment's: its name on the left, its box on the right with what's typed at its right end
const row = "flex min-w-0 items-center justify-between gap-3";
// the amount's box: large and bold, ₹ inside on the left
const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular text-right";

// the Amount card: on the left (first on a phone) the cart, as the Products card's: the Items | Total row, then its
// cards (a tap opens the product card to change one); on the right the amounts, as a payment's: the cart's total
// (worked out, no box), then a ₹ box each for the cash discount and the transport, packing and loading charges, then
// the Total in the chestnut box right under them
export function AmountCard() {
  const { t, lines, cardFor, itemsTotal, discount, setDiscount, transport, setTransport, packing, setPacking, loadingCharges, setLoadingCharges, grossTotal, roundOff, total, isEdit, editPaid, balance } =
    useSaleEntry();
  // the discount cut at the bill: it says so (until typed again)
  const [cut, setCut] = useState(false);
  const fields = [
    { key: "discount", label: t("discount"), value: discount, set: setDiscount, max: grossTotal },
    { key: "transport", label: t("transport"), value: transport, set: setTransport },
    { key: "packing", label: t("packing"), value: packing, set: setPacking },
    { key: "loading", label: t("loadingCharges"), value: loadingCharges, set: setLoadingCharges },
  ];
  return (
    // the cart on the left (on a phone, first), the amounts on the right
    <div className="grid items-start gap-6 sm:grid-cols-2 sm:gap-12">
      {/* the cart: the same Items | Total row, then its cards (a tap opens the product card to change one) */}
      <div className="flex min-w-0 flex-col gap-3">
        <CartTotalRow count={lines.length} itemsTotal={itemsTotal} hold={cardFor !== null} />
        <div className={SCROLL_BOX}>
          <SaleCartCards />
        </div>
        <ProductCard />
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        {/* the cart's total, as a payment's Due: room under it */}
        <div className="tabular mb-2 flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0">{t("items")}</span>
          <span className="shrink-0 whitespace-nowrap text-base font-semibold">{rupees(itemsTotal)}</span>
        </div>
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <div className={row}>
              <label htmlFor={`sale-${f.key}`} className="min-w-0 text-sm">
                {f.label}
              </label>
              <span className="relative block w-[60%] shrink-0">
                <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2" aria-hidden />
                <NumberInput
                  id={`sale-${f.key}`}
                  value={f.value}
                  decimals={2}
                  maxDigits={9}
                  max={f.max}
                  placeholder="0"
                  onChange={(v) => {
                    if (f.key === "discount") setCut(false);
                    f.set(v);
                  }}
                  onCapped={f.key === "discount" ? () => setCut(true) : undefined}
                  className={cn(input(false), amountBox)}
                />
              </span>
            </div>
            {f.key === "discount" && cut && (
              <FieldMessage tone="warning" className="ml-auto mt-0 w-[60%]">
                {t("discountCap", { amount: rupees(grossTotal) })}
              </FieldMessage>
            )}
          </div>
        ))}
        {/* the total is rounded to the rupee: what that adds or takes off */}
        {roundOff !== 0 && (
          <div className="tabular flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">{t("roundOff")}</span>
            <span className="shrink-0 whitespace-nowrap font-semibold">{roundOff > 0 ? `+ ${rupees(roundOff)}` : `− ${rupees(-roundOff)}`}</span>
          </div>
        )}
        {/* the Total, under a line, in the To receive row's fixed look (chestnut box, large figure), as wide as the boxes above */}
        <div className={cn(row, "mt-1 border-t border-chestnut/30 pt-2.5")}>
          <span className="min-w-0 text-sm font-semibold">{t("edit.total")}</span>
          <span className="tabular flex min-h-14 w-[60%] shrink-0 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
            {rupees(total)}
          </span>
        </div>
        {/* an edit: what was paid towards the bill (taken off, so with a minus), and what's left either way (paid over shows with a minus) */}
        {isEdit && (
          <>
            <div className="tabular flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">{t("edit.amountPaid")}</span>
              <span className="shrink-0 whitespace-nowrap text-base font-semibold">− {rupees(editPaid)}</span>
            </div>
            <div className="tabular flex items-baseline justify-between gap-3 border-t border-chestnut/30 pt-2.5 text-sm">
              <span className="min-w-0 font-bold">{t("edit.balanceLeft")}</span>
              <span className="shrink-0 whitespace-nowrap font-heading text-lg font-bold">
                {balance < 0 ? `− ${rupees(-balance)}` : rupees(balance)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
