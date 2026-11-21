"use client";

import { ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

import { TileTop } from "../../product/products/product-tile";
import { SCROLL_BOX, TILE_GRID } from "../shared/cart-button";
import { CartCards, CartTotalRow } from "../shared/cart-cards";
import { LineCard } from "./line-card";
import { useReturnEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";
// the slide button, as quiet as the sale's cart button
const slideButton =
  "flex min-h-10 shrink-0 items-center gap-1.5 rounded-control border border-chestnut/60 px-3 text-sm font-semibold transition-colors hover:border-chestnut";

// the Items card, as the sale's Products card: the Items | Total row for what's coming back with Returned › beside it
// (slides to Returned; ‹ Cart slides back). Two panels side by side: the sale's Cart, a tile for each item that can
// still come back (how many were sold, and Return, which opens its line card), and Returned, the cart cards of what's
// coming back (how many, the pen and the bin). An item stays in the Cart until all of it is coming back
export function ItemsCard() {
  const { t, sale, figures, chosen, lineOf, packOf, setCardFor, cardFor, removeLine } = useReturnEntry();

  // the two panels: as tall as the one showing, the other kept out of reach; nothing coming back: back to the Cart
  const [pane, setPane] = useState<"cart" | "returned">("cart");
  const cartRef = useRef<HTMLDivElement>(null);
  const returnedRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const shown = pane === "cart" ? cartRef.current : returnedRef.current;
    if (!shown) return;
    const fit = () => setHeight(shown.offsetHeight);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(shown);
    return () => watch.disconnect();
  }, [pane]);
  useEffect(() => {
    if (chosen === 0) setPane("cart");
  }, [chosen]);

  const qty = (id: string) => Number(lineOf(id).quantity) || 0;
  // the Cart: what can still come back (part of it already coming back stays too)
  const inCart = sale.lines.filter((l) => qty(l.productId) < l.canReturn && packOf(l.productId));
  // Returned: what's coming back, as the sale's cart cards
  const returned = sale.lines
    .filter((l) => qty(l.productId) > 0)
    .map((l) => ({ productId: l.productId, price: l.rate, quantity: qty(l.productId), total: (figures.items.find((i) => i.productId === l.productId)?.total ?? 0) / 100 }));

  return (
    <div className="flex flex-col gap-4">
      {/* the top, which stays put: Items | Total, and Returned › (or ‹ Cart while Returned shows) */}
      <div className="-mb-2 flex items-center gap-3">
        <CartTotalRow count={chosen} itemsTotal={figures.itemsTotal / 100} hold={cardFor !== null} className="flex-1" />
        {pane === "cart" ? (
          <button type="button" onClick={() => setPane("returned")} disabled={chosen === 0} className={cn(slideButton, "disabled:opacity-40")}>
            {t("returnedPane")}
            <ChevronRight className="-mr-1 size-4.5 shrink-0" aria-hidden />
          </button>
        ) : (
          <button type="button" onClick={() => setPane("cart")} className={slideButton}>
            <ChevronLeft className="-ml-1 size-4.5 shrink-0" aria-hidden />
            {t("cartPane")}
          </button>
        )}
      </div>

      {/* the panels: the Cart, and Returned to its right */}
      <div className="-mx-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
        <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", pane === "returned" && "-translate-x-1/2")}>
          {/* the Cart: a tile for each item that can still come back */}
          <div ref={cartRef} inert={pane !== "cart"} className="flex w-1/2 min-w-0 flex-col gap-4 px-1">
            <h3 className={cn(heading, "-mb-2")}>{t("cartPane")}</h3>
            <div className={SCROLL_BOX}>
              {inCart.length === 0 ? (
                <p className="py-6 text-center text-sm opacity-70">{t("allComingBack")}</p>
              ) : (
                <ul className={TILE_GRID}>
                  {inCart.map((l) => {
                    const found = packOf(l.productId)!;
                    return (
                      <li key={l.productId} className="flex min-w-0 flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:p-3.5">
                        {/* (this item's pack chip only) */}
                        <TileTop group={{ ...found.group, packs: [found.pack] }} pack={found.pack} onPack={() => undefined} phoneShort />
                        <div className="mt-auto flex flex-col items-center justify-center gap-2">
                          {/* how many were sold, on chestnut */}
                          <div className="tabular flex w-full items-baseline justify-center gap-1 truncate rounded-lg bg-chestnut py-1 text-ivory">
                            <span className="font-heading text-xl font-semibold">{l.sold.toLocaleString("en-IN")}</span>
                            <span className="text-xs opacity-70">{t("soldWord")}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCardFor(l.productId)}
                            className="mt-auto flex w-full items-center justify-center gap-2 rounded-control border border-chestnut/35 p-2 text-xs font-semibold hover:bg-chestnut/[0.06]"
                          >
                            <Undo2 className="size-4.5" aria-hidden /> {t("returnSale")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Returned: the cart cards of what's coming back */}
          <div ref={returnedRef} inert={pane !== "returned"} className="flex w-1/2 min-w-0 flex-col gap-3 px-1">
            <div className={SCROLL_BOX}>
              <CartCards
                lines={returned}
                packOf={packOf}
                priceLabel={t("rate")}
                itemsTotal={figures.itemsTotal / 100}
                onOpen={setCardFor}
                onRemove={removeLine}
                showTotal={false}
                detailRows={(row) => [{ key: "quantity", label: t("quantityReturned"), value: row.quantity.toLocaleString("en-IN") }]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* the line card, over the page, for the item being returned or changed */}
      <LineCard />
    </div>
  );
}
