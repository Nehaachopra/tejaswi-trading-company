"use client";

import { Check, ChevronDown, ChevronLeft, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_TRIGGER } from "~/components/ui/page-styles";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../../product/products/product-tile";
import { SCROLL_BOX, TILE_GRID } from "../shared/cart-button";
import { CartTotalRow } from "../shared/cart-cards";
import { DrawingCartButton, DrawingCartCards } from "./cart-button";
import { LineCard } from "./line-card";
import { useDrawingEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// the Products card, as a sale's: the Items | Total row with the cart icon and its › beside it (slides to the cart);
// every pack size not in the cart that can be taken (free stock, a cost and a GST %), filtered by category, in a grid
// scrolled up and down between the top and Next; each tile with how many packs are free under the photo, where Add
// opens the line card
export function ProductsCard() {
  const { ts: t, products, categories, lines, goodsTotal, cardFor, takeable } = useDrawingEntry();

  // the two panels, as in the line card: the products, and the cart to their right (the cart's › slides to it,
  // ‹ Products back); as tall as the one showing, the other kept out of reach. The last item taken out: back to the products
  const [pane, setPane] = useState<"products" | "cart">("products");
  const productsRef = useRef<HTMLDivElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const shown = pane === "products" ? productsRef.current : cartRef.current;
    if (!shown) return;
    const fit = () => setHeight(shown.offsetHeight);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(shown);
    return () => watch.disconnect();
  }, [pane]);
  useEffect(() => {
    if (lines.length === 0) setPane("products");
  }, [lines.length]);

  // the filters for the products below: only the categories (and sub-categories) with something that can be taken
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const inStock = (catId: string, subId?: string) =>
    products.some((g) => g.categoryId === catId && (!subId || g.subCategoryId === subId) && g.packs.some(takeable));
  const shownCategories = categories.filter((c) => inStock(c.id));
  const category = shownCategories.find((c) => c.id === categoryId);
  const subs = (category?.subCategories ?? []).filter((s) => inStock(category!.id, s.id));

  // the products with a pack size not yet in the cart that can be taken
  const taken = new Set(lines.map((l) => l.productId));
  const rest = products
    .filter((g) => (!categoryId || g.categoryId === categoryId) && (!subCategoryId || g.subCategoryId === subCategoryId))
    .map((g) => ({ ...g, packs: g.packs.filter((p) => !taken.has(p.productId) && takeable(p)) }))
    .filter((g) => g.packs.length > 0);
  const anyTakeable = products.some((g) => g.packs.some(takeable));

  // the filters: category, then its sub-categories; an open list sits under its filter and pushes the products down
  const filters = (
    <div className="flex items-start gap-2 overflow-x-auto [scrollbar-width:none]">
      <Menu
        label={t("category")}
        surface="ivory"
        align="left"
        boxed
        inFlow
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
            ...shownCategories.map((c) => ({ id: c.id, name: titleCase(c.name) })),
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
        inFlow
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

  return (
    <div className="flex flex-col gap-4">
      {/* the top, which stays put: the Total row (Items | Total), and beside it the cart icon with its › (slides to the
          cart), or while the cart shows ‹ Products in its place (slides back) */}
      <div className="-mb-2 flex items-center gap-3">
        <CartTotalRow count={lines.length} itemsTotal={goodsTotal} hold={cardFor !== null} className="flex-1" />
        {pane === "products" ? (
          <DrawingCartButton onSlide={() => setPane("cart")} />
        ) : (
          <button
            type="button"
            onClick={() => setPane("products")}
            // as quiet as the cart button it stands in for
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-control border border-chestnut/60 px-3 text-sm font-semibold transition-colors hover:border-chestnut"
          >
            <ChevronLeft className="-ml-1 size-4.5 shrink-0" aria-hidden />
            {t("products")}
          </button>
        )}
      </div>

      {/* the panels: the products, and the cart to their right */}
      <div className="-mx-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
        <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", pane === "cart" && "-translate-x-1/2")}>
          {/* the products: the heading, the filters, then the tiles, scrolled up and down between the top and Next */}
          <div ref={productsRef} inert={pane !== "products"} className="flex w-1/2 min-w-0 flex-col gap-4 px-1">
            <h3 className={cn(heading, "-mb-2 min-w-0 truncate")}>{t("products")}</h3>
            {filters}
            <div className={SCROLL_BOX}>
              {rest.length === 0 ? (
                <p className="py-6 text-center text-sm opacity-70">
                  {!anyTakeable ? t("noProducts") : lines.length > 0 ? t("allInCart") : t("noMatch")}
                </p>
              ) : (
                <ul className={TILE_GRID}>
                  {rest.map((group) => (
                    <DrawingTile key={group.key} group={group} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* the cart: its cards, scrolled up and down */}
          <div ref={cartRef} inert={pane !== "cart"} className="flex w-1/2 min-w-0 flex-col gap-3 px-1">
            <div className={SCROLL_BOX}>
              <DrawingCartCards />
            </div>
          </div>
        </div>
      </div>

      {/* the line card, over the page, for the pack size being added or changed */}
      <LineCard />
    </div>
  );
}

// a product with pack sizes that can be taken: its chips, name and photo (shorter on a phone); under the photo how
// many packs are free, on chestnut ("12 packs", the word small and muted); then Add, which opens the line card
function DrawingTile({ group }: { group: ProductGroup }) {
  const { ts, setCardFor, freeOf } = useDrawingEntry();
  const [picked, setPicked] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === picked) ?? group.packs[0]!;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:p-3.5">
      <TileTop group={group} pack={pack} onPack={setPicked} phoneShort />
      <span className="tabular mt-auto flex w-full items-baseline justify-center gap-1 truncate rounded-lg bg-chestnut py-1 text-ivory">
        <span className="font-heading text-xl font-semibold">{freeOf(pack).toLocaleString("en-IN")}</span>
        <span className="text-xs opacity-70">{ts("packsWord", { n: freeOf(pack) })}</span>
      </span>
      <button
        type="button"
        onClick={() => setCardFor(pack.productId)}
        className="flex w-full items-center justify-center gap-2 rounded-control border border-chestnut/35 p-2 text-xs font-semibold hover:bg-chestnut/[0.06]"
      >
        <Plus className="size-4.5" aria-hidden /> {ts("add")}
      </button>
    </li>
  );
}
