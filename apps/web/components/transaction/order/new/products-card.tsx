"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_TRIGGER } from "~/components/ui/page-styles";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../../../product/products/product-tile";
import { LineCard } from "./line-card";
import { NewProductCard } from "./new-product-card";
import { OrderTable } from "./order-table";
import { useOrderEntry } from "./state";

// a part's small heading on the card
const heading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// the Products card: on top, the items on the order in one row that scrolls sideways; below, every other pack size,
// filtered by category, where Add opens the line card to put the picked pack size on the order
export function ProductsCard() {
  const { t, kind, products, categories, lines, setCardFor } = useOrderEntry();

  // the filters for the products below
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const category = categories.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];
  // a purchase order's new product card is open (from the card itself or + New product above)
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
      {/* the items on the order, as a table; until there's one, where to add them from */}
      <div className="flex flex-col gap-2">
        <p className={heading}>{t("onOrder")}</p>
        {lines.length === 0 ? (
          <p className="rounded-control border border-dashed border-chestnut/35 py-6 text-center text-sm opacity-80">
            {t("addFromBelow")}
          </p>
        ) : (
          <OrderTable />
        )}
      </div>

      <div className="border-t border-chestnut/15" aria-hidden />

      {/* the products: their heading with a purchase order's + New product beside it (on a phone too, so not full
          width), the filters, then every other pack size */}
      <div className="-mb-2 flex items-center justify-between gap-2">
        <h3 className={heading}>{t("steps.products")}</h3>
        {kind === "purchase" && (
          // as quiet as the filter buttons under it (their outline, ink and size), so the filters stay first
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
      </div>

      {rest.length === 0 && (
        <p className="py-6 text-center text-sm opacity-70">
          {products.length === 0 ? t("noProducts") : t("allOnOrder")}
        </p>
      )}
      {/* the products; a purchase order's last card adds a new product (shown even when none is left to list) */}
      {(rest.length > 0 || kind === "purchase") && (
        // every row as tall as the tallest, so the + New product card is a product card's height even alone on its row
        <ul className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {rest.map((group) => (
            <RestTile
              key={group.key}
              group={group}
              onAdd={setCardFor}
              addLabel={t("add")}
              kind={kind}
            />
          ))}
          {kind === "purchase" && (
            <NewProductCard
              open={adding}
              onOpen={() => setAdding(true)}
              onClose={() => setAdding(false)}
              onCreated={setCardFor}
            />
          )}
        </ul>
      )}

      {/* the line card, over the page, for the pack size being added or changed */}
      <LineCard />

    </div>
  );
}

// a product not (fully) on the order: Add under the photo opens the line card for the pack size picked on its chips (the first
// to start)
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
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-chestnut/15 p-3.5">
      <TileTop group={group} pack={pack} onPack={setPicked} />
      {/* under the photo: open the line card for the pack size picked */}
      {kind === "sale" ? (
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="flex w-full justify-center bg-chestnut rounded-lg py-1 tabular truncate font-heading text-xl font-semibold text-ivory">
            {rupees(pack.priceAfterGst ?? 0)}
          </div>

          <button
        type="button"
        onClick={() => onAdd(pack.productId)}
        className="mt-auto flex w-full p-2 items-center justify-center gap-2 rounded-control border border-chestnut/35 text-xs font-semibold hover:bg-chestnut/[0.06]"
      >
        <Plus className="size-5" aria-hidden /> {addLabel}
      </button>
        </div>
      ): <button
        type="button"
        onClick={() => onAdd(pack.productId)}
        className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-control border border-chestnut/35 text-xs font-semibold p-2 hover:bg-chestnut/[0.06]"
      >
        <Plus className="size-5" aria-hidden /> {addLabel}
      </button>}
    </li>
  );
}
