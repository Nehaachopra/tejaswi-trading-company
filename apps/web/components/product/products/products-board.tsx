"use client";

import { Check, ChevronDown, CircleAlert, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ADD_BUTTON,
  addSquare,
  FILTER_CONTROL,
  FILTER_TRIGGER,
  PAGE,
  SEARCH_BOX,
  SEARCH_INPUT,
} from "~/components/ui/page-styles";
import { ClearButton } from "~/components/ui/clear-button";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { packLabel, titleCase } from "~/lib/format";
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
  const tc = useTranslations("common");

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

  // the search: every word typed must appear in the brand, name, category, sub-category or a pack size ("5 ltr")
  const [typed, setTyped] = useState("");
  const shown = useMemo(() => {
    const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!list.data || words.length === 0) return list.data;
    return list.data.filter((g) => {
      const text = [g.brand, g.name, g.categoryName, g.subCategoryName, ...g.packs.map((p) => packLabel(p.packSize, p.packSizeCode))]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [list.data, typed]);

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

        {/* the page header: Products and how many are shown on the left; search and + Add product on the right. On a
            phone: the name, count and a square + on one row, search full width under them */}
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <h2 className="shrink-0 font-heading text-2xl font-bold">{t("title")}</h2>
          <span className="tabular ml-1 shrink-0 rounded-control bg-ivory px-2.5 py-0.5 font-heading text-lg font-bold text-chestnut">
            {shown?.length ?? 0}
          </span>
          <span className="flex-1" aria-hidden />
          <label className={cn(SEARCH_BOX, "order-last sm:order-none sm:w-64")}>
            <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
            <span className="sr-only">{t("search")}</span>
            <input
              type="search"
              value={typed}
              maxLength={100}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t("search")}
              className={SEARCH_INPUT}
            />
            {typed && <ClearButton onClear={() => setTyped("")} label={tc("clearSearch")} />}
          </label>
          {/* + Add product; a square + on a phone */}
          <button type="button" onClick={() => setAdding(true)} aria-label={t("add")} className={cn(addSquare("size-11"), "sm:hidden")}>
            <Plus className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={() => setAdding(true)} className={cn(ADD_BUTTON, "hidden shrink-0 sm:flex")}>
            <Plus className="size-5" aria-hidden /> {t("add")}
          </button>
        </div>

        {/* the filters, on top of the cards: the category, then its sub-category (once one with some is picked), then
            Show inactive; one row that scrolls sideways, the dropdown lists floating above it */}
        <div className="-mx-4 mt-6 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6">
            <Menu
              label={t("category")}
              surface="chestnut"
              align="left"
              boxed
              floating
              triggerClassName={cn(FILTER_TRIGGER, FILTER_CONTROL, "shrink-0")}
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
              floating
              triggerClassName={cn(FILTER_TRIGGER, FILTER_CONTROL, "shrink-0")}
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
              className={cn(chip(showInactive), FILTER_CONTROL, "shrink-0")}
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
        ) : shown!.length === 0 ? (
          <p className="mt-16 text-center text-ivory/70">
            {typed.trim() ? t("noSearchMatch", { search: typed.trim() }) : categoryId ? t("noMatch") : t("empty")}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown!.map((group) => (
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
