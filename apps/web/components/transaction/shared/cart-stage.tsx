"use client";

import { IndianRupee } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { SCROLL_BOX } from "./cart-button";
import { input } from "./form-basics";

// a row of the amounts: its name on the left, its box on the right with what's typed at its right end
const row = "flex min-w-0 items-center justify-between gap-3";
const plainRow = "tabular flex items-baseline justify-between gap-3 text-sm";
const figure = "shrink-0 whitespace-nowrap text-base font-semibold";
// the amount boxes: large and bold, ₹ inside on the left
const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular text-right";

// a ₹ box on the amounts' side: the discount or a charge
export type AmountField = { key: string; label: string; value: string; set: (v: string) => void };

// the cart stage shared by sale, purchase, sale order and purchase order: on the left (first on a phone) the cart's
// cards (a tap opens the product details card to change one; nothing yet: a note); on the right the amount breakup:
// Items, Amount (the cart's total, worked out), the Discount box (cut at `discountMax`, saying so), then a sale's or
// purchase's charges (an order has none), the round off when there is one, and the total in the chestnut box
export function CartStage({
  idPrefix,
  cards,
  count,
  itemsTotal,
  discount,
  setDiscount,
  discountMax,
  charges = [],
  roundOff,
  total,
  totalLabel,
  after,
  children,
}: {
  idPrefix: string;
  // the cart's cards
  cards: ReactNode;
  count: number;
  itemsTotal: number;
  discount: string;
  setDiscount: (v: string) => void;
  discountMax: number;
  // a sale's or purchase's charges, each a ₹ box under the discount
  charges?: AmountField[];
  roundOff: number;
  total: number;
  totalLabel: string;
  // rows under the total (an edited sale's paid and balance)
  after?: ReactNode;
  // the product details card
  children?: ReactNode;
}) {
  const t = useTranslations("transactions.sale");
  // the discount cut at its most: it says so (until typed again)
  const [cut, setCut] = useState(false);
  const fields: (AmountField & { max?: number })[] = [
    { key: "discount", label: t("discount"), value: discount, set: setDiscount, max: discountMax },
    ...charges,
  ];
  return (
    // the cart on the left (on a phone, first), the amounts on the right
    <div className="grid items-start gap-6 sm:grid-cols-2 sm:gap-12">
      {/* the cart: its cards, or a note while it's empty */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className={SCROLL_BOX}>{count === 0 ? <p className="py-6 text-center text-sm opacity-70">{t("cartEmpty")}</p> : cards}</div>
        {children}
      </div>

      {/* the amount breakup */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* how many items, then the cart's total as the Amount */}
        <div className={plainRow}>
          <span className="min-w-0">{t("items")}</span>
          <span className={figure}>{count}</span>
        </div>
        <div className={plainRow}>
          <span className="min-w-0">{t("amount")}</span>
          <span className={figure}>{rupees(itemsTotal)}</span>
        </div>

        {/* the discount, then the charges: a ₹ box each */}
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <div className={row}>
              <label htmlFor={`${idPrefix}-${f.key}`} className="min-w-0 text-sm">
                {f.label}
              </label>
              <span className="relative block w-[60%] shrink-0">
                <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2" aria-hidden />
                <NumberInput
                  id={`${idPrefix}-${f.key}`}
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
                {t("discountCap", { amount: rupees(discountMax) })}
              </FieldMessage>
            )}
          </div>
        ))}

        {/* the total is rounded to the rupee: what that adds or takes off */}
        {roundOff !== 0 && (
          <div className={plainRow}>
            <span className="min-w-0">{t("roundOff")}</span>
            <span className="shrink-0 whitespace-nowrap font-semibold">{roundOff > 0 ? `+ ${rupees(roundOff)}` : `− ${rupees(-roundOff)}`}</span>
          </div>
        )}

        {/* the total, under a line, in the chestnut box, as wide as the boxes above */}
        <div className={cn(row, "mt-1 border-t border-chestnut/30 pt-2.5")}>
          <span className="min-w-0 text-sm font-semibold">{totalLabel}</span>
          <span className="tabular flex min-h-14 w-[60%] shrink-0 items-center justify-end break-all rounded-control bg-chestnut px-4 pt-1 font-heading text-2xl font-bold leading-none text-ivory">
            {rupees(total)}
          </span>
        </div>
        {after}
      </div>
    </div>
  );
}
