"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { packLabel, rupees, titleCase } from "~/lib/format";
import { parseAmount } from "~/lib/price";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../../product/products/product-tile";
import { MoneyBox } from "../shared/figures-table";
import { GodownStepper, QuantityBox, SackMeter } from "../shared/pack-parts";
import { type CartLine, lineFigures, placedOf, usePurchaseEntry } from "./state";

// the most packs of one size on a bill, as the server takes it
const MOST_PACKS = 99_999;

// the product card, as the sale's: one pack size zoomed in over the dimmed page, to put it in the cart or change it. On
// top its pack chip and ✕, the name and a square photo; then the supplier's rate a pack (Before GST or With GST, a
// switch beside it, the box empty to start) and the quantity, each a row; the GST and the line's total; Godowns with ›,
// which slides the card to the godowns (what's left to place, then each godown with what it holds and how many go into
// it); and Add to cart (or Save and Remove from cart). The ✕, a tap on the dim area or Escape closes it unchanged
export function ProductCard() {
  const { cardFor, packOf } = usePurchaseEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each pack size opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, ts, lines, putLine, removeLine, setCardFor } = usePurchaseEntry();
  const saved = lines.find((l) => l.productId === pack.productId);
  const [draft, setDraft] = useState<CartLine>(() => saved ?? { productId: pack.productId, rate: "", withGst: false, quantity: "", godowns: {} });
  const [pane, setPane] = useState<"main" | "godowns">("main");
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const gst = pack.gstPercent ?? 0;

  // the figures: the rate, the quantity and what's placed in godowns
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft);
  const { tax, total } = lineFigures(draft.rate, draft.withGst, quantity, gst);
  const rateOk = (parseAmount(draft.rate) ?? 0) > 0;
  const ok = rateOk && quantity >= 1 && placed === quantity;
  // what still holds Add back, said just above it
  const hint = !rateOk ? t("hintRate") : quantity < 1 ? ts("hintQuantity") : placed !== quantity ? t("hintGodowns") : null;

  // the page behind doesn't scroll, and Escape closes
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCardFor(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [setCardFor]);

  function done() {
    if (!ok) return;
    // only the godowns with something going into them
    putLine({ ...draft, godowns: Object.fromEntries(Object.entries(draft.godowns).filter(([, v]) => (Number(v) || 0) > 0)) });
    close();
  }

  // the two panels: as tall as the one showing, the other kept out of reach
  const mainRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const shown = pane === "main" ? mainRef.current : sideRef.current;
    if (!shown) return;
    const fit = () => setHeight(shown.offsetHeight);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(shown);
    return () => watch.disconnect();
  }, [pane]);
  // on sliding, the cursor goes to the back arrow (or back to the Godowns button)
  const back = useRef<HTMLButtonElement>(null);
  const godownRow = useRef<HTMLButtonElement>(null);
  const slide = (to: "main" | "godowns") => {
    setPane(to);
    setTimeout(() => (to === "main" ? godownRow : back).current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions), 320);
  };
  // a quantity typed with packs still to place: the Godowns arrow is highlighted, to say where to go next
  const toPlace = quantity > 0 && placed !== quantity;
  const row = "flex min-w-0 items-center justify-between gap-3";

  return createPortal(
    // the dim, blurred page; a tap on it closes. The card sits in the middle, and scrolls with the page when taller
    <div className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-[rgba(30,12,6,0.62)] backdrop-blur-[3px]">
      <div onClick={(e) => e.target === e.currentTarget && close()} className="flex min-h-full items-center justify-center p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-label={name}
          className="on-ivory flex w-[min(360px,100%)] min-w-0 animate-zoom-in flex-col gap-2 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        >
          {/* the pack chip and ✕ on top */}
          <div className="flex justify-between">
            <span className="tabular inline-flex min-h-8 w-fit items-center rounded-control border border-chestnut bg-chestnut px-2.5 text-xs font-semibold text-ivory">
              {packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}
            </span>
            <button type="button" onClick={close} aria-label={ts("close")} className="grid place-items-center rounded-control p-2 hover:bg-chestnut/8">
              <X className="size-5" aria-hidden />
            </button>
          </div>

          {/* the name, category | sub-category, then the square photo in the middle */}
          <div className="min-w-0">
            <p className="break-words font-heading text-base font-bold leading-6">{productTitle(group)}</p>
            <p className="truncate text-xs opacity-70">
              {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
            </p>
          </div>
          <ProductImage group={group} imageUrl={pack.imageUrl} className="size-40 self-center" />

          {/* the panels: the first, and the godowns to its right */}
          <div className="overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
            <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", pane !== "main" && "-translate-x-1/2")}>
              {/* the first panel: the rate with its switch, then the quantity (room at the sides for the boxes' soft
                  edges) */}
              <div ref={mainRef} inert={pane !== "main"} className="flex w-1/2 min-w-0 flex-col gap-3 px-1 py-1">
                <div className="flex flex-col gap-1.5">
                  <div className={row}>
                    <span className="text-sm">{t("rate")}</span>
                    {/* Before GST / With GST: what the typed rate is */}
                    <span className="flex rounded-control border border-chestnut/35 p-0.5 text-xs font-semibold" role="group" aria-label={t("rate")}>
                      {([false, true] as const).map((withGst) => (
                        <button
                          key={String(withGst)}
                          type="button"
                          aria-pressed={draft.withGst === withGst}
                          onClick={() => setDraft((d) => ({ ...d, withGst }))}
                          className={cn("min-h-8 rounded-[6px] px-2.5", draft.withGst === withGst && "bg-chestnut text-ivory")}
                        >
                          {t(withGst ? "withGst" : "beforeGst")}
                        </button>
                      ))}
                    </span>
                  </div>
                  <MoneyBox value={draft.rate} maxDigits={7} label={`${t("rate")}: ${name}`} onChange={(v) => setDraft((d) => ({ ...d, rate: v }))} />
                </div>
                <div className={row}>
                  <span className="text-sm">{ts("quantity")}</span>
                  <span className="w-[60%] shrink-0">
                    <QuantityBox value={draft.quantity} max={MOST_PACKS} label={`${ts("quantity")}: ${name}`} onChange={(v) => setDraft((d) => ({ ...d, quantity: v }))} />
                  </span>
                </div>
              </div>

              {/* the second panel: the godowns */}
              <div ref={sideRef} inert={pane === "main"} className="flex w-1/2 min-w-0 flex-col gap-2 px-4 pb-1">
                <button
                  ref={back}
                  type="button"
                  onClick={() => slide("main")}
                  className="flex min-h-12 w-full items-center gap-1.5 border-t border-chestnut/15 pt-2 text-left text-sm font-semibold"
                >
                  <ChevronLeft className="size-5 shrink-0" aria-hidden />
                  {ts("godowns")}
                </button>
                <GodownRows
                  productId={pack.productId}
                  quantity={quantity}
                  parts={draft.godowns}
                  name={name}
                  onPart={(godownId, v) => setDraft((d) => ({ ...d, godowns: { ...d.godowns, [godownId]: v } }))}
                />
              </div>
            </div>
          </div>

          {/* the GST on it, then the line's total */}
          <div className="tabular flex items-baseline justify-between border-t border-chestnut/15 pt-2.5 text-sm">
            <span>{ts("gstRate", { rate: gst })}</span>
            <span className="font-semibold">{tax > 0 ? rupees(tax / 100) : "–"}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm">{ts("lineTotal")}</span>
            <b className="tabular font-heading text-2xl font-extrabold leading-[1.15]">{total > 0 ? rupees(total / 100) : "–"}</b>
          </div>

          {/* Godowns and › (while the first panel shows), its arrow filled and pulsing while packs are still to place */}
          {pane === "main" && (
            <button
              ref={godownRow}
              type="button"
              onClick={() => slide("godowns")}
              aria-label={ts("godowns")}
              className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm font-semibold"
            >
              <span>{ts("godowns")}</span>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full transition-colors", toPlace && "animate-pulse bg-chestnut text-ivory motion-reduce:animate-none")}>
                <ChevronRight className="size-5" aria-hidden />
              </span>
            </button>
          )}

          {/* Add to cart, or Save and Remove from cart for one already in it */}
          <div className="mt-1 flex flex-col gap-2">
            {hint && <p className="text-center text-xs text-chestnut/70">{hint}</p>}
            <button
              type="button"
              onClick={done}
              disabled={!ok}
              className="flex min-h-12 w-full items-center justify-center rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-opacity disabled:opacity-40"
            >
              {saved ? ts("saveLine") : ts("addToCart")}
            </button>
            {saved && (
              <button
                type="button"
                onClick={() => {
                  removeLine(pack.productId);
                  close();
                }}
                className="min-h-11 w-full rounded-control border border-chestnut/35 text-sm font-semibold text-danger hover:bg-chestnut/[0.06]"
              >
                {ts("removeFromCart")}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

// the godowns' part: what's left to place, then a row each: name left, what it holds now in the middle, how many go
// into it right (never more than is still to place; none into one being counted)
function GodownRows({
  productId,
  quantity,
  parts,
  name,
  onPart,
}: {
  productId: string;
  quantity: number;
  parts: Record<string, string>;
  name: string;
  onPart: (godownId: string, v: string) => void;
}) {
  const { t, ts, spotsOf } = usePurchaseEntry();
  const spots = spotsOf(productId);
  const placedNow = Object.values(parts).reduce((a, v) => a + (Number(v) || 0), 0);
  const left = quantity - placedNow;
  return (
    <div className="flex flex-col gap-1">
      <SackMeter label={t("leftToPlace")} left={left} share={quantity > 0 ? (placedNow / quantity) * 100 : 0} done={quantity > 0 && left === 0} />
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_7.5rem] items-center gap-3 px-0.5 text-xs font-semibold opacity-60">
        <span>{ts("godown")}</span>
        <span className="text-center">{t("holds")}</span>
        <span className="text-right">{ts("quantity")}</span>
      </div>
      <div className="border-t border-chestnut/15" />
      {/* at most about three rows tall, then the rows scroll inside the card */}
      <div className="-mx-1.5 flex max-h-[9.75rem] flex-col overflow-y-auto overscroll-contain px-1.5 [scrollbar-width:thin]">
        {spots.map((g) => {
          const mine = Number(parts[g.godownId]) || 0;
          const most = Math.max(0, quantity - (placedNow - mine));
          return (
            <div key={g.godownId} className={cn("tabular grid min-h-12 grid-cols-[minmax(0,1fr)_3.5rem_7.5rem] items-center gap-3 px-0.5 py-1", g.counting && "opacity-40")}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" title={g.name}>
                  {g.name}
                </span>
                {g.counting && <span className="block truncate text-xs">{ts("beingCounted")}</span>}
              </span>
              <span className="text-center text-sm font-semibold">{g.held.toLocaleString("en-IN")}</span>
              <GodownStepper value={parts[g.godownId] ?? ""} max={most} disabled={g.counting} label={`${g.name}: ${name}`} onChange={(v) => onPart(g.godownId, v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
