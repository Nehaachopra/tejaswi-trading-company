"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { packLabel, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import {
  type Pack,
  type ProductGroup,
  ProductImage,
  productTitle,
} from "../../product/products/product-tile";
import { type CartRow } from "./cart-table";
import { SlotNumber } from "./slot-number";

// the cards in rows of two (three wider), scrolled up and down inside (room at the sides for their edges)
const GRID =
  "-mx-1 grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto overscroll-contain px-1 py-0.5 [scrollbar-width:thin] sm:grid-cols-3 sm:gap-3";

// what's in the cart as cards, scrolled up and down: each card its pack chip, a pen and a red bin on top,
// the name and category | sub-category, the photo, then the price (Rate on a purchase) and Quantity, a row each; a tap
// on a card opens its product card to change it. Under them, the Total row: Items (how many) and Total (the
// cart's total) side by side, which stays put
export function CartCards({
  lines,
  packOf,
  priceLabel,
  itemsTotal,
  onOpen,
  onRemove,
  showTotal = true,
  detailRows,
  canRemove,
}: {
  lines: CartRow[];
  packOf: (id: string) => { group: ProductGroup; pack: Pack } | null;
  priceLabel: string;
  itemsTotal: number;
  onOpen: (productId: string) => void;
  onRemove: (productId: string) => void;
  // the Total row under the cards (left out where it already shows above them)
  showTotal?: boolean;
  // the rows under the photo in place of the price and quantity (a sale return's: Sold, Can return, Returning)
  detailRows?: (line: CartRow) => { key: string; label: string; value: string }[];
  // whether a card has the bin (a sale return's: only once something of it is coming back)
  canRemove?: (productId: string) => boolean;
}) {
  const t = useTranslations("transactions.sale");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ul className={GRID}>
        {lines.map((line) => {
          const found = packOf(line.productId);
          if (!found) return null;
          const { group, pack } = found;
          const label = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
          return (
            <li
              key={line.productId}
              onClick={() => onOpen(line.productId)}
              className="row-arrive flex min-w-0 cursor-pointer flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 hover:bg-chestnut/[0.03] sm:p-3.5"
            >
              {/* the pack chip (the card's button, for the keyboard), then the pen (change it) and the bin */}
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`${t("change")}: ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(line.productId);
                  }}
                  className="inline-flex min-h-7 shrink-0 items-center rounded-control bg-chestnut px-2.5 text-xs font-semibold text-ivory"
                >
                  {packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}
                </button>
                <span className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={`${t("change")}: ${label}`}
                    title={t("change")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(line.productId);
                    }}
                    className="grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  {(canRemove?.(line.productId) ?? true) && (
                    <button
                      type="button"
                      aria-label={`${t("remove")}: ${label}`}
                      title={t("remove")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(line.productId);
                      }}
                      className="grid size-8 shrink-0 place-items-center rounded-control text-danger hover:bg-danger/[0.08]"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </span>
              </div>

              {/* the name, then category | sub-category */}
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
              {/* the photo as tall as the product tiles' (shorter on a phone) */}
              <ProductImage group={group} imageUrl={pack.imageUrl} className="w-full max-sm:h-24 max-sm:grid-rows-[100%] max-sm:aspect-auto!" />

              {/* the price and how many, a row each under a line: name left, figure right */}
              <div className="tabular mt-auto flex flex-col gap-1 border-t border-chestnut/15 pt-2">
                {(
                  detailRows?.(line) ?? [
                    { key: "price", label: priceLabel, value: rupees(line.price) },
                    { key: "quantity", label: t("quantity"), value: line.quantity.toLocaleString("en-IN") },
                  ]
                ).map((r) => (
                  <p key={r.key} className="flex items-baseline justify-between gap-2 text-xs">
                    <span>{r.label}</span>
                    <b className="truncate text-sm font-bold">{r.value}</b>
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {showTotal && <CartTotalRow count={lines.length} itemsTotal={itemsTotal} />}
    </div>
  );
}

// the Total row: Items with how many (only as wide as it needs), and Total with the cart's total, side by side; under
// the cart cards, and above a purchase's Products heading
// `hold`: a line card is open over it, so the count rolls only once that's closed
export function CartTotalRow({
  count,
  itemsTotal,
  hold = false,
  className,
}: {
  count: number;
  itemsTotal: number;
  hold?: boolean;
  className?: string;
}) {
  const t = useTranslations("transactions.sale");
  return (
    <div className={cn("tabular grid shrink-0 grid-cols-[auto_minmax(0,1fr)] rounded-control bg-chestnut text-ivory", className)}>
      <p className="flex items-baseline gap-3 px-2.5 py-2.5">
        <span className="text-sm font-semibold">{t("items")}</span>
        {/* the count rolls like a slot machine when an item goes in or out */}
        <SlotNumber value={count} hold={hold} className="font-heading text-lg font-extrabold" />
      </p>
      <p className="flex min-w-0 items-baseline justify-between gap-2 border-l border-ivory/25 px-2.5 py-2.5">
        <span className="text-sm font-semibold">{t("lineTotal")}</span>
        <span className="truncate whitespace-nowrap font-heading text-lg font-extrabold">{rupees(itemsTotal)}</span>
      </p>
    </div>
  );
}
