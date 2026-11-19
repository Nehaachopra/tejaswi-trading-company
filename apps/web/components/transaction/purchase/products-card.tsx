"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_TRIGGER } from "~/components/ui/page-styles";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../../product/products/product-tile";
import { NewProductCard } from "../order/new/new-product-card";
import { CartTable } from "../shared/cart-table";
import { ProductCard } from "./product-card";
import { usePurchaseEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// the products in one row, swiped sideways
const TILE_ROW = "-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:gap-3";

// the Products card, as the sale's: on top, what's in the cart as a table; below, every other pack size that can be
// bought (it has a GST %), filtered by category, in one row; each tile its name, photo and Add, which opens the
// product card. The admin's + New product sits beside the heading, as quiet as the filters
export function ProductsCard() {
  const { t, ts, isAdmin, products, categories, lines, figures, packOf, itemsTotal, setCardFor, removeLine, buyable } = usePurchaseEntry();
  const [adding, setAdding] = useState(false);

  // the filters for the products below
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const category = categories.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];

  // the products with a pack size not yet in the cart that can be bought
  const taken = new Set(lines.map((l) => l.productId));
  const rest = products
    .filter((g) => (!categoryId || g.categoryId === categoryId) && (!subCategoryId || g.subCategoryId === subCategoryId))
    .map((g) => ({ ...g, packs: g.packs.filter((p) => !taken.has(p.productId) && buyable(p)) }))
    .filter((g) => g.packs.length > 0);
  const anyBuyable = products.some((g) => g.packs.some(buyable));

  return (
    <div className="flex flex-col gap-4">
      {/* in the cart, as a table; until there's something, where to add from */}
      <div className="flex flex-col gap-2">
        <h3 className={heading}>{ts("inCart")}</h3>
        {lines.length === 0 ? (
          <p className="rounded-control border border-dashed border-chestnut/35 py-6 text-center text-sm opacity-80">{ts("addFromBelow")}</p>
        ) : (
          <CartTable
            lines={lines.map((l, i) => ({ productId: l.productId, price: figures[i]!.rate / 100, quantity: Number(l.quantity) || 0, total: figures[i]!.total / 100 }))}
            packOf={packOf}
            priceLabel={t("rate")}
            itemsTotal={itemsTotal}
            onOpen={setCardFor}
            onRemove={removeLine}
          />
        )}
      </div>

      <div className="border-t border-chestnut/15" aria-hidden />

      {/* the products: their heading with + New product beside it (on a phone too, so not full width), the filters,
          then the tiles */}
      <div className="-mb-2 flex items-center justify-between gap-2">
        <h3 className={heading}>{ts("products")}</h3>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              FILTER_TRIGGER,
              "flex min-h-10 shrink-0 items-center justify-center rounded-control border border-chestnut/60 text-chestnut transition-colors hover:border-chestnut",
            )}
          >
            <Plus className="size-4 shrink-0" aria-hidden /> {t("newProduct")}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
        <Menu
          label={ts("category")}
          surface="ivory"
          align="left"
          boxed
          floating
          triggerClassName={cn(FILTER_TRIGGER, "min-h-10 shrink-0 rounded-control", categoryId && "border-chestnut bg-chestnut text-ivory")}
          trigger={
            <>
              <span className="truncate">{category ? titleCase(category.name) : ts("allCategories")}</span>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </>
          }
        >
          {(close) =>
            [{ id: null, name: ts("allCategories") }, ...categories.map((c) => ({ id: c.id, name: titleCase(c.name) }))].map((c) => (
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
          label={ts("subCategory")}
          surface="ivory"
          align="left"
          boxed
          floating
          disabled={subs.length === 0}
          triggerClassName={cn(FILTER_TRIGGER, "min-h-10 shrink-0 rounded-control", subCategoryId && "border-chestnut bg-chestnut text-ivory")}
          trigger={
            <>
              <span className="truncate">{subs.find((s) => s.id === subCategoryId) ? titleCase(subs.find((s) => s.id === subCategoryId)!.name) : ts("allSubCategories")}</span>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </>
          }
        >
          {(close) =>
            [{ id: null, name: ts("allSubCategories") }, ...subs.map((s) => ({ id: s.id, name: titleCase(s.name) }))].map((s) => (
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

      {/* the products; the admin's last tile adds a new product (shown even when none is left to list), saved at once
          with no selling price, then its product card opens */}
      {rest.length === 0 && !isAdmin ? (
        <p className="py-6 text-center text-sm opacity-70">{!anyBuyable ? t("noProducts") : lines.length > 0 ? ts("allInCart") : ts("noMatch")}</p>
      ) : (
        <ul className={TILE_ROW}>
          {rest.map((group) => (
            <PurchaseTile key={group.key} group={group} />
          ))}
          {isAdmin && (
            <NewProductCard
              tileClassName="w-40 shrink-0 snap-start sm:w-52"
              open={adding}
              onOpen={() => setAdding(true)}
              onClose={() => setAdding(false)}
              onCreated={setCardFor}
            />
          )}
        </ul>
      )}

      {/* the product card, over the page, for the pack size being added or changed */}
      <ProductCard />
    </div>
  );
}

// a product to buy: its pack chips, name and photo, then Add (no price: the supplier's rate is typed on its card)
function PurchaseTile({ group }: { group: ProductGroup }) {
  const { ts, setCardFor } = usePurchaseEntry();
  const [picked, setPicked] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === picked) ?? group.packs[0]!;
  return (
    <li className="flex w-40 shrink-0 snap-start flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:w-52 sm:p-3.5">
      <TileTop group={group} pack={pack} onPack={setPicked} />
      <button
        type="button"
        onClick={() => setCardFor(pack.productId)}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-control border border-chestnut/35 p-2 text-xs font-semibold hover:bg-chestnut/[0.06]"
      >
        <Plus className="size-4.5" aria-hidden /> {ts("add")}
      </button>
    </li>
  );
}
