"use client";

import { Check, ChevronDown, CircleAlert, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { ProductTabs } from "../product-tabs";
import { chip } from "../row-styles";
import { NewProductSheet } from "./new-product-sheet";
import { ProductFormSheet } from "./product-form-sheet";
import { ProductSheet } from "./product-sheet";
import { type ProductGroup, ProductTile } from "./product-tile";

// every product as a tile, filtered by category and sub-category
export function ProductsBoard() {
  const t = useTranslations("products.items");

  // the filters: a category, then one of its sub-categories, and Show inactive
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false });
  const category = categories.data?.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];
  const sub = subs.find((s) => s.id === subCategoryId);

  // the products for those filters
  const list = trpc.inventory.product.list.useQuery({
    categoryId: categoryId ?? undefined,
    subCategoryId: subCategoryId ?? undefined,
    includeInactive: showInactive,
  });

  // the open product sheet, found again on every change: by any of its pack sizes (the key changes when
  // the brand or sub-category is edited), else by the key (when the pack shown was just hidden)
  const [open, setOpen] = useState<{ key: string; packIds: string[]; packId: string } | null>(null);
  const opened =
    (open && list.data?.find((g) => g.packs.some((p) => open.packIds.includes(p.productId)))) ??
    list.data?.find((g) => g.key === open?.key) ??
    null;
  // keep the remembered key and pack ids current, so the next lookup still finds it
  useEffect(() => {
    if (opened && open && opened.key !== open.key)
      setOpen({ ...open, key: opened.key, packIds: opened.packs.map((p) => p.productId) });
  }, [opened, open]);
  // the open forms: a new product, or more pack sizes for one
  const [adding, setAdding] = useState(false);
  const [addingPack, setAddingPack] = useState<ProductGroup | null>(null);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      {/* everything behind an open sheet is inert: no taps, focus or scrolling of tiles and filters */}
      <div inert={!!opened || adding || !!addingPack} className="contents">
        {/* the page's name, for screen readers only: the tabs say it visually */}
        <h1 className="sr-only">{t("title")}</h1>

        {/* Categories · Products, each with its count */}
        <ProductTabs />

        {/* Add product */}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ivory px-5 font-heading text-lg font-bold text-chestnut sm:w-auto"
        >
          <Plus className="size-5" aria-hidden /> {t("add")}
        </button>

        {/* filters on one line: the category and sub-category dropdowns, then Show inactive;
            they stick under the header while the tiles scroll */}
        <div className="sticky top-16 z-20 -mx-4 mt-2 flex flex-wrap items-center gap-2 bg-chestnut px-4 py-2 sm:-mx-6 sm:px-6">
          <Menu
            label={t("category")}
            surface="chestnut"
            align="left"
            triggerClassName="min-h-9 min-w-0 max-w-full px-4 text-sm"
            trigger={
              <>
                <span className="truncate">
                  {category ? titleCase(category.name) : t("allCategories")}
                </span>
                <ChevronDown className="size-4 shrink-0" aria-hidden />
              </>
            }
          >
            {(close) => (
              <>
                {[
                  { id: null, name: t("allCategories") },
                  ...(categories.data ?? []).map((c) => ({ id: c.id, name: titleCase(c.name) })),
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
                ))}
              </>
            )}
          </Menu>

          {/* sub-categories: only once a category with some is picked */}
          <Menu
            label={t("subCategory")}
            surface="chestnut"
            align="left"
            disabled={subs.length === 0}
            triggerClassName="min-h-9 min-w-0 max-w-full px-4 text-sm"
            trigger={
              <>
                <span className="truncate">
                  {sub ? titleCase(sub.name) : t("allSubCategories")}
                </span>
                <ChevronDown className="size-4 shrink-0" aria-hidden />
              </>
            }
          >
            {(close) => (
              <>
                {[
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
                ))}
              </>
            )}
          </Menu>

          <button
            type="button"
            aria-pressed={showInactive}
            onClick={() => setShowInactive((v) => !v)}
            className={chip(showInactive)}
          >
            {t("showInactive")}
          </button>
        </div>

        {/* the tiles: 2 across on phones, more on wider screens */}
        {list.isPending ? (
          <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
            <Spinner /> {t("loading")}
          </p>
        ) : list.isError ? (
          <p role="alert" className="mt-16 flex items-center justify-center gap-2">
            <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
          </p>
        ) : list.data.length === 0 ? (
          <p className="mt-16 text-center text-ivory/70">
            {categoryId ? t("noMatch") : t("empty")}
          </p>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.data.map((group) => (
              <ProductTile
                key={group.key}
                group={group}
                onDetails={(packId) =>
                  setOpen({ key: group.key, packIds: group.packs.map((p) => p.productId), packId })
                }
              />
            ))}
          </ul>
        )}
      </div>

      {/* the product sheet, and the forms for a new product or more pack sizes */}
      <ProductSheet
        group={opened}
        packId={open?.packId ?? null}
        onPack={(packId) => setOpen((o) => (o ? { ...o, packId } : o))}
        onClose={() => setOpen(null)}
        onAddPack={setAddingPack}
      />
      <NewProductSheet open={adding} onClose={() => setAdding(false)} />
      <ProductFormSheet group={addingPack} onClose={() => setAddingPack(null)} />
    </main>
  );
}
