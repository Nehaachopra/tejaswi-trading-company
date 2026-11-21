"use client";

import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { packLabel, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { ProductImage, productTitle } from "../../product/products/product-tile";
import { GodownStepper, QuantityBox, SackMeter } from "../shared/pack-parts";
import { figureReturn, placedOf, type ReturnLine, useReturnEntry } from "./state";

// a figure row on the card: its name on the left, the figure on the right
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <p className="tabular flex min-h-9 items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <b className="font-semibold">{value}</b>
    </p>
  );
}

// the line card: one item of the sale zoomed in over the dimmed page, as the sale's product card. On top its pack chip,
// name and photo; then two panels side by side: the first its Price + GST, how many were sold (and came back before),
// and Quantity (− and +, never past what can still come back); the second the godowns it goes back into (what's left
// to put back, then each godown with what it holds and how many go into it). Godowns › slides to them (highlighted
// while packs are left to put back), then the line's total and Done. The ✕, a tap on the dim area or Escape closes it
// unchanged
export function LineCard() {
  const { cardFor } = useReturnEntry();
  if (!cardFor) return null;
  // a fresh draft for each item opened
  return <CardBody key={cardFor} productId={cardFor} />;
}

function CardBody({ productId }: { productId: string }) {
  const { t, sale, packOf, nameOf, lineOf, putLine, removeLine, setCardFor, godownsOf } = useReturnEntry();
  const item = sale.lines.find((l) => l.productId === productId)!;
  const found = packOf(productId);
  const saved = lineOf(productId);
  const [draft, setDraft] = useState<ReturnLine>(saved);
  const [pane, setPane] = useState<"main" | "godowns">("main");
  const close = () => setCardFor(null);
  const name = nameOf(productId);
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft);
  const ok = quantity >= 1 && quantity <= item.canReturn && placed === quantity;
  const hint = quantity < 1 ? t("hintQuantity") : placed !== quantity ? t("hintGodowns") : null;
  // the line's total: its share of what it sold for, exactly as the return will take it
  const lineTotal = quantity > 0 ? (figureReturn(sale, { [productId]: quantity }).items[0]?.total ?? 0) / 100 : 0;
  const inReturn = (Number(saved.quantity) || 0) > 0;

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
    setTimeout(() => (to === "main" ? godownRow : back).current?.focus({ preventScroll: true }), 320);
  };
  const toPlace = quantity > 0 && placed !== quantity;

  function done() {
    if (!ok) return;
    putLine(productId, { ...draft, godowns: Object.fromEntries(Object.entries(draft.godowns).filter(([, v]) => (Number(v) || 0) > 0)) });
    close();
  }

  const godowns = godownsOf(productId);
  return createPortal(
    <div className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-[rgba(30,12,6,0.62)] backdrop-blur-[3px]">
      <div onClick={(e) => e.target === e.currentTarget && close()} className="flex min-h-full items-center justify-center p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-label={name}
          className="on-ivory flex w-[min(360px,100%)] min-w-0 animate-zoom-in flex-col gap-2 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        >
          {/* the pack chip on top; on the right the bin (for one already coming back), then ✕ */}
          <div className="flex justify-between">
            <span className="tabular inline-flex min-h-8 w-fit items-center rounded-control border border-chestnut bg-chestnut px-2.5 text-xs font-semibold text-ivory">
              {found ? packLabel(found.pack.packSize, found.pack.packSizeCode, found.pack.packCount) : name}
            </span>
            <span className="flex items-center">
              {inReturn && (
                <button
                  type="button"
                  onClick={() => {
                    removeLine(productId);
                    close();
                  }}
                  aria-label={t("removeLine")}
                  title={t("removeLine")}
                  className="grid place-items-center rounded-control p-2 text-danger hover:bg-danger/[0.08]"
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              )}
              <button type="button" onClick={close} aria-label={t("close")} className="grid place-items-center rounded-control p-2 hover:bg-chestnut/8">
                <X className="size-5" aria-hidden />
              </button>
            </span>
          </div>

          {/* the name, category | sub-category, then the photo */}
          {found && (
            <>
              <div className="min-w-0">
                <p className="break-words font-heading text-base font-bold leading-6">{productTitle(found.group)}</p>
                <p className="truncate text-xs opacity-70">
                  {titleCase(found.group.categoryName)} | {titleCase(found.group.subCategoryName)}
                </p>
              </div>
              <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-40 self-center" />
            </>
          )}

          {/* the panels: the first, and the godowns to its right */}
          <div className="overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
            <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", pane !== "main" && "-translate-x-1/2")}>
              {/* the first panel: the price, what was sold (and came back before), then how many come back now */}
              <div ref={mainRef} inert={pane !== "main"} className="flex w-1/2 min-w-0 flex-col px-1 py-1">
                <Fact label={t("priceGst")} value={rupees(item.price)} />
                <Fact label={t("sold")} value={item.sold.toLocaleString("en-IN")} />
                {item.returned > 0 && <Fact label={t("returnedBefore")} value={item.returned.toLocaleString("en-IN")} />}
                <div className="mt-1 flex min-h-11 items-center justify-between gap-3">
                  <span className="text-sm">{t("quantity")}</span>
                  <span className="w-[9rem] shrink-0">
                    <QuantityBox
                      autoFocus
                      value={draft.quantity}
                      max={item.canReturn}
                      label={`${t("quantity")}: ${name}`}
                      // a new quantity clears the godowns, to be placed again
                      onChange={(v) => setDraft((d) => (d.quantity === v ? d : { quantity: v, godowns: {} }))}
                    />
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
                  {t("godowns")}
                </button>
                <SackMeter label={t("leftToPutBack")} left={quantity - placed} share={quantity > 0 ? (placed / quantity) * 100 : 0} done={quantity > 0 && placed === quantity} />
                <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_7.5rem] items-center gap-3 px-0.5 text-xs font-semibold opacity-60">
                  <span>{t("godown")}</span>
                  <span className="text-center">{t("holds")}</span>
                  <span className="text-right">{t("quantity")}</span>
                </div>
                <div className="border-t border-chestnut/15" />
                <div className="-mx-1.5 flex max-h-[9.75rem] flex-col overflow-y-auto overscroll-contain px-1.5 [scrollbar-width:thin]">
                  {godowns.map((g) => {
                    const mine = Number(draft.godowns[g.godownId]) || 0;
                    // never more than is still to put back
                    const most = Math.max(0, quantity - (placed - mine));
                    return (
                      <div key={g.godownId} className={cn("tabular grid min-h-12 grid-cols-[minmax(0,1fr)_3.5rem_7.5rem] items-center gap-3 px-0.5 py-1", g.counting && "opacity-40")}>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold" title={g.name}>
                            {g.name}
                          </span>
                          {g.counting && <span className="block truncate text-xs">{t("beingCounted")}</span>}
                        </span>
                        <span className="text-center text-sm font-semibold">{g.held.toLocaleString("en-IN")}</span>
                        <GodownStepper
                          value={draft.godowns[g.godownId] ?? ""}
                          max={most}
                          disabled={g.counting}
                          label={`${g.name}: ${name}`}
                          onChange={(v) => setDraft((d) => ({ ...d, godowns: { ...d.godowns, [g.godownId]: v } }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Godowns › (while the first panel shows), its arrow filled and pulsing while packs are left to put back */}
          {pane === "main" && (
            <button ref={godownRow} type="button" onClick={() => slide("godowns")} aria-label={t("godowns")} className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm font-semibold">
              <span>{t("godowns")}</span>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-control transition-colors", toPlace && "animate-pulse bg-chestnut text-ivory motion-reduce:animate-none")}>
                <ChevronRight className="size-5" aria-hidden />
              </span>
            </button>
          )}

          {/* the line's total: Price + GST × quantity */}
          <div className="flex items-baseline justify-between border-t border-chestnut/15 pt-2.5">
            <span className="text-sm">{t("lineTotal")}</span>
            <b className="tabular font-heading text-2xl font-extrabold leading-[1.15]">{lineTotal > 0 ? rupees(lineTotal) : "–"}</b>
          </div>

          {/* Done (what still holds it back, said just above) */}
          <div className="mt-1 flex flex-col gap-2">
            {hint && <p className="text-center text-xs text-chestnut/70">{hint}</p>}
            <button
              type="button"
              onClick={done}
              disabled={!ok}
              className="flex min-h-12 w-full items-center justify-center rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-opacity disabled:opacity-40"
            >
              {t("doneLine")}
            </button>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
