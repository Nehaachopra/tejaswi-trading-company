"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_TRIGGER } from "~/components/ui/page-styles";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../../product/products/product-tile";
import { CartTable } from "./cart-table";
import { ProductCard } from "./product-card";
import { useSaleEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// the Products card: on top, what's in the cart as a table; below, every other pack size that can be sold, filtered by
// category, each tile with its price under the photo, where Add opens the product card
export function ProductsCard() {
  const { t, products, categories, lines, sellable } = useSaleEntry();

  // the filters for the products below
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const category = categories.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];

  // the products with a pack size not yet in the cart that can be sold (priced, with free stock)
  const taken = new Set(lines.map((l) => l.productId));
  const rest = products
    .filter((g) => (!categoryId || g.categoryId === categoryId) && (!subCategoryId || g.subCategoryId === subCategoryId))
    .map((g) => ({ ...g, packs: g.packs.filter((p) => !taken.has(p.productId) && sellable(p)) }))
    .filter((g) => g.packs.length > 0);
  const anySellable = products.some((g) => g.packs.some(sellable));

  return (
    <div className="flex flex-col gap-4">
      {/* in the cart, as a table; until there's something, where to add from */}
      <div className="flex flex-col gap-2">
        <h3 className={heading}>{t("inCart")}</h3>
        {lines.length === 0 ? (
          <p className="rounded-control border border-dashed border-chestnut/35 py-6 text-center text-sm opacity-80">{t("addFromBelow")}</p>
        ) : (
          <CartTable />
        )}
      </div>

      <div className="border-t border-chestnut/15" aria-hidden />

      {/* the products: their heading, the filters, then the tiles */}
      <h3 className={cn(heading, "-mb-2")}>{t("products")}</h3>
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
        <Menu
          label={t("category")}
          surface="ivory"
          align="left"
          boxed
          floating
          triggerClassName={cn(FILTER_TRIGGER, "min-h-10 shrink-0 rounded-control", categoryId && "border-chestnut bg-chestnut text-ivory")}
          trigger={
            <>
              <span className="truncate">{category ? titleCase(category.name) : t("allCategories")}</span>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </>
          }
        >
          {(close) =>
            [{ id: null, name: t("allCategories") }, ...categories.map((c) => ({ id: c.id, name: titleCase(c.name) }))].map((c) => (
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
          triggerClassName={cn(FILTER_TRIGGER, "min-h-10 shrink-0 rounded-control", subCategoryId && "border-chestnut bg-chestnut text-ivory")}
          trigger={
            <>
              <span className="truncate">{subs.find((s) => s.id === subCategoryId) ? titleCase(subs.find((s) => s.id === subCategoryId)!.name) : t("allSubCategories")}</span>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </>
          }
        >
          {(close) =>
            [{ id: null, name: t("allSubCategories") }, ...subs.map((s) => ({ id: s.id, name: titleCase(s.name) }))].map((s) => (
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

      {rest.length === 0 ? (
        <p className="py-6 text-center text-sm opacity-70">{!anySellable ? t("noProducts") : lines.length > 0 ? t("allInCart") : t("noMatch")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {rest.map((group) => (
            <SaleTile key={group.key} group={group} />
          ))}
        </ul>
      )}

      {/* the product card, over the page, for the pack size being added or changed */}
      <ProductCard />
    </div>
  );
}

// a product with pack sizes to sell: its chips, name and photo; under the photo the picked pack size's price with GST
// on chestnut, in the middle; then Add, which opens the product card for that pack size
function SaleTile({ group }: { group: ProductGroup }) {
  const { t, setCardFor } = useSaleEntry();
  const [picked, setPicked] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === picked) ?? group.packs[0]!;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:p-3.5">
      <TileTop group={group} pack={pack} onPack={setPicked} />
      {/* its price with GST, on chestnut, in the middle */}
      <p className="tabular flex w-full items-center justify-center self-center truncate rounded-control bg-chestnut px-3 py-2 font-heading text-xl font-semibold text-ivory">
        <span className="sr-only">{t("priceGst")}: </span>
        {rupees(pack.priceAfterGst ?? 0)}
      </p>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setCardFor(pack.productId)}
        className="mt-auto flex min-h-9 w-full items-center justify-center gap-1.5 rounded-control border border-chestnut/35 text-xs font-semibold hover:bg-chestnut/[0.06]"
      >
        <Plus className="size-3.5" aria-hidden /> {t("add")}
      </button>
    </li>
  );
}
