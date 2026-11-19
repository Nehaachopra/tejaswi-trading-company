"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_TRIGGER } from "~/components/ui/page-styles";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../../product/products/product-tile";
import { SCROLL_BOX, TILE_GRID } from "../shared/cart-button";
import { SaleCartButton } from "./cart-button";
import { ProductCard } from "./product-card";
import { useSaleEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// the Products card, as the purchase's: the cart button (its total and count; opens the cart card) at the top right;
// every pack size not in the cart that can be sold (priced, with free stock), filtered by category, in a grid scrolled
// up and down between the top and Next; each tile its price under the photo, where Add opens the product card. A
// dispatch on a sale order: first a From order part (the pack sizes the order still waits for, each with what's left
// to dispatch in place of its price), then Show other products, which opens the rest below it
export function ProductsCard() {
  const { t, products, categories, lines, sellable, order, orderLeft } = useSaleEntry();
  // the other products, opened from the button (always there on a sale of its own)
  const [othersOpen, setOthersOpen] = useState(false);

  // the filters for the products below
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const category = categories.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];

  // the products with a pack size not yet in the cart that can be sold (priced, with free stock)
  const taken = new Set(lines.map((l) => l.productId));
  const rest = products
    .filter(
      (g) =>
        (!categoryId || g.categoryId === categoryId) &&
        (!subCategoryId || g.subCategoryId === subCategoryId),
    )
    .map((g) => ({
      ...g,
      packs: g.packs.filter(
        (p) => !taken.has(p.productId) && sellable(p) && orderLeft(p.productId) === 0,
      ),
    }))
    .filter((g) => g.packs.length > 0);
  const anySellable = products.some((g) => g.packs.some(sellable));
  // the order's pack sizes still waited for and not yet in the cart, by product
  const fromOrder = products
    .map((g) => ({
      ...g,
      packs: g.packs.filter((p) => !taken.has(p.productId) && orderLeft(p.productId) > 0),
    }))
    .filter((g) => g.packs.length > 0);

  // the filters: category, then its sub-categories
  const filters = (
    <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
      <Menu
        label={t("category")}
        surface="ivory"
        align="left"
        boxed
        floating
        triggerClassName={cn(
          FILTER_TRIGGER,
          "min-h-10 shrink-0 rounded-control",
          categoryId && "border-chestnut bg-chestnut text-ivory",
        )}
        trigger={
          <>
            <span className="truncate">
              {category ? titleCase(category.name) : t("allCategories")}
            </span>
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          </>
        }
      >
        {(close) =>
          [
            { id: null, name: t("allCategories") },
            ...categories.map((c) => ({ id: c.id, name: titleCase(c.name) })),
          ].map((c) => (
            <MenuItem
              key={c.id ?? "all"}
              selected={categoryId === c.id}
              onClick={() => {
                setCategoryId(c.id);
                setSubCategoryId(null);
                close();
              }}
            >
              <span className="flex-1">{c.name}</span>
              {categoryId === c.id && <Check className="size-4" aria-hidden />}
            </MenuItem>
          ))
        }
      </Menu>
      <Menu
        label={t("subCategory")}
        surface="ivory"
        align="left"
        boxed
        floating
        disabled={subs.length === 0}
        triggerClassName={cn(
          FILTER_TRIGGER,
          "min-h-10 shrink-0 rounded-control",
          subCategoryId && "border-chestnut bg-chestnut text-ivory",
        )}
        trigger={
          <>
            <span className="truncate">
              {subs.find((s) => s.id === subCategoryId)
                ? titleCase(subs.find((s) => s.id === subCategoryId)!.name)
                : t("allSubCategories")}
            </span>
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          </>
        }
      >
        {(close) =>
          [
            { id: null, name: t("allSubCategories") },
            ...subs.map((s) => ({ id: s.id, name: titleCase(s.name) })),
          ].map((s) => (
            <MenuItem
              key={s.id ?? "all"}
              selected={subCategoryId === s.id}
              onClick={() => {
                setSubCategoryId(s.id);
                close();
              }}
            >
              <span className="flex-1">{s.name}</span>
              {subCategoryId === s.id && <Check className="size-4" aria-hidden />}
            </MenuItem>
          ))
        }
      </Menu>
    </div>
  );

  // the products, in rows of two (three wider)
  const restGrid =
    rest.length === 0 ? (
      <p className="py-6 text-center text-sm opacity-70">
        {!anySellable ? t("noProducts") : lines.length > 0 ? t("allInCart") : t("noMatch")}
      </p>
    ) : (
      <ul className={TILE_GRID}>
        {rest.map((group) => (
          <SaleTile key={group.key} group={group} />
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* the top, which stays put: the heading (From order with which order, or Products), the cart button, and on a
          sale of its own the filters */}
      {order ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h3 className={heading}>{t("fromOrder")}</h3>
            <span className="tabular truncate text-sm font-semibold">{order.orderId}</span>
          </div>
          <SaleCartButton />
        </div>
      ) : (
        <>
          <div className="-mb-2 flex items-center justify-between gap-2">
            <h3 className={cn(heading, "min-w-0 truncate")}>{t("products")}</h3>
            <SaleCartButton />
          </div>
          {filters}
        </>
      )}

      {/* the products, scrolled up and down between the top and Next */}
      <div className={SCROLL_BOX}>
        {order ? (
          <>
            {/* what the order still waits for, then the button that opens the other products */}
            {fromOrder.length === 0 ? (
              <p className="py-6 text-center text-sm opacity-70">{t("allOrderedInCart")}</p>
            ) : (
              <ul className={TILE_GRID}>
                {fromOrder.map((group) => (
                  <SaleTile key={group.key} group={group} ordered />
                ))}
              </ul>
            )}
            {!othersOpen ? (
              <button
                type="button"
                onClick={() => setOthersOpen(true)}
                // small, with ⌄ (they open below): the full width on a phone, its own width wider
                className="flex min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-control border border-chestnut/35 px-4 text-xs font-semibold hover:bg-chestnut/[0.06] sm:w-auto sm:self-center"
              >
                <ChevronDown className="size-4 shrink-0" aria-hidden />
                {t("showOthers")}
              </button>
            ) : (
              <>
                {/* the other products' heading and filters stay at the box's top while their tiles scroll under them
                    (a line above them, the card's ivory behind them) */}
                <div className="sticky -top-0.5 z-10 -mx-1 flex flex-col gap-2 border-t border-chestnut/15 bg-ivory px-1 pb-2 pt-4">
                  <h3 className={cn(heading, "min-w-0 truncate")}>{t("products")}</h3>
                  {filters}
                </div>
                {restGrid}
              </>
            )}
          </>
        ) : (
          restGrid
        )}
      </div>

      {/* the product card, over the page, for the pack size being added or changed */}
      <ProductCard />
    </div>
  );
}

// a product with pack sizes to sell: its chips, name and photo; under the photo the picked pack size's price with GST
// on chestnut, in the middle; then Add, which opens the product card for that pack size. `ordered` (a pack size its
// order still waits for): what's left to dispatch in place of the price, and no Add while there's no stock to take
function SaleTile({ group, ordered = false }: { group: ProductGroup; ordered?: boolean }) {
  const { t, setCardFor, sellable, orderLeft } = useSaleEntry();
  const [picked, setPicked] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === picked) ?? group.packs[0]!;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:p-3.5">
      <TileTop group={group} pack={pack} onPack={setPicked} />
      {ordered && <span className="mt-auto text-xs">{t("leftToPlace")}</span>}
      {/* its price with GST (an ordered one: what's left to dispatch), on chestnut, in the middle */}
      <div className="flex flex-col items-center justify-center gap-2">
        <div className="tabular flex w-full justify-center truncate rounded-lg bg-chestnut py-1 font-heading text-xl font-semibold text-ivory">
          {ordered
            ? orderLeft(pack.productId).toLocaleString("en-IN")
            : rupees(pack.priceAfterGst ?? 0)}
        </div>

        {sellable(pack) ? (
          <button
            type="button"
            onClick={() => setCardFor(pack.productId)}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-control border border-chestnut/35 p-2 text-xs font-semibold hover:bg-chestnut/[0.06]"
          >
            <Plus className="size-4.5" aria-hidden /> {t("add")}
          </button>
        ) : (
          <span className="flex min-h-9 items-center text-xs font-semibold opacity-70">
            {t("noStock")}
          </span>
        )}
      </div>
    </li>
  );
}
