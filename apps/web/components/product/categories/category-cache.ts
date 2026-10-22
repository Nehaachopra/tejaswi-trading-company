"use client";

import type { RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

export type Category = RouterOutputs["inventory"]["category"]["list"][number];
export type SubCategory = Category["subCategories"][number];

// both lists the page may hold: active only, and with the inactive ones
const VIEWS = [{ includeInactive: false }, { includeInactive: true }] as const;

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

// changes to categories and sub-categories show on the page at once; the server is far away,
// so the page doesn't wait for a fresh list. `patch` rewrites every cached list and returns an undo;
// `sync` refetches in the background so the page ends up exactly as the server has it
export function useCategoryCache() {
  const utils = trpc.useUtils();
  const list = utils.inventory.category.list;

  function patch(change: (categories: Category[], includeInactive: boolean) => Category[]) {
    void list.cancel();
    const before = VIEWS.map((view) => list.getData(view));
    VIEWS.forEach((view, i) => {
      const data = before[i];
      if (data) list.setData(view, change(data, view.includeInactive).sort(byName));
    });
    return () => VIEWS.forEach((view, i) => list.setData(view, before[i]));
  }

  const sync = () => void list.invalidate();

  // one category changed in place (name, active), dropped from the active-only list when it goes inactive
  const updateCategory = (id: string, fields: Partial<Category>) =>
    patch((all, includeInactive) =>
      all.map((c) => (c.id === id ? { ...c, ...fields } : c)).filter((c) => includeInactive || c.isActive),
    );

  // one sub-category changed in place, inside its category
  const updateSub = (categoryId: string, id: string, fields: Partial<SubCategory>) =>
    patch((all, includeInactive) =>
      all.map((c) =>
        c.id !== categoryId
          ? c
          : {
              ...c,
              subCategories: c.subCategories
                .map((s) => (s.id === id ? { ...s, ...fields } : s))
                .filter((s) => includeInactive || s.isActive)
                .sort(byName),
            },
      ),
    );

  return {
    patch,
    sync,
    updateCategory,
    updateSub,
    addCategory: (category: Category) => patch((all) => [...all.filter((c) => c.id !== category.id), category]),
    removeCategory: (id: string) => patch((all) => all.filter((c) => c.id !== id)),
    addSub: (sub: SubCategory) =>
      patch((all) =>
        all.map((c) =>
          c.id === sub.categoryId ? { ...c, subCategories: [...c.subCategories.filter((s) => s.id !== sub.id), sub].sort(byName) } : c,
        ),
      ),
    removeSub: (categoryId: string, id: string) =>
      patch((all) => all.map((c) => (c.id === categoryId ? { ...c, subCategories: c.subCategories.filter((s) => s.id !== id) } : c))),
  };
}
