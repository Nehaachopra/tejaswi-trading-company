"use client";

import { ChevronRight, ShoppingCart, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup } from "../../product/products/product-tile";
import { CartCards } from "./cart-cards";
import { type CartRow } from "./cart-table";

// the products' tiles in rows of two (three wider)
export const TILE_GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3";

// the products' box: as tall as the screen leaves between the card's top (heading, filters) and Next, scrolled up and
// down inside (room at the sides for the tiles' edges)
export const SCROLL_BOX =
  "-mx-1 flex max-h-[calc(100dvh-26rem)] min-h-72 flex-col gap-4 overflow-y-auto overscroll-contain px-1 py-0.5 [scrollbar-width:thin] lg:max-h-[calc(100dvh-21rem)]";

// the cart button at the top of a Products card (a purchase's or a sale's): the cart icon and the cart's total (the
// count shows in the Total row beside it). Quiet, as the filters; greyed out while the cart is empty. A tap opens the cart card, a popup as the line card: the In the cart cards, the Items | Total row, then Done.
// `lineOpen`: a line card is open over it (Escape closes that one first); `iconOnly`: no total on it
export function CartButton({
  rows,
  packOf,
  priceLabel,
  itemsTotal,
  onOpen,
  onRemove,
  lineOpen,
  iconOnly = false,
  filled = false,
  onSlide,
}: {
  rows: CartRow[];
  packOf: (id: string) => { group: ProductGroup; pack: Pack } | null;
  priceLabel: string;
  itemsTotal: number;
  onOpen: (productId: string) => void;
  onRemove: (productId: string) => void;
  lineOpen: boolean;
  // only the cart icon (the total shows in the Total row beside it)
  iconOnly?: boolean;
  // the cart opens beside the products in their card (a › after the icon) instead of as a popup
  onSlide?: () => void;
  // chestnut, with the word Cart after the icon (the sale's, beside its Items | Total row)
  filled?: boolean;
}) {
  const ts = useTranslations("transactions.sale");
  const [open, setOpen] = useState(false);
  const count = rows.length;

  // the last item taken out: the cart card closes
  useEffect(() => {
    if (count === 0) setOpen(false);
  }, [count]);

  // Escape closes the cart card, unless a line card is open over it
  useEffect(() => {
    if (!open || lineOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, lineOpen]);

  return (
    <>
      {/* the button: cart icon, the total (or ›) */}
      <button
        type="button"
        disabled={count === 0}
        onClick={() => (onSlide ? onSlide() : setOpen(true))}
        aria-label={`${ts("cart")}: ${count}`}
        className={cn(
          "flex min-h-10 shrink-0 items-center gap-2 rounded-control px-3 text-sm font-semibold transition-colors disabled:cursor-default disabled:opacity-60",
          filled
            ? "self-stretch bg-chestnut text-ivory hover:bg-chestnut/90"
            : "border border-chestnut/60 hover:border-chestnut disabled:hover:border-chestnut/60",
        )}
      >
        <ShoppingCart className="size-4.5 shrink-0" aria-hidden />
        {filled && <span>{ts("cart")}</span>}
        {!iconOnly && <span className="tabular">{count > 0 ? rupees(itemsTotal) : ts("cart")}</span>}
        {onSlide && <ChevronRight className="-mx-1 size-4.5 shrink-0" aria-hidden />}
      </button>

      {/* the cart card, a popup over the dim, blurred page as the line card: In the cart with ✕, the cart cards
          (scrolled up and down) and the Total row, then Done. A tap outside or Escape closes it too */}
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
                lines={rows}
                packOf={packOf}
                priceLabel={priceLabel}
                itemsTotal={itemsTotal}
                onOpen={onOpen}
                onRemove={onRemove}
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
