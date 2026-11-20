"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { packLabel, rupees, titleCase } from "~/lib/format";
import { asField, parseAmount, unitsIn } from "~/lib/price";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../../product/products/product-tile";
import { FiguresTable, MoneyBox } from "../shared/figures-table";
import { GodownStepper, QuantityBox, SackMeter } from "../shared/pack-parts";
import { type CartLine, lineFigures, placedOf, priceOf, useSaleEntry } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// the product card: one pack size zoomed in over the dimmed page, to put it in the cart or change it. On top its pack
// chip, name and a square photo; then two panels side by side, the first shown: the Basis | Current | New table for
// Rate per unit, Price + GST and Quantity. Then the line's total, Godowns with › (highlighted once there's a quantity
// still to dispatch), which slides the card left to the godowns (what's left to dispatch, then each godown with what
// it holds and how many leave it; ‹ slides back), and Add to cart (or Save and Remove from cart). The New prices start from the saved ones. The ✕, a tap on the dim area or Escape closes it
// unchanged
export function ProductCard() {
  const { cardFor, packOf } = useSaleEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each pack size opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, lines, putLine, removeLine, setCardFor, freeOf, orderPrice, order } = useSaleEntry();
  const units = useTranslations("products.items.form.units");
  // a dispatch on a sale order: this pack's line on the order (how many were ordered, how many have gone out), while
  // the order still waits for some of it
  const onOrder = order?.lines.find((l) => l.productId === pack.productId) ?? null;
  const ordered = onOrder && onOrder.quantity > onOrder.delivered ? onOrder : null;
  const saved = lines.find((l) => l.productId === pack.productId);
  // a pack its order still waits for starts from the price it was ordered at
  // what the order still waits for of it
  const orderedLeft = ordered ? Math.max(0, ordered.quantity - ordered.delivered) : 0;
  // (otherwise from the saved price, filled in the New box), and, from an order, from the quantity still to go on it,
  // as much as there is to take
  const [draft, setDraft] = useState<CartLine>(
    () =>
      saved ?? {
        productId: pack.productId,
        newPrice: orderPrice(pack) || (pack.priceAfterGst != null ? asField(pack.priceAfterGst) : ""),
        quantity: orderedLeft > 0 ? String(Math.min(orderedLeft, freeOf(pack))) : "",
        godowns: {},
      },
  );
  // which panel shows: the first, or the godowns
  const [pane, setPane] = useState<"main" | "godowns">("main");
  // the rate as typed, until the price is typed instead (then it follows the price)
  const [rateText, setRateText] = useState<string | null>(null);
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const gst = pack.gstPercent ?? 0;
  const list = pack.priceAfterGst ?? 0;

  // the figures: the price it sells at, its rate before GST, the quantity and what's placed in godowns
  const price = priceOf(draft, pack);
  const quantity = Number(draft.quantity) || 0;
  const available = freeOf(pack);
  const placed = placedOf(draft);
  const { rate, total } = lineFigures(price, quantity, gst);
  // a new price below what a pack costs us can't be saved
  const belowCost = pack.weightedAverageCost != null && rate < Math.round(pack.weightedAverageCost * 100);
  // a unit's price with GST: "Price / kg"
  const rateLabel = t("pricePer", { unit: units(pack.packSizeCode) });
  const typedPrice = parseAmount(draft.newPrice);
  const rateValue = rateText ?? (typedPrice === null ? "" : asField(round2(typedPrice / unitsIn(pack))));
  const ok = price > 0 && quantity >= 1 && quantity <= available && placed === quantity;
  // below cost: Add asks first whether to sell it that low (a pack's cost with GST, to set against the price)
  const [askBelow, setAskBelow] = useState(false);
  const costGst = round2((pack.weightedAverageCost ?? 0) * (1 + gst / 100));
  // what still holds Add back, said just above it
  const hint = price <= 0
    ? t("hintPrice")
    : belowCost
    ? t("belowCost")
    : quantity < 1
      ? t("hintQuantity")
      : placed !== quantity
        ? t("hintGodowns")
        : null;

  // the page behind doesn't scroll, and Escape closes
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    // (not while the below-cost question is open: Escape answers that one)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !askBelow && setCardFor(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [setCardFor, askBelow]);

  function done(sellBelow = false) {
    if (!ok) return;
    // below cost: asked first
    if (belowCost && !sellBelow) {
      setAskBelow(true);
      return;
    }
    // only the godowns with something leaving them
    putLine({
      ...draft,
      belowCostOk: belowCost,
      godowns: Object.fromEntries(Object.entries(draft.godowns).filter(([, v]) => (Number(v) || 0) > 0)),
    });
    close();
  }

  // the two panels: as tall as the one showing, the other kept out of reach
  const box = useRef<HTMLDivElement>(null);
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
  // from an order: whether the stock rows under Ordered show
  const [stockOpen, setStockOpen] = useState(false);
  // how many this sale sends: − and + around the number
  const quantityBox = (
    <QuantityBox
      value={draft.quantity}
      max={available}
      label={`${t("quantity")}: ${name}`}
      onChange={(v) => setDraft((d) => ({ ...d, quantity: v }))}
    />
  );
  // a quantity typed with packs still to dispatch: the Godowns arrow is highlighted, to say where to go next
  const toDispatch = quantity > 0 && placed !== quantity;

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
          {/* pack chip on top; on the right, for one already in the cart a bin (takes it out), then ✕ */}
          <div className="flex justify-between">
            <span className="tabular inline-flex min-h-8 w-fit items-center rounded-control border border-chestnut bg-chestnut px-2.5 text-xs font-semibold text-ivory">
              {packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}
            </span>
            <span className="flex items-center">
              {saved && (
              <button
                type="button"
                onClick={() => {
                  removeLine(pack.productId);
                  close();
                }}
                aria-label={t("removeFromCart")}
                title={t("removeFromCart")}
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

          {/* this pack size's chip, the name, category | sub-category, then the square photo in the middle */}
          
          <div className="min-w-0">
            <p className="break-words font-heading text-base font-bold leading-6">{productTitle(group)}</p>
            <p className="truncate text-xs opacity-70">
              {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
            </p>
          </div>
          <ProductImage group={group} imageUrl={pack.imageUrl} className="size-40 self-center" />

          {/* the panels: the first, and the godowns to its right */}
          <div ref={box} className="overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
            <div
              className={cn(
                "flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none",
                pane !== "main" && "-translate-x-1/2",
              )}
            >
              {/* the first panel: the saved figures beside this sale's (room at the sides for the boxes' soft edges) */}
              <div ref={mainRef} inert={pane !== "main"} className="flex w-1/2 min-w-0 flex-col gap-3 px-1 py-1">
                <FiguresTable
                  headings={{ basis: t("basis"), current: t("current"), new: t("new") }}
                  rows={[
                    // no saved price: what a pack costs us with GST, to price above it (first, above the rate)
                    ...(pack.priceAfterGst == null && pack.weightedAverageCost != null
                      ? [{ key: "cost", label: t("costGst"), current: rupees(round2(pack.weightedAverageCost * (1 + gst / 100))), input: <span /> }]
                      : []),
                    // the rate for one unit, with GST: typing it fills the price
                    {
                      key: "rate",
                      label: rateLabel,
                      current: pack.priceAfterGst != null ? rupees(round2(list / unitsIn(pack))) : "–",
                      input: (
                        // quiet: the price is the one to type; the rate follows it (and can still be typed)
                        <MoneyBox
                          quiet
                          value={rateValue}
                          maxDigits={6}
                          label={`${rateLabel}: ${name}`}
                          onChange={(v) => {
                            setRateText(v);
                            const r = parseAmount(v);
                            setDraft((d) => ({ ...d, newPrice: r === null ? "" : asField(round2(r * unitsIn(pack))) }));
                          }}
                        />
                      ),
                    },
                    // the pack's price with GST
                    {
                      key: "price",
                      label: t("priceGst"),
                      current: pack.priceAfterGst != null ? rupees(list) : "–",
                      input: (
                        // the cursor starts here when the card opens
                        <MoneyBox
                          autoFocus
                          value={draft.newPrice}
                          maxDigits={7}
                          label={`${t("priceGst")}: ${name}`}
                          onChange={(v) => {
                            setRateText(null);
                            setDraft((d) => ({ ...d, newPrice: v }));
                          }}
                        />
                      ),
                    },
                    // from an order: Ordered, how many it ordered beside the box (it starts at what's still to go);
                    // its ⌄ shows what's free to sell (and, once some have gone out, how many it still waits for)
                    ...(ordered
                      ? [
                          {
                            key: "ordered",
                            label: (
                              <button
                                type="button"
                                onClick={() => setStockOpen((o) => !o)}
                                aria-expanded={stockOpen}
                                className="flex items-center gap-1 text-left"
                              >
                                {t("ordered")}
                                <ChevronDown
                                  className={cn("size-4 shrink-0 transition-transform", stockOpen && "rotate-180")}
                                  aria-hidden
                                />
                              </button>
                            ),
                            current: ordered.quantity.toLocaleString("en-IN"),
                            input: quantityBox,
                          },
                          ...(stockOpen
                            ? [
                                ...(ordered.delivered > 0
                                  ? [
                                      {
                                        key: "left",
                                        label: t("leftToPlace"),
                                        current: orderedLeft.toLocaleString("en-IN"),
                                        input: <span />,
                                      },
                                    ]
                                  : []),
                                { key: "available", label: t("quantity"), current: available.toLocaleString("en-IN"), input: <span /> },
                              ]
                            : []),
                        ]
                      : [
                          // what's free to sell, and how many
                          {
                            key: "quantity",
                            label: t("quantity"),
                            current: available.toLocaleString("en-IN"),
                            input: quantityBox,
                          },
                        ]),
                  ]}
                />
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

          {/* Godowns and › above the total (while the first panel shows): opens the godowns, its arrow filled and
              pulsing while packs are still to dispatch */}
          {pane === "main" && (
            <button
              ref={godownRow}
              type="button"
              onClick={() => slide("godowns")}
              aria-label={t("godowns")}
              className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm font-semibold"
            >
              <span>{t("godowns")}</span>
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
                  toDispatch && "animate-pulse bg-chestnut text-ivory motion-reduce:animate-none",
                )}
              >
                <ChevronRight className="size-5" aria-hidden />
              </span>
            </button>
          )}

          {/* the line's total: Price + GST × quantity */}
          <div className="flex items-baseline justify-between border-t border-chestnut/15 pt-2.5">
            <span className="text-sm">{t("lineTotal")}</span>
            <b className="tabular font-heading text-2xl font-extrabold leading-[1.15]">{total > 0 ? rupees(total / 100) : "–"}</b>
          </div>

          {/* Add to cart, or Save and Remove from cart for one already in it */}
          <div className="mt-1 flex flex-col gap-2">
            {hint && <p className="text-center text-xs text-chestnut/70">{hint}</p>}
            <button
              type="button"
              onClick={() => done()}
              disabled={!ok}
              className="flex min-h-12 w-full items-center justify-center rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-opacity disabled:opacity-40"
            >
              {saved ? t("saveLine") : t("addToCart")}
            </button>
          </div>
        </section>
      </div>

      {/* Add to cart below cost: asked whether to sell it that low */}
      <ConfirmDialog
        open={askBelow}
        // No on the left, Yes on the right
        tone="danger"
        title={t("sellBelowTitle")}
        // the price and a pack's cost (both with GST), then on its own line the question with the loss on all the packs
        body={
          <>
            <p>{t("sellBelowFact", { price: rupees(price), cost: rupees(costGst) })}</p>
            <p className="mt-2 font-semibold text-chestnut">{t("sellBelowAsk", { loss: rupees(round2((costGst - price) * quantity)) })}</p>
          </>
        }
        confirmLabel={t("yes")}
        cancelLabel={t("no")}
        busy={false}
        onConfirm={() => {
          setAskBelow(false);
          done(true);
        }}
        onCancel={() => setAskBelow(false)}
      />
    </div>,
    document.body,
  );
}

// the godowns' part: what's left to place, then a row each: name left, what it holds in the middle, how many leave it
// right (never more than it holds nor more than is still to place)
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
  const { t, godownsOf } = useSaleEntry();
  const godowns = godownsOf(productId);
  const placedNow = Object.values(parts).reduce((a, v) => a + (Number(v) || 0), 0);
  const left = quantity - placedNow;
  return (
    <div className="flex flex-col gap-1">
      <SackMeter label={t("leftToPlace")} left={left} share={quantity > 0 ? (placedNow / quantity) * 100 : 0} done={quantity > 0 && left === 0} />
      {/* the column names, then a row each: name left, what it holds in the middle, how many leave it right */}
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_7.5rem] items-center gap-3 px-0.5 text-xs font-semibold opacity-60">
        <span>{t("godown")}</span>
        <span className="text-center">{t("available")}</span>
        <span className="text-right">{t("quantity")}</span>
      </div>
      {/* a line under the column names */}
      <div className="border-t border-chestnut/15" />
      {/* at most about three rows tall, then the rows scroll inside the card (the meter and column names stay put), so
          Total and Add to cart stay on the screen; room at the sides so the boxes' soft edges aren't cut */}
      <div className="-mx-1.5 flex max-h-[9.75rem] flex-col overflow-y-auto overscroll-contain px-1.5 [scrollbar-width:thin]">
        {godowns.map((g) => {
          const mine = Number(parts[g.godownId]) || 0;
          // never more than it holds, nor more than the quantity still to place
          const most = Math.max(0, Math.min(g.held, quantity - (placedNow - mine)));
          return (
            <div
              key={g.godownId}
              className={cn("tabular grid min-h-12 grid-cols-[minmax(0,1fr)_3.5rem_7.5rem] items-center gap-3 px-0.5 py-1", g.counting && "opacity-40")}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" title={g.name}>
                  {g.name}
                </span>
                {g.counting && <span className="block truncate text-xs">{t("beingCounted")}</span>}
              </span>
              <span className="text-center text-sm font-semibold">{g.held.toLocaleString("en-IN")}</span>
              <GodownStepper
                value={parts[g.godownId] ?? ""}
                max={most}
                disabled={g.counting}
                label={`${g.name}: ${name}`}
                onChange={(v) => onPart(g.godownId, v)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
