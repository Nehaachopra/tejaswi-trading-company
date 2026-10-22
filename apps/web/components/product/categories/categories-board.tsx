"use client";

import { CircleAlert, ListFilter, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { ProductTabs } from "../product-tabs";
import { AddCategorySheet } from "./add-category-sheet";
import { CategoryDrawer } from "./category-drawer";
import { CategoryRow } from "./category-row";

// the top of the products area: categories, each opening a drawer with its sub-categories
export function CategoriesBoard() {
  const t = useTranslations("products.categories");
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  // the categories, with or without the inactive ones
  const list = trpc.inventory.category.list.useQuery({ includeInactive: showInactive });
  const close = useCallback(() => setAdding(false), []);

  // the category whose drawer is open; read from the list each time, so the drawer follows every change
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = list.data?.find((c) => c.id === openId) ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      {/* the page's name, for screen readers only: the tiles below say it visually */}
      <h1 className="sr-only">{t("title")}</h1>

      {/* Categories · Products, each with its count */}
      <ProductTabs />

      {/* Add category */}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ivory px-5 font-heading text-lg font-bold text-chestnut sm:w-auto"
      >
        <Plus className="size-5" aria-hidden /> {t("add")}
      </button>

      {/* filters: a filter icon, then the chips (plain text); for now only Show inactive */}
      <div className="mt-4 flex items-center gap-2">
        <ListFilter className="size-5 shrink-0 text-ivory/70" aria-hidden />
        <button
          type="button"
          aria-pressed={showInactive}
          onClick={() => setShowInactive((v) => !v)}
          className={cn(
            "min-h-9 rounded-control border px-4 text-sm transition-colors",
            showInactive ? "border-ivory bg-ivory font-medium text-chestnut" : "hover:border-ivory/60",
          )}
        >
          {t("showInactive")}
        </button>
      </div>

      {/* the list: loading, error, empty, or the categories (rows on phones, tiles from 1024px) */}
      {list.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : list.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : list.data.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{t("empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-2 lg:grid-cols-3 lg:gap-3 xl:grid-cols-4">
          {list.data.map((category) => (
            <CategoryRow key={category.id} category={category} onOpen={() => setOpenId(category.id)} />
          ))}
        </ul>
      )}

      {/* the Add category sheet */}
      <AddCategorySheet open={adding} onClose={close} />

      {/* the open category's sheet: its sub-categories */}
      <CategoryDrawer category={opened} onClose={() => setOpenId(null)} />
    </main>
  );
}
