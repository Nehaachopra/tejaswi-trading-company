"use client";

import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { FieldMessage } from "~/components/ui/field-message";
import { packLabel, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../../product/products/product-tile";
import { type FigureRow, FiguresTable } from "./figures-table";
import { GodownStepper, SackMeter } from "./pack-parts";

// a godown as the card lists it: its name, how many of this pack size it holds now, and whether it's being counted
export type GodownSpot = { godownId: string; name: string; held: number; counting: boolean };

// where the packs go (a purchase) or leave from (a sale): the godowns, the quantity to share out among them, each
// one's share, and the meter's words ("Left to place" / "Left to dispatch")
export type GodownsPart = {
  spots: GodownSpot[];
  quantity: number;
  parts: Record<string, string>;
  onPart: (godownId: string, v: string) => void;
  leftLabel: string;
  // a sale: no godown gives more than it holds
  capAtHeld?: boolean;
  // Add tapped with packs still to place: the Godowns arrow turns red
  invalid?: boolean;
  // the row's name in place of "Godowns" (a return's "Item received in")
  label?: string;
  // filled in already (a return's main godown): the arrow never pulses
  calm?: boolean;
};

// a card's second step (a return's Replace or Refund): ‹ back on top, then its own body in place of the figures and
// godowns; the photo shrinks
export type SecondStep = { open: boolean; backLabel: string; onBack: () => void; body: ReactNode };

// the product details card shared by sale, purchase, sale order and purchase order: one pack size zoomed in over the dimmed
// page. On top its pack chip, a bin (when it can come out) and ✕; the name, category | sub-category and the photo;
// anything the transaction adds there (a purchase's cost chart); then the Basis | Current | New table. With godowns,
// Godowns with › slides the card to them (‹ slides back), its arrow pulsing while some are still to place. Then the
// line's total and the button (never disabled: tapped with something missing, the caller marks it red and the error
// shows under the button). The ✕, a tap on the dim area or Escape closes it
export function ProductDetailsCard({
  group,
  pack,
  onClose,
  onRemove,
  removeLabel,
  above,
  headings,
  rows,
  godowns,
  total,
  error,
  actionLabel,
  onDone,
  escapeOff = false,
  second,
  children,
}: {
  group: ProductGroup;
  pack: Pack;
  onClose: () => void;
  // given: the bin shows (takes the line out)
  onRemove?: () => void;
  removeLabel?: string;
  above?: ReactNode;
  headings: { basis: string; current?: string; new: string };
  rows: FigureRow[];
  godowns?: GodownsPart;
  // in paise
  total: number;
  // what's missing, once Add was tapped (null: nothing)
  error?: string | null;
  actionLabel: string;
  onDone: () => void;
  // while a question over the card is open, Escape answers that one
  escapeOff?: boolean;
  second?: SecondStep;
  // dialogs over the card
  children?: ReactNode;
}) {
  const t = useTranslations("transactions.sale");
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const [pane, setPane] = useState<"main" | "godowns">("main");

  // the page behind doesn't scroll, and Escape closes
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !escapeOff && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, escapeOff]);

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
  const placed = godowns ? Object.values(godowns.parts).reduce((a, v) => a + (Number(v) || 0), 0) : 0;
  const toPlace = !!godowns && !godowns.calm && godowns.quantity > 0 && placed !== godowns.quantity;
  const godownsName = godowns?.label ?? t("godowns");
  const onSecond = !!second?.open;

  // straight on the page's body, so the step card's own layer can't put the header or bottom bar over it
  return createPortal(
    // the dim, blurred page; a tap on it closes. The card sits in the middle, and scrolls with the page when taller
    <div className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-[rgba(30,12,6,0.62)] backdrop-blur-[3px]">
      <div onClick={(e) => e.target === e.currentTarget && onClose()} className="flex min-h-full items-center justify-center p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-label={name}
          className="on-ivory flex w-[min(360px,100%)] min-w-0 animate-zoom-in flex-col gap-2 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        >
          {/* pack chip on top; on the right, for one that can come out a bin, then ✕ */}
          <div className="flex justify-between">
            <span className="tabular inline-flex min-h-8 w-fit items-center rounded-control border border-chestnut bg-chestnut px-2.5 text-xs font-semibold text-ivory">
              {packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}
            </span>
            <span className="flex items-center">
              {onRemove && (
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    onClose();
                  }}
                  aria-label={removeLabel}
                  title={removeLabel}
                  className="grid place-items-center rounded-control p-2 text-danger hover:bg-danger/[0.08]"
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              )}
              <button type="button" onClick={onClose} aria-label={t("close")} className="grid place-items-center rounded-control p-2 hover:bg-chestnut/8">
                <X className="size-5" aria-hidden />
              </button>
            </span>
          </div>

          {/* the name, category | sub-category, then the square photo in the middle */}
          <div className="min-w-0">
            <p className="break-words font-heading text-base font-bold leading-6">{productTitle(group)}</p>
            <p className="truncate text-xs opacity-70">
              {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
            </p>
          </div>
          <ProductImage group={group} imageUrl={pack.imageUrl} className={cn("self-center", onSecond ? "size-24" : "size-40")} />

          {/* the second step: ‹ back, then its body */}
          {second && onSecond && (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={second.onBack} className="flex min-h-12 w-full items-center gap-1.5 border-b border-chestnut/15 text-left text-sm font-semibold">
                <ChevronLeft className="size-5 shrink-0" aria-hidden />
                {second.backLabel}
              </button>
              {second.body}
            </div>
          )}

          {/* what the transaction adds above the figures (a purchase's cost chart) */}
          {!onSecond && above}

          {/* the panels: the figures, and the godowns to their right (room at the sides for the boxes' soft edges) */}
          <div hidden={onSecond} className="mt-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
            <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", pane !== "main" && "-translate-x-1/2")}>
              <div ref={mainRef} inert={pane !== "main"} className="flex w-1/2 min-w-0 flex-col gap-3 px-1 py-1">
                <FiguresTable headings={headings} rows={rows} />
              </div>

              {/* the godowns, with ‹ back on top */}
              {godowns && (
                <div ref={sideRef} inert={pane === "main"} className="flex w-1/2 min-w-0 flex-col gap-2 px-4 pb-1">
                  <button
                    ref={back}
                    type="button"
                    onClick={() => slide("main")}
                    className="flex min-h-12 w-full items-center gap-1.5 border-t border-chestnut/15 pt-2 text-left text-sm font-semibold"
                  >
                    <ChevronLeft className="size-5 shrink-0" aria-hidden />
                    {godownsName}
                  </button>
                  <GodownRows {...godowns} name={name} />
                </div>
              )}
            </div>
          </div>

          {/* Godowns and › (while the figures show): opens the godowns, its arrow filled and pulsing while packs are
              still to place */}
          {godowns && pane === "main" && !onSecond && (
            <button
              ref={godownRow}
              type="button"
              onClick={() => slide("godowns")}
              aria-label={godownsName}
              className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm font-semibold"
            >
              <span>{godownsName}</span>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-control transition-colors", godowns.invalid ? "bg-danger text-white" : toPlace && "animate-pulse bg-chestnut text-ivory motion-reduce:animate-none")}>
                <ChevronRight className="size-5" aria-hidden />
              </span>
            </button>
          )}

          {/* the line's total: price (or cost) + GST × quantity */}
          <div className="flex items-baseline justify-between border-t border-chestnut/15 pt-2.5">
            <span className="text-sm">{t("lineTotal")}</span>
            <b className="tabular font-heading text-2xl font-extrabold leading-[1.15]">{total > 0 ? rupees(total / 100) : "–"}</b>
          </div>

          {/* Add to cart / Add to order (or Save), always tappable; under it what's missing, once tapped */}
          <div className="mt-1 flex flex-col gap-2">
            <button
              type="button"
              // a tap brings the error back (data-recheck)
              data-recheck
              onClick={onDone}
              className="flex min-h-12 w-full items-center justify-center rounded-control bg-chestnut font-heading text-lg font-bold text-ivory"
            >
              {actionLabel}
            </button>
            {error && (
              <FieldMessage key={error} className="mt-0">
                {error}
              </FieldMessage>
            )}
          </div>
        </section>
      </div>

      {children}
    </div>,
    document.body,
  );
}

// the godowns' part: what's left to place, then a row each: name left, what it holds now in the middle, how many go
// (into it or out of it) right; none for one being counted. With no quantity typed yet, only the godowns and what each
// holds: no meter, no Quantity column
export function GodownRows({ spots, quantity, parts, onPart, leftLabel, capAtHeld = false, name }: GodownsPart & { name: string }) {
  const t = useTranslations("transactions.sale");
  // the godowns holding most of it first, ones being counted last
  const sorted = [...spots].sort((a, b) => Number(a.counting) - Number(b.counting) || b.held - a.held);
  const placedNow = Object.values(parts).reduce((a, v) => a + (Number(v) || 0), 0);
  const left = quantity - placedNow;
  // a quantity typed: the meter and the Quantity column show
  const placing = quantity > 0;
  const cols = placing ? "grid-cols-[minmax(0,1fr)_3.5rem_7.5rem]" : "grid-cols-[minmax(0,1fr)_3.5rem]";
  return (
    <div className="flex flex-col gap-1">
      {placing && <SackMeter label={leftLabel} left={left} share={(placedNow / quantity) * 100} done={left === 0} />}
      {/* the column names, a line under them */}
      <div className={cn("grid items-center gap-3 px-0.5 text-xs font-semibold opacity-60", cols, !placing && "mt-2")}>
        <span>{t("godown")}</span>
        <span className="text-center">{t("available")}</span>
        {placing && <span className="text-right">{t("quantity")}</span>}
      </div>
      <div className="border-t border-chestnut/15" />
      {/* at most about three rows tall, then the rows scroll inside the card; room at the sides for the boxes' edges */}
      <div className="-mx-1.5 flex max-h-[9.75rem] flex-col overflow-y-auto overscroll-contain px-1.5 [scrollbar-width:thin]">
        {sorted.map((g) => {
          const mine = Number(parts[g.godownId]) || 0;
          // never more than is still to place (a sale: nor more than it holds)
          const rest = quantity - (placedNow - mine);
          const most = Math.max(0, capAtHeld ? Math.min(g.held, rest) : rest);
          return (
            <div key={g.godownId} className={cn("tabular grid min-h-12 items-center gap-3 px-0.5 py-1", cols, g.counting && "opacity-40")}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" title={g.name}>
                  {g.name}
                </span>
                {g.counting && <span className="block truncate text-xs">{t("beingCounted")}</span>}
              </span>
              <span className="text-center text-sm font-semibold">{g.held.toLocaleString("en-IN")}</span>
              {placing && (
                <GodownStepper value={parts[g.godownId] ?? ""} max={most} disabled={g.counting} label={`${g.name}: ${name}`} onChange={(v) => onPart(g.godownId, v)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
