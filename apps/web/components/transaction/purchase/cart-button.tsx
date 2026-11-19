"use client";

import { ShoppingCart, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { CartCards } from "../shared/cart-cards";
import { usePurchaseEntry } from "./state";

// the cart button at the top of the Products card: the cart's total and, on its corner, how many items (a chestnut
// badge that jumps when one is added). Quiet, as the filters; greyed out while the cart is empty. A tap opens the cart
// card, a popup as the line card: the In the cart cards, the Items | Total row, then Done
export function CartButton() {
  const { t, ts, lines, figures, packOf, itemsTotal, setCardFor, removeLine } = usePurchaseEntry();
  const [open, setOpen] = useState(false);
  const count = lines.length;

  // the badge jumps when the count goes up
  const [bump, setBump] = useState(false);
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) setBump(true);
    seen.current = count;
  }, [count]);

  // the last item taken out: the cart card closes
  useEffect(() => {
    if (count === 0) setOpen(false);
  }, [count]);

  // Escape closes the cart card, unless a line card is open over it (that one closes first)
  const { cardFor } = usePurchaseEntry();
  useEffect(() => {
    if (!open || cardFor) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cardFor]);

  return (
    <>
      {/* the button: cart icon, the total, the count on its corner */}
      <button
        type="button"
        disabled={count === 0}
        onClick={() => setOpen(true)}
        aria-label={`${ts("cart")}: ${count}`}
        className="relative flex min-h-10 shrink-0 items-center gap-2 rounded-control border border-chestnut/60 px-3 text-sm font-semibold transition-colors hover:border-chestnut disabled:cursor-default disabled:opacity-60 disabled:hover:border-chestnut/60"
      >
        <ShoppingCart className="size-4.5 shrink-0" aria-hidden />
        <span className="tabular">{count > 0 ? rupees(itemsTotal) : ts("cart")}</span>
        <span
          onAnimationEnd={() => setBump(false)}
          className={cn(
            "tabular absolute -right-2 -top-2 grid h-5.5 min-w-5.5 place-items-center rounded-full bg-chestnut px-1.5 text-xs font-extrabold text-ivory ring-2 ring-ivory",
            bump && "animate-cart-bump motion-reduce:animate-none",
          )}
        >
          {count.toLocaleString("en-IN")}
        </span>
      </button>

      {/* the cart card, a popup over the dim, blurred page as the line card: In the cart with ✕, the cart cards (scrolled up and down)
          and the Total row, then Done. A tap outside or Escape closes it too */}
      {open &&
        createPortal(
          <div
            onClick={(e) => e.target === e.currentTarget && setOpen(false)}
            className="fixed inset-0 z-50 grid animate-fade-in grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto bg-[rgba(30,12,6,0.62)] p-4 backdrop-blur-[3px]"
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label={ts("inCart")}
              className="on-ivory flex max-h-[calc(100dvh-2rem)] w-[min(560px,100%)] animate-zoom-in flex-col gap-3 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
            >
              <div className="flex shrink-0 items-center justify-between gap-3">
                <h2 className="font-heading text-xl font-bold">{ts("inCart")}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={ts("close")}
                  className="grid place-items-center rounded-control p-2 hover:bg-chestnut/8"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              <CartCards
                lines={lines.map((l, i) => ({
                  productId: l.productId,
                  price: figures[i]!.rate / 100,
                  quantity: Number(l.quantity) || 0,
                  total: figures[i]!.total / 100,
                }))}
                packOf={packOf}
                priceLabel={t("rate")}
                itemsTotal={itemsTotal}
                onOpen={setCardFor}
                onRemove={removeLine}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 w-full shrink-0 rounded-control bg-chestnut px-6 text-sm font-semibold text-ivory sm:w-auto sm:self-end"
              >
                {ts("cartDone")}
              </button>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
