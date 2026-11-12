"use client";

import { Check, ChevronDown, CircleAlert, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import {
  ADD_BUTTON,
  FILTER_CONTROL,
  FILTER_ROW,
  FILTER_STACK,
  FILTER_TRIGGER,
  PAGE,
} from "~/components/ui/page-styles";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { ProductTabs } from "../product-tabs";
import { chip } from "../row-styles";
import { NewProductSheet } from "./new-product-sheet";
import { PriceCard } from "./price-card";
import { ProductSheet } from "./product-sheet";
import { ProductTile } from "./product-tile";
import { cn } from "~/lib/utils";

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
  // the price card zoomed in: the product (found again on every change, as the sheet is) and the pack size shown
  const [pricing, setPricing] = useState<{ packIds: string[]; packId: string } | null>(null);
  const priced = (pricing && list.data?.find((g) => g.packs.some((p) => pricing.packIds.includes(p.productId)))) ?? null;
  const closePrice = useCallback(() => setPricing(null), []);
  // the new-product form
  const [adding, setAdding] = useState(false);

  return (
    <main className={`${PAGE} pb-16`}>
      {/* everything behind an open sheet or the price card is inert: no taps, focus or scrolling of tiles and filters */}
      <div inert={!!opened || adding || !!priced} className="contents">
        {/* the page's name, for screen readers only: the tabs say it visually */}
        <h1 className="sr-only">{t("title")}</h1>

        {/* Categories · Products */}
        <ProductTabs />

        {/* as the Entities pages: the name and how many there are on the left, the filters on the right (each its own
            row on a phone); + Add product under them at the right end; a line before the tiles */}
        <div className={`mt-3 ${FILTER_STACK}`}>
          <div className={FILTER_ROW}>
            <h2 className="shrink-0 font-heading text-2xl font-bold">{t("title")}</h2>
            <span className="tabular ml-1 shrink-0 rounded-control bg-ivory px-2.5 py-0.5 font-heading text-lg font-bold text-chestnut">
              {list.data?.length ?? 0}
            </span>
            <span className="basis-full sm:hidden" aria-hidden />
            <span className="hidden flex-1 sm:block" aria-hidden />
            {/* the category, then its sub-category (once one with some is picked), then Show inactive */}
            <Menu
              label={t("category")}
              surface="chestnut"
              align="left"
              boxed
              triggerClassName={cn(FILTER_TRIGGER, FILTER_CONTROL)}
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
              boxed
              triggerClassName={cn(FILTER_TRIGGER, FILTER_CONTROL)}
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
              className={cn(chip(showInactive), FILTER_CONTROL)}
            >
              {t("showInactive")}
            </button>
          </div>
          <div className={cn(FILTER_ROW, "sm:justify-end")}>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={cn(ADD_BUTTON, "shrink-0")}
            >
              <Plus className="size-5" aria-hidden /> {t("add")}
            </button>
          </div>
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
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.data.map((group) => (
              <ProductTile
                key={group.key}
                group={group}
                onDetails={(packId) =>
                  setOpen({ key: group.key, packIds: group.packs.map((p) => p.productId), packId })
                }
                onPrice={(packId) => setPricing({ packIds: group.packs.map((p) => p.productId), packId })}
              />
            ))}
          </ul>
        )}
      </div>

      {/* a pack size's details drawer, the price card, and the new-product form */}
      <ProductSheet group={opened} packId={open?.packId ?? null} onClose={() => setOpen(null)} />
      {priced && pricing && (
        <PriceCard
          group={priced}
          packId={pricing.packId}
          onPack={(packId) => setPricing((p) => (p ? { ...p, packId } : p))}
          onClose={closePrice}
        />
      )}
      <NewProductSheet open={adding} onClose={() => setAdding(false)} />
    </main>
  );
}
