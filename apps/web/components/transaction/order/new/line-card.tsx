"use client";
import { unitsIn } from "~/lib/price";

import { Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { FieldMessage, useNudge } from "~/components/ui/field-message";
import { createPortal } from "react-dom";

import { packLabel, rupees, titleCase } from "~/lib/format";

import {
  type Pack,
  type ProductGroup,
  ProductImage,
  productTitle,
} from "../../../product/products/product-tile";
import { CostChart } from "./cost-chart";
import { FiguresTable, MoneyBox } from "../../shared/figures-table";
import { QuantityBox } from "./quantity-box";
import {
  emptyLine,
  lineFigures,
  type OrderLine,
  type PriceField,
  settleLine,
  useOrderEntry,
} from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// the line card: one pack size zoomed in over the dimmed page, to put it on the order or change it. On top, the
// product card as on the Products page (only this pack size's chip); then the figures table (a sale: Basis | Current |
// New for Rate per unit, Price + GST and Quantity; a purchase: Basis | New for Cost per unit, Cost + GST and
// Quantity), the line's total, and Add to order (or Save and Remove from order). The ✕, a tap on the dim area or Escape closes it unchanged
export function LineCard() {
  const { cardFor, packOf } = useOrderEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each pack size opened
  return <LineCardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function LineCardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, kind, lines, putLine, removeLine, setCardFor, movedOf, heldOf } = useOrderEntry();
  const units = useTranslations("products.items.form.units");
  const saved = lines.find((l) => l.productId === pack.productId);
  const sale = kind === "sale";
  // a new line starts at a quantity of 0; a sale also starts from the pack's saved price with GST (changed here for
  // this order only), a purchase with its costs empty
  const [draft, setDraft] = useState<OrderLine>(() => {
    if (saved) return saved;
    const start = { ...emptyLine(pack.productId), quantity: "0" };
    return sale && pack.priceAfterGst != null
      ? settleLine(
          { ...start, priceGst: String(pack.priceAfterGst), from: "priceGst" },
          unitsIn(pack),
          pack.gstPercent,
        )
      : start;
  });
  // a sale: how many are free to order (not held for another order; what this order holds now counts as free for it);
  // the quantity stops there
  const available = pack.unreservedQuantity + heldOf(pack.productId);
  const most = sale ? Math.min(available, 99_999) : 99_999;
  // an order being changed: what has already moved (arrived, or gone out); the quantity can't go below it
  const moved = movedOf(pack.productId);
  const least = Math.max(1, moved);
  // a sale: the pack's saved price with GST
  const listPrice = pack.priceAfterGst;
  // more than that was typed: cut to it, and it says so for a while
  const over = useNudge();
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  // a unit's price (a sale order) or cost (a purchase order) with GST: "Price / kg", "Cost / kg"
  const rateLabel = t(sale ? "pricePer" : "costPer", { unit: units(pack.packSizeCode) });

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
    setDraft((d) => settleLine({ ...d, [field]: v, from: field }, unitsIn(pack), pack.gstPercent));
  const { total } = lineFigures(draft, unitsIn(pack), pack.gstPercent);
  const ok =
    (Number(draft[draft.from]) || 0) > 0 &&
    (Number(draft.quantity) || 0) >= least &&
    Number(draft.quantity) <= most;

  function done() {
    if (!ok) return;
    putLine(draft);
    close();
  }

  // the New column: the two ₹ boxes (rate or cost per unit, price or cost + GST) and the quantity
  const rateBox = (
    // quiet: the price is the one to type; the rate follows it (and can still be typed)
    <MoneyBox
      quiet
      value={draft.unitGst}
      maxDigits={6}
      onChange={(v) => setFigure("unitGst", v)}
      label={rateLabel}
    />
  );
  const priceBox = (
    // the cursor starts here whenever the card opens
    <MoneyBox
      autoFocus
      value={draft.priceGst}
      maxDigits={7}
      onChange={(v) => setFigure("priceGst", v)}
      label={sale ? t("priceGst") : t("costGst")}
    />
  );
  // the quantity box, and under it what more was typed than there is (cut to it) and what has moved
  const quantityBox = (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <QuantityBox
        value={draft.quantity}
        onChange={(v, cut) => {
          if (cut) over.nudge();
          setDraft((d) => ({ ...d, quantity: v }));
        }}
        name={name}
        max={most}
        min={moved}
      />
      {sale && over.shown > 0 && (
        <FieldMessage key={over.shown} tone="warning" className="mt-0">
          {t("onlyAvailable", { n: most.toLocaleString("en-IN") })}
        </FieldMessage>
      )}
      {moved > 0 && (
        <span className="text-xs opacity-70">
          {t(sale ? "goneOut" : "arrived", { n: moved.toLocaleString("en-IN") })}
        </span>
      )}
    </div>
  );

  // straight on the page's body, so the step card's own layer can't put the header or bottom bar over it
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
        {/* pack chip on top; on the right, for one already on the order (none of it moved yet) a bin (takes it off),
            then ✕ */}
        <div className="flex justify-between">
          <span className="tabular inline-flex min-h-8 w-fit items-center rounded-control border border-chestnut bg-chestnut px-2.5 text-xs font-semibold text-ivory">
            {packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}
          </span>
          <span className="flex items-center">
            {saved && moved === 0 && (
              <button
                type="button"
                onClick={() => {
                  removeLine(pack.productId);
                  close();
                }}
                aria-label={t("removeFromOrder")}
                title={t("removeFromOrder")}
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
          <p
            className="truncate font-heading text-base font-bold leading-6"
            title={productTitle(group)}
          >
            {productTitle(group)}
          </p>
          <p className="truncate text-xs opacity-70">
            {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
          </p>
        </div>
        <ProductImage group={group} imageUrl={pack.imageUrl} className="size-40 self-center" />

        {/* a purchase: what this pack size cost on its last purchases */}
        {!sale && <CostChart productId={pack.productId} />}

        <div className="mt-1 flex flex-col gap-3">
          {/* the figures: a sale has the saved ones beside this order's; a purchase, only this order's costs */}
          <FiguresTable
            headings={{
              basis: t("basis"),
              current: sale ? t("current") : undefined,
              new: t("new"),
            }}
            rows={[
              {
                key: "rate",
                label: rateLabel,
                current: listPrice == null ? "–" : rupees(round2(listPrice / unitsIn(pack))),
                input: rateBox,
              },
              {
                key: "price",
                label: sale ? t("priceGst") : t("costGst"),
                current: listPrice == null ? "–" : rupees(listPrice),
                input: priceBox,
              },
              {
                key: "quantity",
                label: t("quantity"),
                current: available.toLocaleString("en-IN"),
                input: quantityBox,
                top: true,
              },
            ]}
          />

          {/* the line's total: Price + GST × quantity */}
          <div className="flex items-baseline justify-between border-t border-chestnut/12 pt-2.5">
            <span className="text-sm">{t("lineTotal")}</span>
            <b className="tabular font-heading text-2xl font-extrabold leading-[1.15]">
              {total > 0 ? rupees(total / 100) : "–"}
            </b>
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
        </div>
      </section>
    </div>,
    document.body,
  );
}
