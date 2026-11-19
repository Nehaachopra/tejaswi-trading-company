"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { packLabel, rupees, titleCase } from "~/lib/format";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../../product/products/product-tile";
import { type CartRow } from "./cart-table";
import { TileRow } from "./tile-row";

// the products row's look: cards side by side, swiped sideways
const ROW = "-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:gap-3";

// what's in the cart as a row of cards, as the products row below it: each card its pack chip and a red bin on top,
// the name and category | sub-category, the photo, then the price (Rate on a purchase) and Quantity, a row each; a tap
// on a card opens its product card to change it. Under the row, the Total row as the cart table's: how many, and the
// cart's total
export function CartCards({
  lines,
  packOf,
  priceLabel,
  itemsTotal,
  onOpen,
  onRemove,
  moreLabel,
  backLabel,
}: {
  lines: CartRow[];
  packOf: (id: string) => { group: ProductGroup; pack: Pack } | null;
  priceLabel: string;
  itemsTotal: number;
  onOpen: (productId: string) => void;
  onRemove: (productId: string) => void;
  moreLabel: string;
  backLabel: string;
}) {
  const t = useTranslations("transactions.sale");
  return (
    <div className="flex flex-col gap-2">
      <TileRow className={ROW} moreLabel={moreLabel} backLabel={backLabel}>
        {lines.map((line) => {
          const found = packOf(line.productId);
          if (!found) return null;
          const { group, pack } = found;
          const label = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
          return (
            <li
              key={line.productId}
              onClick={() => onOpen(line.productId)}
              className="row-arrive flex w-40 shrink-0 cursor-pointer snap-start flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 hover:bg-chestnut/[0.03] sm:w-52 sm:p-3.5"
            >
              {/* the pack chip (the card's button, for the keyboard) and the bin */}
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
              </div>

              {/* the name, then category | sub-category */}
              <div className="min-w-0">
                <p className="truncate font-heading text-base font-bold leading-6" title={productTitle(group)}>
                  {productTitle(group)}
                </p>
                <p className="truncate text-xs opacity-70">
                  {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
                </p>
              </div>
              <ProductImage group={group} imageUrl={pack.imageUrl} className="w-full" />

              {/* the price and how many, a row each under a line: name left, figure right */}
              <div className="tabular mt-auto flex flex-col gap-1 border-t border-chestnut/15 pt-2">
                <p className="flex items-baseline justify-between gap-2 text-xs">
                  <span>{priceLabel}</span>
                  <b className="truncate text-sm font-bold">{rupees(line.price)}</b>
                </p>
                <p className="flex items-baseline justify-between gap-2 text-xs">
                  <span>{t("quantity")}</span>
                  <b className="text-sm font-bold">{line.quantity.toLocaleString("en-IN")}</b>
                </p>
              </div>
            </li>
          );
        })}
      </TileRow>

      {/* the Total row: its name with how many beside it, and the cart's total */}
      <div className="tabular flex items-center justify-between gap-3 rounded-control bg-chestnut px-2.5 py-2.5 text-ivory">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {t("lineTotal")}
          <span className="grid h-5 min-w-5 place-items-center rounded-md bg-ivory px-1 text-xs font-semibold leading-none text-chestnut">{lines.length}</span>
        </span>
        <span className="whitespace-nowrap font-heading text-lg font-extrabold">{rupees(itemsTotal)}</span>
      </div>
    </div>
  );
}
