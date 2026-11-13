"use client";

import { Minus, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { packLabel, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../../../product/products/product-tile";
import { emptyLine, lineFigures, type OrderLine, type PriceField, settleLine, useOrderEntry } from "./state";

// a ₹ box: no border, a soft shadow, ₹ on the left and the figure on the right; chestnut for Price + GST
const box = "flex min-h-11 w-32 shrink-0 items-center gap-[3px] rounded-control px-3 shadow-[0_0_5px_0] transition-shadow";
// a figure's row: its name on the left (wrapping if it must), its box on the right
const fieldRow = "flex items-center justify-between gap-3 text-sm";
const boxInput = "tabular w-full min-w-0 flex-1 bg-transparent text-right text-base font-bold outline-none";

// the line card: one pack size zoomed in over the dimmed page, to put it on the order or change it. On top, the
// product card as on the Products page (only this pack size's chip); then Rate per unit (with GST), Price and Price + GST
// (any one fills the other two), Quantity, the line's total, and Add to order (or Save and Remove from order). The ✕,
// a tap on the dim area or Escape closes it unchanged
export function LineCard() {
  const { cardFor, packOf } = useOrderEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each pack size opened
  return <LineCardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function LineCardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, lines, putLine, removeLine, setCardFor } = useOrderEntry();
  const units = useTranslations("products.items.form.units");
  const saved = lines.find((l) => l.productId === pack.productId);
  const [draft, setDraft] = useState<OrderLine>(() => saved ?? emptyLine(pack.productId));
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`;

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

  // one of the three typed: the other two follow
  const setFigure = (field: PriceField, v: string) =>
    setDraft((d) => settleLine({ ...d, [field]: v, from: field }, pack.packSize, pack.gstPercent));
  const { total } = lineFigures(draft, pack.packSize, pack.gstPercent);
  const ok = (Number(draft[draft.from]) || 0) > 0 && (Number(draft.quantity) || 0) >= 1;

  function done() {
    if (!ok) return;
    putLine(draft);
    close();
  }

  // straight on the page's body, so the step card's own layer can't put the header or bottom bar over it
  return createPortal(
    // the dim, blurred page; a tap on it closes
    <div
      onClick={(e) => e.target === e.currentTarget && close()}
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center overflow-y-auto bg-[rgba(30,12,6,0.62)] p-4 backdrop-blur-[3px]"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={name}
        className="on-ivory flex w-[min(340px,100%)] animate-zoom-in flex-col gap-2 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
      >
        {/* ✕ on top, no border */}
        <div className="-mb-1.5 -mr-1.5 -mt-1.5 flex justify-end">
          <button type="button" onClick={close} aria-label={t("close")} className="grid size-11 place-items-center rounded-control hover:bg-chestnut/8">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* the product card's top: this pack size's chip, the name, category | sub-category, the photo */}
        <span className="tabular inline-flex min-h-8 w-fit items-center rounded-control border border-chestnut bg-chestnut px-2.5 text-xs font-semibold text-ivory">
          {packLabel(pack.packSize, pack.packSizeCode)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-heading text-base font-bold leading-6" title={productTitle(group)}>
            {productTitle(group)}
          </p>
          <p className="truncate text-xs opacity-70">
            {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
          </p>
        </div>
        <ProductImage group={group} imageUrl={pack.imageUrl} className="aspect-auto! h-[110px] w-full grid-rows-[100%]" />

        {/* the figures, each a row: label left, box right */}
        <div className="mt-1 flex flex-col gap-3">
          <label className={fieldRow}>
            <span className="min-w-0">{t("ratePer", { unit: units(pack.packSizeCode) })}</span>
            <span className={cn(box, "shadow-chestnut/40 focus-within:shadow-chestnut/80")}>
              <span className="text-base text-chestnut/60">₹</span>
              <NumberInput autoFocus={!saved} value={draft.unitGst} decimals={2} maxDigits={6} onChange={(v) => setFigure("unitGst", v)} className={boxInput} />
            </span>
          </label>
          <label className={fieldRow}>
            <span className="min-w-0">{t("price")}</span>
            <span className={cn(box, "shadow-chestnut/40 focus-within:shadow-chestnut/80")}>
              <span className="text-base text-chestnut/60">₹</span>
              <NumberInput value={draft.price} decimals={2} maxDigits={7} onChange={(v) => setFigure("price", v)} className={boxInput} />
            </span>
          </label>
          <label className={fieldRow}>
            <span className="min-w-0">
              {t("priceGst")}
              <RequiredMark />
            </span>
            <span className={cn(box, "bg-chestnut text-ivory shadow-chestnut/40 focus-within:shadow-chestnut/80")}>
              <span className="text-base text-ivory/70">₹</span>
              <NumberInput value={draft.priceGst} decimals={2} maxDigits={7} onChange={(v) => setFigure("priceGst", v)} className={cn(boxInput, "caret-ivory")} />
            </span>
          </label>
          <div className={fieldRow}>
            <span className="min-w-0">
              {t("quantity")}
              <RequiredMark />
            </span>
            <QuantityBox value={draft.quantity} onChange={(v) => setDraft((d) => ({ ...d, quantity: v }))} name={name} />
          </div>

          {/* the line's total: Price + GST × quantity */}
          <div className="flex items-baseline justify-between border-t border-chestnut/12 pt-2.5">
            <span className="text-sm">{t("lineTotal")}</span>
            <b className="tabular font-heading text-2xl font-extrabold leading-[1.15]">{total > 0 ? rupees(total / 100) : "–"}</b>
          </div>
        </div>

        {/* Add to order, or Save and Remove from order for one already on it */}
        <div className="mt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={done}
            disabled={!ok}
            className="flex min-h-12 w-full items-center justify-center rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-opacity disabled:opacity-40"
          >
            {saved ? t("saveLine") : t("addToOrder")}
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
              {t("removeFromOrder")}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

// how many: − and + at the two ends, the number between (never below 1)
function QuantityBox({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  const { t } = useOrderEntry();
  const quantity = Number(value) || 0;
  const set = (n: number) => onChange(String(Math.min(99_999, Math.max(1, n))));
  return (
    <div className="flex min-h-11 w-32 shrink-0 items-center justify-between rounded-control bg-chestnut text-ivory">
      <button type="button" aria-label={`${t("less")}: ${name}`} disabled={quantity <= 1} onClick={() => set(quantity - 1)} className="grid h-11 w-9 shrink-0 place-items-center disabled:opacity-40">
        <Minus className="size-4" aria-hidden />
      </button>
      <NumberInput
        value={value}
        maxDigits={5}
        onChange={(v) => onChange(v.replace(/^0+/, ""))}
        onBlur={() => quantity < 1 && set(1)}
        aria-label={`${t("quantity")}: ${name}`}
        className="tabular w-full min-w-0 flex-1 bg-transparent text-center text-base font-bold caret-ivory outline-none"
      />
      <button type="button" aria-label={`${t("more")}: ${name}`} disabled={quantity >= 99_999} onClick={() => set(quantity + 1)} className="grid h-11 w-9 shrink-0 place-items-center disabled:opacity-40">
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
