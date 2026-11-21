"use client";

import { Check, ChevronDown, ChevronRight, Plus, ShoppingCart } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_TRIGGER } from "~/components/ui/page-styles";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../../product/products/product-tile";
import { SCROLL_BOX, TILE_GRID } from "../shared/cart-button";
import { CartTotalRow } from "../shared/cart-cards";
import { SaleCartCards } from "./cart-button";
import { ProductCard } from "./product-card";
import { useSaleEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// the Products card, as the purchase's: the Items | Total row with the cart icon and its › beside it (slides to the cart);
// every pack size not in the cart that can be sold (priced, with free stock), filtered by category, in a grid scrolled
// up and down between the top and Next; each tile its price under the photo, where Add opens the product card. A
// dispatch on a sale order: first a From order part (the pack sizes the order still waits for, each with what's left
// to dispatch in place of its price), then Show other products, which opens the rest below it
export function ProductsCard() {
  const { t, products, categories, lines, itemsTotal, cardFor, sellable, order, orderLeft, next } = useSaleEntry();
  // the other products, opened from the button (always there on a sale of its own)
  const [othersOpen, setOthersOpen] = useState(false);

  // the two panels, as in the line card: the products, and the cart to their right (the cart's › slides to it, its
  // ‹ back); as tall as the one showing, the other kept out of reach. The last item taken out: back to the products
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

  // the filters for the products below
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  // only the categories (and sub-categories) with at least one pack size in stock to sell
  const inStock = (catId: string, subId?: string) =>
    products.some((g) => g.categoryId === catId && (!subId || g.subCategoryId === subId) && g.packs.some(sellable));
  const shownCategories = categories.filter((c) => inStock(c.id));
  const category = shownCategories.find((c) => c.id === categoryId);
  const subs = (category?.subCategories ?? []).filter((s) => inStock(category!.id, s.id));

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

      {/* the panels: the products, and the cart to their right */}
      <div className="-mx-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
        <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", pane === "cart" && "-translate-x-1/2")}>
          {/* the products: the heading, the filters, then the tiles */}
          <div ref={productsRef} inert={pane !== "products"} className="flex w-1/2 min-w-0 flex-col gap-4 px-1">
            {/* a sale of its own: the heading and filters above the box (a dispatch's sit inside it) */}
            {!order && (
              <>
                <h3 className={cn(heading, "-mb-2 min-w-0 truncate")}>{t("products")}</h3>
                {filters}
              </>
            )}

            {/* the products, scrolled up and down between the top and Next */}
            <div className={SCROLL_BOX}>
              {order ? (
                <>
                  {/* the From order part: its heading (with which order) stays at the box's top only while its own
                      tiles scroll under it; once the other products come up, their heading takes its place */}
                  <section className="flex flex-col gap-4">
                    <div className="sticky -top-0.5 z-10 -mx-1 flex min-w-0 justify-between gap-3 bg-ivory px-1 pb-2 pt-0.5">
                      <h3 className={heading}>{t("fromOrder")}</h3>
                      <span className="tabular truncate text-sm font-semibold">{order.orderId}</span>
                    </div>
                    {/* what the order still waits for */}
                    {fromOrder.length === 0 ? (
                      <p className="py-6 text-center text-sm opacity-70">{t("allOrderedInCart")}</p>
                    ) : (
                      <ul className={TILE_GRID}>
                        {fromOrder.map((group) => (
                          <SaleTile key={group.key} group={group} ordered />
                        ))}
                      </ul>
                    )}
                  </section>
                  {/* then the button that opens the other products */}
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
          </div>

          {/* the cart: its cards, scrolled up and down */}
          <div ref={cartRef} inert={pane !== "cart"} className="flex w-1/2 min-w-0 flex-col gap-3 px-1">
            <div className={SCROLL_BOX}>
              <SaleCartCards />
            </div>
          </div>
        </div>
      </div>

      {/* in Next's place, one button: Items | Total and Cart; a tap opens the Cart card */}
      <button
        type="button"
        data-recheck
        onClick={() => void next()}
        // Items | Total plain on the card, a soft edge round them; Cart on chestnut
        className="mt-2 flex w-full items-stretch overflow-hidden rounded-control text-left shadow-[0_0_5px_0] shadow-chestnut/40 transition-colors hover:shadow-chestnut/60"
      >
        <CartTotalRow count={lines.length} itemsTotal={itemsTotal} hold={cardFor !== null} plain className="flex-1" />
        <span className="flex shrink-0 items-center gap-2 bg-chestnut px-3 text-sm font-semibold text-ivory">
          <ShoppingCart className="size-4.5 shrink-0" aria-hidden />
          {t("cart")}
          <ChevronRight className="-ml-1 size-4.5 shrink-0" aria-hidden />
        </span>
      </button>

      {/* the product card, over the page, for the pack size being added or changed */}
      <ProductCard />
    </div>
  );
}

// a product with pack sizes to sell: its chips, name and photo; under the photo the picked pack size's price with GST
// on chestnut, in the middle; then Add, which opens the product card for that pack size. `ordered` (a pack size its
// order still waits for): how many packs are left to dispatch ("12 packs") in place of the price, and no Add while
// there's no stock to take
function SaleTile({ group, ordered = false }: { group: ProductGroup; ordered?: boolean }) {
  const { t, setCardFor, sellable, orderLeft } = useSaleEntry();
  const [picked, setPicked] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === picked) ?? group.packs[0]!;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:p-3.5">
      <TileTop group={group} pack={pack} onPack={setPicked} phoneShort />
      {/* its price with GST (an ordered one: what's left to dispatch), on chestnut, in the middle */}
      <div className="mt-auto flex flex-col items-center justify-center gap-2">
        <div className="tabular flex w-full items-baseline justify-center gap-1 truncate rounded-lg bg-chestnut py-1 text-ivory">
          {ordered ? (
            <>
              <span className="font-heading text-xl font-semibold">{orderLeft(pack.productId).toLocaleString("en-IN")}</span>
              {/* "packs", small and muted */}
              <span className="text-xs opacity-70">{t("packsWord", { n: orderLeft(pack.productId) })}</span>
            </>
          ) : (
            /* no saved price: – */
            <span className="font-heading text-xl font-semibold">{pack.priceAfterGst != null ? rupees(pack.priceAfterGst) : "–"}</span>
          )}
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
