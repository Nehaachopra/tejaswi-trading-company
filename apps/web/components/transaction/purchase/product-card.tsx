"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { FieldMessage } from "~/components/ui/field-message";
import { packLabel, rupees, titleCase } from "~/lib/format";
import { unitsIn } from "~/lib/price";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../../product/products/product-tile";
import { CostChart } from "../order/new/cost-chart";
import { QuantityBox } from "../order/new/quantity-box";
import { emptyLine, lineFigures, type PriceField, settleLine } from "../order/new/state";
import { FiguresTable, MoneyBox } from "../shared/figures-table";
import { GodownStepper, SackMeter } from "../shared/pack-parts";
import { type CartLine, placedOf, usePurchaseEntry } from "./state";

// the product card, exactly as a purchase order's line card: one pack size zoomed in over the dimmed page. On top its
// pack chip and ✕, the name and the photo; what it cost on its last purchases; then Basis | New for Cost per unit, Cost
// + GST (each fills the other) and Quantity, and the line's total (an item its order waits for, as a sale's dispatch:
// Basis | Current | New, the order's figures as Current, and Ordered with ⌄ opening what's in stock in place of
// Quantity). A purchase also says where the packs go: Godowns
// with ›, which slides the card to the godowns (what's left to place, then each godown with what it holds and how many
// go into it). Add to cart (or Save; the bin by ✕ takes one already in the cart out). The ✕, a tap on the dim area or Escape closes it unchanged
export function ProductCard() {
  const { cardFor, packOf } = usePurchaseEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each pack size opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { ts, lines, putLine, removeLine, setCardFor, orderLine, orderLeft, orderCost, spotsOf } = usePurchaseEntry();
  const t = useTranslations("orders");
  const units = useTranslations("products.items.form.units");
  const tp = useTranslations("transactions.purchase");
  const saved = lines.find((l) => l.productId === pack.productId);
  // an arrival on a purchase order: how many of it the order still waits for (never more can come on it)
  const left = orderLeft(pack.productId);
  const onOrder = left > 0 ? orderLine(pack.productId) : null;
  // a new line starts at a quantity of 0, its costs empty; one its order waits for starts from the cost it was ordered at
  // (its quantity still 0: how many came is typed)
  const [draft, setDraft] = useState<CartLine>(
    () =>
      saved ??
      (left > 0
        ? { ...settleLine({ ...emptyLine(pack.productId), priceGst: orderCost(pack.productId), from: "priceGst" }, unitsIn(pack), pack.gstPercent), quantity: "0", godowns: {} }
        : { ...emptyLine(pack.productId), quantity: "0", godowns: {} }),
  );
  // typed past what the order still waits for: cut to it, and it says so (until changed again)
  const [cutQty, setCutQty] = useState(false);
  // from an order: whether the Quantity row (what's in stock now) under Ordered shows
  const [stockOpen, setStockOpen] = useState(false);
  const [pane, setPane] = useState<"main" | "godowns">("main");
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const rateLabel = t("costPer", { unit: units(pack.packSizeCode) });

  // one of the costs typed: the others follow
  const setFigure = (field: PriceField, v: string) => setDraft((d) => ({ ...d, ...settleLine({ ...d, [field]: v, from: field }, unitsIn(pack), pack.gstPercent) }));
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft);
  const { total } = lineFigures(draft, unitsIn(pack), pack.gstPercent);
  const costOk = (Number(draft[draft.from]) || 0) > 0;
  const ok = costOk && quantity >= 1 && placed === quantity;
  // what still holds Add back, said just above it
  const hint = !costOk ? tp("hintCost") : quantity < 1 ? ts("hintQuantity") : placed !== quantity ? tp("hintGodowns") : null;

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

  // how many come: − and + around the number (from an order, never past what it still waits for, saying so when cut)
  const quantityBox = (
    <div className="flex flex-col gap-1.5">
      <QuantityBox
        value={draft.quantity}
        max={left > 0 ? left : undefined}
        onChange={(v, cut) => {
          setCutQty(cut);
          setDraft((d) => ({ ...d, quantity: v }));
        }}
        name={name}
      />
      {cutQty && (
        <FieldMessage tone="warning" className="mt-0">
          {tp("orderCap", { n: left.toLocaleString("en-IN") })}
        </FieldMessage>
      )}
    </div>
  );

  return createPortal(
    // the dim, blurred page; a tap on it closes
    <div
      onClick={(e) => e.target === e.currentTarget && close()}
      className="fixed inset-0 z-50 grid animate-fade-in grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto bg-[rgba(30,12,6,0.62)] p-4 backdrop-blur-[3px]"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={name}
        className="on-ivory flex w-[min(340px,100%)] animate-zoom-in flex-col gap-2 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
      >
        {/* pack quantity on top; on the right, for one already in the cart a bin (takes it out), then ✕ */}
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
                aria-label={ts("removeFromCart")}
                title={ts("removeFromCart")}
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

        {/* the product card's top: the name, category | sub-category, the photo */}
        <div className="min-w-0">
          <p className="truncate font-heading text-base font-bold leading-6" title={productTitle(group)}>
            {productTitle(group)}
          </p>
          <p className="truncate text-xs opacity-70">
            {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
          </p>
        </div>
        <ProductImage group={group} imageUrl={pack.imageUrl} className="size-40 self-center" />

        {/* what this pack size cost on its last purchases */}
        <CostChart productId={pack.productId} />

        {/* the panels: the figures, and the godowns to their right */}
        <div className="mt-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
          <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", pane !== "main" && "-translate-x-1/2")}>
            {/* the figures: Basis | New for Cost per unit, Cost + GST and Quantity, then the line's total (room at the
                sides for the boxes' soft edges) */}
            <div ref={mainRef} inert={pane !== "main"} className="flex w-1/2 min-w-0 flex-col gap-3 px-1 py-1">
              <FiguresTable
                // from an order, as a sale's dispatch: Basis | Current (the order's figures) | New
                headings={{ basis: t("basis"), current: onOrder ? t("current") : undefined, new: t("new") }}
                rows={[
                  {
                    key: "rate",
                    label: rateLabel,
                    current: onOrder ? rupees(Math.round((Number(orderCost(pack.productId)) / unitsIn(pack)) * 100) / 100) : "",
                    input: <MoneyBox autoFocus={!saved} value={draft.unitGst} maxDigits={6} onChange={(v) => setFigure("unitGst", v)} label={rateLabel} />,
                  },
                  {
                    key: "price",
                    label: t("costGst"),
                    current: onOrder ? rupees(Number(orderCost(pack.productId))) : "",
                    input: <MoneyBox value={draft.priceGst} maxDigits={7} onChange={(v) => setFigure("priceGst", v)} label={t("costGst")} />,
                  },
                  // from an order: Ordered, how many it still waits for beside the box (it starts at 0); its ⌄
                  // shows what's in stock now. Otherwise just Quantity
                  ...(onOrder
                    ? [
                        {
                          key: "ordered",
                          label: (
                            <button type="button" onClick={() => setStockOpen((o) => !o)} aria-expanded={stockOpen} className="flex items-center gap-1 text-left">
                              {ts("ordered")}
                              <ChevronDown className={cn("size-4 shrink-0 transition-transform", stockOpen && "rotate-180")} aria-hidden />
                            </button>
                          ),
                          // what the order still waits for (all of it until some has come), as its tile shows
                          current: left.toLocaleString("en-IN"),
                          input: quantityBox,
                          top: true,
                        },
                        ...(stockOpen
                          ? [{ key: "stock", label: t("quantity"), current: spotsOf(pack.productId).reduce((a, g) => a + g.held, 0).toLocaleString("en-IN"), input: <span /> }]
                          : []),
                      ]
                    : [{ key: "quantity", label: t("quantity"), current: "", input: quantityBox, top: true }]),
                ]}
              />
              {/* the line's total: Cost + GST × quantity */}
              <div className="flex items-baseline justify-between border-t border-chestnut/12 pt-2.5">
                <span className="text-sm">{t("lineTotal")}</span>
                <b className="tabular font-heading text-2xl font-extrabold leading-[1.15]">{total > 0 ? rupees(total / 100) : "–"}</b>
              </div>
            </div>

            {/* the godowns */}
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

        {/* Godowns and › (while the figures show): where the packs go, its arrow filled and pulsing while some are
            still to place */}
        {pane === "main" && (
          <button
            ref={godownRow}
            type="button"
            onClick={() => slide("godowns")}
            aria-label={ts("godowns")}
            className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm font-semibold"
          >
            <span>{ts("godowns")}</span>
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-control transition-colors", toPlace && "animate-pulse bg-chestnut text-ivory motion-reduce:animate-none")}>
              <ChevronRight className="size-5" aria-hidden />
            </span>
          </button>
        )}

        {/* Add to cart, or Save for one already in it */}
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
        </div>
      </section>
    </div>,
    document.body,
  );
}

// the godowns' part: what's left to place, then a row each: name left, what it holds now in the middle, how many go
// into it right (never more than is still to place; none into one being counted). With no quantity typed yet, only the
// godowns and what each holds: no meter, no Quantity column
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
  // the godowns holding most of it first (where it's kept already), ones being counted last
  const spots = [...spotsOf(productId)].sort((a, b) => Number(a.counting) - Number(b.counting) || b.held - a.held);
  const placedNow = Object.values(parts).reduce((a, v) => a + (Number(v) || 0), 0);
  const left = quantity - placedNow;
  // a quantity typed: the meter and the Quantity column show
  const placing = quantity > 0;
  const cols = placing ? "grid-cols-[minmax(0,1fr)_3.5rem_7.5rem]" : "grid-cols-[minmax(0,1fr)_3.5rem]";
  return (
    <div className="flex flex-col gap-1">
      {placing && <SackMeter label={t("leftToPlace")} left={left} share={(placedNow / quantity) * 100} done={left === 0} />}
      <div className={cn("grid items-center gap-3 px-0.5 text-xs font-semibold opacity-60", cols, !placing && "mt-2")}>
        <span>{ts("godown")}</span>
        <span className="text-center">{ts("available")}</span>
        {placing && <span className="text-right">{ts("quantity")}</span>}
      </div>
      <div className="border-t border-chestnut/15" />
      {/* at most about three rows tall, then the rows scroll inside the card */}
      <div className="-mx-1.5 flex max-h-[9.75rem] flex-col overflow-y-auto overscroll-contain px-1.5 [scrollbar-width:thin]">
        {spots.map((g) => {
          const mine = Number(parts[g.godownId]) || 0;
          const most = Math.max(0, quantity - (placedNow - mine));
          return (
            <div key={g.godownId} className={cn("tabular grid min-h-12 items-center gap-3 px-0.5 py-1", cols, g.counting && "opacity-40")}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" title={g.name}>
                  {g.name}
                </span>
                {g.counting && <span className="block truncate text-xs">{ts("beingCounted")}</span>}
              </span>
              <span className="text-center text-sm font-semibold">{g.held.toLocaleString("en-IN")}</span>
              {placing && <GodownStepper value={parts[g.godownId] ?? ""} max={most} disabled={g.counting} label={`${g.name}: ${name}`} onChange={(v) => onPart(g.godownId, v)} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
