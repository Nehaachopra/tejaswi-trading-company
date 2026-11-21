"use client";

import { IndianRupee } from "lucide-react";
import { useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { SCROLL_BOX } from "../shared/cart-button";
import { input } from "../shared/form-basics";
import { PurchaseCartCards } from "./cart-button";
import { ProductDetailsCard } from "./product-details-card";
import { usePurchaseEntry } from "./state";

// a row of the amount, as the sale's: its name on the left, its box on the right with what's typed at its right end
const row = "flex min-w-0 items-center justify-between gap-3";
// the amount's box: large and bold, ₹ inside on the left
const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular text-right";

// the Cart card, as the sale's: on the left (first on a phone) the cart's cards (a tap opens the product details card to
// change one); on the right Items, the cart's Amount (worked out, no box), then a ₹ box each for the cash discount and
// the freight, packing, loading and other charges (each as on the bill, GST in it), the round off when there is one,
// then the bill total in the chestnut box right under them
export function CartCard() {
  const {
    t,
    ts,
    lines,
    itemsTotal,
    discount,
    setDiscount,
    freight,
    setFreight,
    packing,
    setPacking,
    loadingCharges,
    setLoadingCharges,
    otherCharges,
    setOtherCharges,
    grossTotal,
    roundOff,
    total,
  } = usePurchaseEntry();
  // the discount cut at the bill: it says so (until typed again)
  const [cut, setCut] = useState(false);
  const fields = [
    { key: "discount", label: ts("discount"), value: discount, set: setDiscount, max: grossTotal },
    { key: "freight", label: t("freight"), value: freight, set: setFreight },
    { key: "packing", label: ts("packing"), value: packing, set: setPacking },
    { key: "loading", label: ts("loadingCharges"), value: loadingCharges, set: setLoadingCharges },
    { key: "other", label: t("otherCharges"), value: otherCharges, set: setOtherCharges },
  ];
  return (
    // the cart on the left (on a phone, first), the amounts on the right
    <div className="grid items-start gap-6 sm:grid-cols-2 sm:gap-12">
      {/* the cart: its cards (a tap opens the product details card to change one) */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className={SCROLL_BOX}>
          {/* nothing in the cart yet: a note in the cards' place */}
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm opacity-70">{ts("cartEmpty")}</p>
          ) : (
            <PurchaseCartCards />
          )}
        </div>
        <ProductDetailsCard />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {/* how many items, then the cart's total as the Amount */}
        <div className="tabular flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0">{ts("items")}</span>
          <span className="shrink-0 whitespace-nowrap text-base font-semibold">{lines.length}</span>
        </div>
        <div className="tabular flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0">{ts("amount")}</span>
          <span className="shrink-0 whitespace-nowrap text-base font-semibold">
            {rupees(itemsTotal)}
          </span>
        </div>
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <div className={row}>
              <label htmlFor={`purchase-${f.key}`} className="min-w-0 text-sm">
                {f.label}
              </label>
              <span className="relative block w-[60%] shrink-0">
                <IndianRupee
                  className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2"
                  aria-hidden
                />
                <NumberInput
                  id={`purchase-${f.key}`}
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
                {ts("discountCap", { amount: rupees(grossTotal) })}
              </FieldMessage>
            )}
          </div>
        ))}
        {/* the total is rounded to the rupee: what that adds or takes off */}
        {roundOff !== 0 && (
          <div className="tabular flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">{t("roundOff")}</span>
            <span className="shrink-0 whitespace-nowrap font-semibold">
              {roundOff > 0 ? `+ ${rupees(roundOff)}` : `− ${rupees(-roundOff)}`}
            </span>
          </div>
        )}
        {/* what's to be paid, in the chestnut box, under a line */}
        <div className={cn(row, "mt-1 border-t border-chestnut/30 pt-2.5")}>
          <span className="min-w-0 text-sm font-bold">{t("billTotal")}</span>
          <span className="tabular flex min-h-12 w-[60%] shrink-0 items-center justify-end break-all rounded-control bg-chestnut px-3.5 font-heading text-xl font-bold text-ivory">
            {rupees(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
