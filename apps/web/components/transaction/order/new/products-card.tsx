"use client";

import { ChevronRight, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { FilterMenu } from "~/components/ui/filter-menu";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../../../product/products/product-tile";
import { CartTotalRow } from "../../shared/cart-cards";
import { SCROLL_BOX, TILE_GRID } from "../../shared/cart-button";
import { ProductDetailsCard } from "./product-details-card";
import { NewProductCard } from "../../shared/new-product-card";
import { useOrderEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// the Products card, as a sale's: the heading and filters, every other pack size in a grid scrolled up and down, where
// Add opens the line card to put the picked pack size on the order (a purchase order's last tile adds a new product);
// in Next's place one button, Items | Total and Cart, that opens the Cart card
export function ProductsCard() {
  const { t, kind, products, categories, lines, linesTotal, setCardFor, next } = useOrderEntry();

  // the filters for the products below
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const category = categories.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];
  // a purchase order's new product card is open (from its tile)
  const [adding, setAdding] = useState(false);

  // the products not yet (fully) on the order, each with only its pack sizes still off it
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
        // a sale offers only pack sizes with a selling price and stock free to order (not held for another order)
        (p) =>
          !taken.has(p.productId) &&
          (kind !== "sale" || (p.unreservedQuantity > 0 && p.priceAfterGst != null)),
      ),
    }))
    .filter((g) => g.packs.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* the heading, then the filters: category, then its sub-categories (an open list pushes the products down) */}
      <h3 className={cn(heading, "-mb-2 min-w-0 truncate")}>{t("steps.products")}</h3>
      <div className="flex items-start gap-2 overflow-x-auto [scrollbar-width:none]">
        <FilterMenu
          surface="ivory"
          label={t("category")}
          allLabel={t("allCategories")}
          value={categoryId}
          options={categories.map((c) => ({ key: c.id, label: titleCase(c.name) }))}
          onPick={(id) => {
            setCategoryId(id);
            setSubCategoryId(null);
          }}
        />
        <FilterMenu
          surface="ivory"
          label={t("subCategory")}
          allLabel={t("allSubCategories")}
          value={subCategoryId}
          options={subs.map((s) => ({ key: s.id, label: titleCase(s.name) }))}
          onPick={setSubCategoryId}
          disabled={subs.length === 0}
        />
      </div>

      {/* the products, scrolled up and down between the filters and the cart button; a purchase order's last tile adds
          a new product (shown even when none is left to list) */}
      <div className={SCROLL_BOX}>
        {rest.length === 0 && (
          <p className="py-6 text-center text-sm opacity-70">
            {products.length === 0 ? t("noProducts") : t("allOnOrder")}
          </p>
        )}
        {(rest.length > 0 || kind === "purchase") && (
          <ul className={TILE_GRID}>
            {rest.map((group) => (
              <RestTile key={group.key} group={group} onAdd={setCardFor} addLabel={t("add")} kind={kind} />
            ))}
            {kind === "purchase" && (
              <NewProductCard
                tileClassName="min-w-0"
                open={adding}
                onOpen={() => setAdding(true)}
                onClose={() => setAdding(false)}
                onCreated={setCardFor}
              />
            )}
          </ul>
        )}
      </div>

      {/* in Next's place, one button, as a sale's: Items | Total and Cart; a tap opens the Cart card */}
      <button
        type="button"
        data-recheck
        onClick={next}
        className="mt-2 flex w-full items-center justify-between overflow-hidden rounded-control bg-chestnut px-2 text-ivory shadow-[0_0_5px_0] shadow-chestnut/40 transition-colors hover:shadow-chestnut/60"
      >
        <CartTotalRow count={lines.length} itemsTotal={linesTotal} />
        <span className="flex shrink-0 items-center gap-3 px-2">
          <ShoppingCart className="size-5 shrink-0" aria-hidden />
          {t("cart")}
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </span>
      </button>

      {/* the line card, over the page, for the pack size being added or changed */}
      <ProductDetailsCard />
    </div>
  );
}

// a product not (fully) on the order: its pack chips, name and photo (shorter on a phone); a sale order's price with GST
// on chestnut under the photo (– with none saved); then Add, which opens the line card for the pack size picked
function RestTile({
  group,
  onAdd,
  addLabel,
  kind,
}: {
  group: ProductGroup;
  onAdd: (productId: string) => void;
  addLabel: string;
  kind: "sale" | "purchase" | null;
}) {
  const [picked, setPicked] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === picked) ?? group.packs[0]!;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:p-3.5">
      <TileTop group={group} pack={pack} onPack={setPicked} phoneShort />
      {kind === "sale" && (
        <span className="tabular mt-auto flex w-full justify-center truncate rounded-lg bg-chestnut py-1 font-heading text-xl font-semibold text-ivory">
          {pack.priceAfterGst != null ? rupees(pack.priceAfterGst) : "–"}
        </span>
      )}
      <button
        type="button"
        onClick={() => onAdd(pack.productId)}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-control border border-chestnut/35 p-2 text-xs font-semibold hover:bg-chestnut/[0.06]"
      >
        <Plus className="size-4.5" aria-hidden /> {addLabel}
      </button>
    </li>
  );
}
