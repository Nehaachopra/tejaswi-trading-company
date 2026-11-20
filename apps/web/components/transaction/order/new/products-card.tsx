"use client";

import { Check, ChevronDown, ChevronLeft, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_TRIGGER } from "~/components/ui/page-styles";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../../../product/products/product-tile";
import { CartTotalRow } from "../../shared/cart-cards";
import { SCROLL_BOX, TILE_GRID } from "../../shared/cart-button";
import { OrderCartButton, OrderCartCards } from "./cart-button";
import { LineCard } from "./line-card";
import { NewProductCard } from "./new-product-card";
import { useOrderEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// the Products card, as a purchase's: the Items | Total row with the cart icon and its › beside it (slides to the
// cart: the items on the order as cards, ‹ Products back); every other pack size, filtered by category, in a grid
// scrolled up and down between the top and Next, where Add opens the line card to put the picked pack size on the
// order; a purchase order's last tile adds a new product
export function ProductsCard() {
  const { t, kind, products, categories, lines, linesTotal, cardFor, setCardFor } = useOrderEntry();

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
              {subs.find((s) => s.id === subCategoryId)?.name
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
    </div>  );

  return (
    <div className="flex flex-col gap-4">
      {/* the top, which stays put: the Total row (Items | Total), and beside it the cart icon with its › (slides to the
          cart), or while the cart shows ‹ Products in its place (slides back) */}
      <div className="-mb-2 flex items-center gap-3">
        <CartTotalRow count={lines.length} itemsTotal={linesTotal} hold={cardFor !== null} className="flex-1" />
        {pane === "products" ? (
          <OrderCartButton onSlide={() => setPane("cart")} />
        ) : (
          <button
            type="button"
            onClick={() => setPane("products")}
            // as quiet as the cart button it stands in for
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-control border border-chestnut/60 px-3 text-sm font-semibold transition-colors hover:border-chestnut"
          >
            <ChevronLeft className="-ml-1 size-4.5 shrink-0" aria-hidden />
            {t("steps.products")}
          </button>
        )}
      </div>

      {/* the panels: the products, and the cart to their right */}
      <div className="-mx-1 overflow-hidden transition-[height] duration-300 motion-reduce:transition-none" style={{ height }}>
        <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", pane === "cart" && "-translate-x-1/2")}>
          {/* the products: the heading, the filters, then the tiles */}
          <div ref={productsRef} inert={pane !== "products"} className="flex w-1/2 min-w-0 flex-col gap-4 px-1">
            <h3 className={cn(heading, "-mb-2 min-w-0 truncate")}>{t("steps.products")}</h3>
            {filters}

            {/* the products, scrolled up and down between the top and Next; a purchase order's last tile adds a new
                product (shown even when none is left to list) */}
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
          </div>

          {/* the cart: the items on the order as cards, scrolled up and down */}
          <div ref={cartRef} inert={pane !== "cart"} className="flex w-1/2 min-w-0 flex-col gap-3 px-1">
            <div className={SCROLL_BOX}>
              <OrderCartCards />
            </div>
          </div>
        </div>
      </div>

      {/* the line card, over the page, for the pack size being added or changed */}
      <LineCard />
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
