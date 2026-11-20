"use client";

import { Check, ChevronDown, ChevronLeft, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_TRIGGER } from "~/components/ui/page-styles";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../../product/products/product-tile";
import { NewProductCard } from "../order/new/new-product-card";
import { SCROLL_BOX, TILE_GRID } from "../shared/cart-button";
import { CartTotalRow } from "../shared/cart-cards";
import { PurchaseCartButton, PurchaseCartCards } from "./cart-button";
import { ProductCard } from "./product-card";
import { usePurchaseEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// the Products card: the cart button (its total and count; opens the cart card) at the top right; every pack size not
// in the cart that can be bought (it has a GST %), filtered by category, in one row; each tile its name, photo and Add,
// which opens the product card. The admin's + New product sits beside the heading, as quiet as the filters. An arrival
// on a purchase order: first a From order part (the pack sizes the order still waits for, each with what's left to
// arrive), then Show other products, which opens the rest below it
export function ProductsCard() {
  const { t, ts, isAdmin, products, categories, lines, itemsTotal, setCardFor, buyable, order, orderLeft } =
    usePurchaseEntry();
  const [adding, setAdding] = useState(false);
  // the other products, opened from the button (always there on a purchase of its own)
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
  const category = categories.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];

  // the products with a pack size not yet in the cart that can be bought
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
        (p) => !taken.has(p.productId) && buyable(p) && orderLeft(p.productId) === 0,
      ),
    }))
    .filter((g) => g.packs.length > 0);
  const anyBuyable = products.some((g) => g.packs.some(buyable));
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
        label={ts("category")}
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
              {category ? titleCase(category.name) : ts("allCategories")}
            </span>
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          </>
        }
      >
        {(close) =>
          [
            { id: null, name: ts("allCategories") },
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
        label={ts("subCategory")}
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
                : ts("allSubCategories")}
            </span>
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          </>
        }
      >
        {(close) =>
          [
            { id: null, name: ts("allSubCategories") },
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

  // the admin's + New product, beside the heading (on a phone too, so not full width), as quiet as the filters
  const newProduct = isAdmin && (
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
  );

  // the products, in rows of two (three wider); the admin's last tile adds a new product (shown even when none is left
  // to list), saved at once with no selling price, then its product card opens
  const restGrid =
    rest.length === 0 && !isAdmin ? (
      <p className="py-6 text-center text-sm opacity-70">
        {!anyBuyable ? t("noProducts") : lines.length > 0 ? ts("allInCart") : ts("noMatch")}
      </p>
    ) : (
      <ul className={TILE_GRID}>
        {rest.map((group) => (
          <PurchaseTile key={group.key} group={group} />
        ))}
        {isAdmin && (
          <NewProductCard
            tileClassName="min-w-0"
            open={adding}
            onOpen={() => setAdding(true)}
            onClose={() => setAdding(false)}
            onCreated={setCardFor}
          />
        )}
      </ul>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* the top, which stays put: the Total row (Items | Total), and beside it the cart icon with its › (slides to the
          cart), or while the cart shows ‹ Products in its place (slides back) */}
      <div className="-mb-2 flex items-center gap-3">
        <CartTotalRow count={lines.length} itemsTotal={itemsTotal} className="flex-1" />
        {pane === "products" ? (
          <PurchaseCartButton onSlide={() => setPane("cart")} />
        ) : (
          <button
            type="button"
            onClick={() => setPane("products")}
            // as quiet as the cart button it stands in for
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-control border border-chestnut/60 px-3 text-sm font-semibold transition-colors hover:border-chestnut"
          >
            <ChevronLeft className="-ml-1 size-4.5 shrink-0" aria-hidden />
            {ts("products")}
          </button>
        )}
      </div>

      {/* the panels: the products, and the cart to their right */}
      <div className="-mx-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
        <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", pane === "cart" && "-translate-x-1/2")}>
          {/* the products: the heading, the filters, then the tiles */}
          <div ref={productsRef} inert={pane !== "products"} className="flex w-1/2 min-w-0 flex-col gap-4 px-1">
            {order ? (
              <div className="flex min-w-0 flex-col">
                <h3 className={heading}>{ts("fromOrder")}</h3>
                <span className="tabular truncate text-sm font-semibold">{order.orderId}</span>
              </div>
            ) : (
              <>
                <h3 className={cn(heading, "-mb-2 min-w-0 truncate")}>{ts("products")}</h3>
                {filters}
              </>
            )}

            {/* the products, scrolled up and down between the top and Next */}
            <div className={SCROLL_BOX}>
              {order ? (
                <>
                  {/* what the order still waits for, then the button that opens the other products */}
                  {fromOrder.length === 0 ? (
                    <p className="py-6 text-center text-sm opacity-70">{t("noMoreFromOrder")}</p>
                  ) : (
                    <ul className={TILE_GRID}>
                      {fromOrder.map((group) => (
                        <PurchaseTile key={group.key} group={group} ordered />
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
                      {ts("showOthers")}
                    </button>
                  ) : (
                    <>
                      {/* the other products' heading and filters stay at the box's top while their tiles scroll under them
                          (a line above them, the card's ivory behind them) */}
                      <div className="sticky -top-0.5 z-10 -mx-1 flex flex-col gap-2 border-t border-chestnut/15 bg-ivory px-1 pb-2 pt-4">
                        {newProduct && <div className="flex justify-end">{newProduct}</div>}
                        <h3 className={cn(heading, "min-w-0 truncate")}>{ts("products")}</h3>
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
              <PurchaseCartCards />
            </div>
          </div>
        </div>
      </div>

      {/* the product card, over the page, for the pack size being added or changed */}
      <ProductCard />
    </div>
  );
}

// a product to buy: its pack chips, name and photo, then Add (no price: the supplier's rate is typed on its card).
// `ordered` (a pack size its order still waits for): what's left to arrive, on chestnut, above Add
function PurchaseTile({ group, ordered = false }: { group: ProductGroup; ordered?: boolean }) {
  const { t, ts, setCardFor, orderLeft } = usePurchaseEntry();
  const [picked, setPicked] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === picked) ?? group.packs[0]!;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:w-52 sm:p-3.5">
      <TileTop group={group} pack={pack} onPack={setPicked} phoneShort />
      {ordered && (
        <div className="mt-auto flex flex-col gap-1">
          <span className="text-xs">{t("leftToArrive")}</span>
          <span className="tabular flex w-full justify-center truncate rounded-lg bg-chestnut py-1 font-heading text-xl font-semibold text-ivory">
            {orderLeft(pack.productId).toLocaleString("en-IN")}
          </span>
        </div>
      )}
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
