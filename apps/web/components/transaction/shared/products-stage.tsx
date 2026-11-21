"use client";

import { ChevronDown, ChevronRight, Plus, ShoppingCart } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { FilterMenu } from "~/components/ui/filter-menu";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, TileTop } from "../../product/products/product-tile";
import { SCROLL_BOX, TILE_GRID } from "./cart-button";
import { CartTotalRow } from "./cart-cards";
import { NewProductCard } from "./new-product-card";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

type Category = { id: string; name: string; subCategories: { id: string; name: string }[] };

// the products stage shared by sale, purchase, sale order and purchase order: the category and sub-category filters (only
// those with something to list), the tiles of every pack size that can be listed and isn't in the cart, scrolled up
// and down, where Add opens the product details card (a purchase's last tile adds a new product); in Next's place one
// button, Items | Total and Cart, that goes on to the Cart card. From an order (a dispatch or an arrival): first a From
// order part (what the order still waits for, each tile with how many packs are left), then Show other products
export function ProductsStage({
  products,
  categories,
  canList,
  taken,
  onAdd,
  badge,
  canAdd = () => true,
  order = null,
  orderLeft = () => 0,
  newProduct = false,
  count,
  itemsTotal,
  onNext,
  noProducts,
  allTaken,
  orderDone,
  children,
}: {
  products: ProductGroup[];
  categories: Category[];
  // a pack size that can be listed at all (a sale: priced with free stock; a purchase: has a GST %)
  canList: (pack: Pack) => boolean;
  // the pack sizes already in the cart (not listed again)
  taken: Set<string>;
  onAdd: (productId: string) => void;
  // what a tile shows on chestnut under its photo (a sale's price); none: nothing
  badge?: (pack: Pack) => ReactNode;
  // whether a tile has Add (a sale's ordered pack with no stock: no)
  canAdd?: (pack: Pack) => boolean;
  // a dispatch or an arrival: which order, and how many packs of a pack size it still waits for
  order?: { orderId: string } | null;
  orderLeft?: (productId: string) => number;
  // the admin's purchase: the last tile adds a new product
  newProduct?: boolean;
  count: number;
  itemsTotal: number;
  onNext: () => void;
  // the empty notes: nothing to list at all, and everything listable already in the cart
  noProducts: string;
  allTaken: string;
  orderDone?: string;
  // the product details card
  children?: ReactNode;
}) {
  const t = useTranslations("transactions.sale");
  // the other products, opened from the button (always there without an order)
  const [othersOpen, setOthersOpen] = useState(false);
  // a purchase's new product card is open (from its tile)
  const [adding, setAdding] = useState(false);

  // the filters: only the categories (and sub-categories) with a pack size to list
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const has = (catId: string, subId?: string) =>
    products.some((g) => g.categoryId === catId && (!subId || g.subCategoryId === subId) && g.packs.some(canList));
  const shownCategories = categories.filter((c) => has(c.id));
  const category = shownCategories.find((c) => c.id === categoryId);
  const subs = (category?.subCategories ?? []).filter((s) => has(category!.id, s.id));

  // the products with a pack size to list that isn't in the cart (nor waited for by the order: those come first)
  const rest = products
    .filter((g) => (!categoryId || g.categoryId === categoryId) && (!subCategoryId || g.subCategoryId === subCategoryId))
    .map((g) => ({ ...g, packs: g.packs.filter((p) => !taken.has(p.productId) && canList(p) && orderLeft(p.productId) === 0) }))
    .filter((g) => g.packs.length > 0);
  const anyListed = products.some((g) => g.packs.some(canList));
  // the order's pack sizes still waited for and not yet in the cart, by product
  const fromOrder = order
    ? products
        .map((g) => ({ ...g, packs: g.packs.filter((p) => !taken.has(p.productId) && orderLeft(p.productId) > 0) }))
        .filter((g) => g.packs.length > 0)
    : [];

  // the filters: category, then its sub-categories; an open list sits under its filter and pushes the products down
  const filters = (
    <div className="flex items-start gap-2 overflow-x-auto [scrollbar-width:none]">
      <FilterMenu
        surface="ivory"
        label={t("category")}
        allLabel={t("allCategories")}
        value={categoryId}
        options={shownCategories.map((c) => ({ key: c.id, label: titleCase(c.name) }))}
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
  );

  // a tile's Add, as each transaction wants it
  const tile = (group: ProductGroup, ordered: boolean) => (
    <Tile key={group.key} group={group} ordered={ordered} orderLeft={orderLeft} badge={badge} canAdd={canAdd} onAdd={onAdd} />
  );

  // the products, in rows of two (three wider); a purchase's last tile adds a new product (shown even when none is
  // left to list), saved at once with no selling price, then its product details card opens
  const restGrid =
    rest.length === 0 && !newProduct ? (
      <p className="py-6 text-center text-sm opacity-70">
        {!anyListed ? noProducts : categoryId ? t("noMatch") : allTaken}
      </p>
    ) : (
      <ul className={TILE_GRID}>
        {rest.map((g) => tile(g, false))}
        {newProduct && (
          <NewProductCard tileClassName="min-w-0" open={adding} onOpen={() => setAdding(true)} onClose={() => setAdding(false)} onCreated={onAdd} />
        )}
      </ul>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* without an order: the heading and filters above the tiles (an order's sit inside the box) */}
      {!order && (
        <>
          <h3 className={cn(heading, "-mb-2 min-w-0 truncate")}>{t("products")}</h3>
          {filters}
        </>
      )}

      {/* the products, scrolled up and down between the top and the Cart button */}
      <div className={SCROLL_BOX}>
        {order ? (
          <>
            {/* the From order part: its heading (with which order) stays at the box's top only while its own tiles
                scroll under it; once the other products come up, their heading takes its place */}
            <section className="flex flex-col gap-4">
              <div className="sticky -top-0.5 z-10 -mx-1 flex min-w-0 justify-between gap-3 bg-ivory px-1 pb-2 pt-0.5">
                <h3 className={heading}>{t("fromOrder")}</h3>
                <span className="tabular truncate text-sm font-semibold">{order.orderId}</span>
              </div>
              {/* what the order still waits for */}
              {fromOrder.length === 0 ? (
                <p className="py-6 text-center text-sm opacity-70">{orderDone}</p>
              ) : (
                <ul className={TILE_GRID}>{fromOrder.map((g) => tile(g, true))}</ul>
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
                {/* the other products' heading and filters stay at the box's top while their tiles scroll under them */}
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

      {/* in Next's place, one button: Items | Total and Cart; a tap goes on to the Cart card */}
      <button
        type="button"
        data-recheck
        onClick={onNext}
        className="mt-2 flex w-full items-center justify-between overflow-hidden rounded-control bg-chestnut px-2 text-ivory shadow-[0_0_5px_0] shadow-chestnut/40 transition-colors hover:shadow-chestnut/60"
      >
        <CartTotalRow count={count} itemsTotal={itemsTotal} />
        <span className="flex shrink-0 items-center gap-3 px-2">
          <ShoppingCart className="size-5 shrink-0" aria-hidden />
          {t("cart")}
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </span>
      </button>

      {/* the product details card, over the page, for the pack size being added or changed */}
      {children}
    </div>
  );
}

// a product with pack sizes to list: its chips, name and photo (shorter on a phone); under the photo, on chestnut, what
// the transaction shows there (a sale's price), or for one its order waits for how many packs are left ("12 packs");
// then Add, which opens the product details card for the pack size picked (none: "No stock")
function Tile({
  group,
  ordered,
  orderLeft,
  badge,
  canAdd,
  onAdd,
}: {
  group: ProductGroup;
  ordered: boolean;
  orderLeft: (productId: string) => number;
  badge?: (pack: Pack) => ReactNode;
  canAdd: (pack: Pack) => boolean;
  onAdd: (productId: string) => void;
}) {
  const t = useTranslations("transactions.sale");
  const [picked, setPicked] = useState(group.packs[0]!.productId);
  const pack = group.packs.find((p) => p.productId === picked) ?? group.packs[0]!;
  const strip = ordered ? (
    <>
      <span className="font-heading text-xl font-semibold">{orderLeft(pack.productId).toLocaleString("en-IN")}</span>
      {/* "packs", small and muted */}
      <span className="text-xs opacity-70">{t("packsWord", { n: orderLeft(pack.productId) })}</span>
    </>
  ) : (
    badge?.(pack)
  );
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:p-3.5">
      <TileTop group={group} pack={pack} onPack={setPicked} phoneShort />
      <div className="mt-auto flex flex-col items-center justify-center gap-2">
        {strip != null && (
          <div className="tabular flex w-full items-baseline justify-center gap-1 truncate rounded-lg bg-chestnut py-1 text-ivory">{strip}</div>
        )}
        {canAdd(pack) ? (
          <button
            type="button"
            onClick={() => onAdd(pack.productId)}
            className="flex w-full items-center justify-center gap-2 rounded-control border border-chestnut/35 p-2 text-xs font-semibold hover:bg-chestnut/[0.06]"
          >
            <Plus className="size-4.5" aria-hidden /> {t("add")}
          </button>
        ) : (
          <span className="flex min-h-9 items-center text-xs font-semibold opacity-70">{t("noStock")}</span>
        )}
      </div>
    </li>
  );
}
