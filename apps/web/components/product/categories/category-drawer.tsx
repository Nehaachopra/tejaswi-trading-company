"use client";

import { Plus, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { SubCategoryRow } from "../sub-categories/sub-category-row";
import { type Category, useCategoryCache } from "./category-cache";
import { type CategoryError, categoryError, NAME_MAX, nameProblem } from "./category-errors";

type Option = { id: string; name: string };

// a category's sub-categories, in a sheet: add one at the top, then one row each
export function CategoryDrawer({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const t = useTranslations("products.subCategories");
  const utils = trpc.useUtils();
  const cache = useCategoryCache();
  const create = trpc.inventory.subCategory.create.useMutation();
  const reactivate = trpc.inventory.subCategory.setActive.useMutation();

  // the add field, its problem, and an inactive sub-category that already has the name
  const [name, setName] = useState("");
  const [error, setError] = useState<CategoryError | null>(null);
  const [inactive, setInactive] = useState<Option | null>(null);

  const reset = () => {
    setName("");
    setError(null);
    setInactive(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  // add a sub-category: the server checks the name first (it may be taken), then the row shows at once
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    const problem = nameProblem(name);
    if (problem) return setError(problem);
    try {
      const created = await create.mutateAsync({ categoryId: category.id, name });
      cache.addSub({ ...created, activeProducts: 0 });
      cache.sync();
      toast.success(t("toast.added", { name: titleCase(created.name) }));
      reset();
    } catch (err) {
      const key = categoryError(err);
      if (key === "invalidName") return setError(key);
      if (key === "hasProducts") return toast.error(t("errors.categoryInactive"));
      if (key !== "taken") return toast.error(t(`errors.${key}`));

      // taken: if it's by an inactive sub-category here, say so and offer to bring it back
      const all = await utils.inventory.category.list.fetch({ includeInactive: true });
      const siblings = all.find((c) => c.id === category.id)?.subCategories ?? [];
      const match = siblings.find((s) => !s.isActive && s.name === name.trim().toLowerCase());
      setInactive(match ? { id: match.id, name: match.name } : null);
      setError(match ? "takenInactive" : "taken");
    }
  }

  // Reactivate the inactive sub-category instead of adding a new one
  async function bringBack() {
    if (!inactive) return;
    try {
      await reactivate.mutateAsync({ id: inactive.id, isActive: true });
      cache.updateSub(category!.id, inactive.id, { isActive: true });
      cache.sync();
      toast.success(t("toast.reactivated", { name: titleCase(inactive.name) }));
      reset();
    } catch (err) {
      toast.error(t(`errors.${categoryError(err)}`));
    }
  }

  return (
    <Sheet open={!!category} title={category ? titleCase(category.name) : ""} closeLabel={t("close")} onClose={close}>
      {category && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* add a sub-category (an inactive category takes none) */}
          {category.isActive && (
            <form onSubmit={add} className="flex flex-col gap-2 border-b border-chestnut/15 p-3">
              <div className="flex items-center gap-2">
                <input
                  aria-label={t("add")}
                  value={name}
                  maxLength={NAME_MAX}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                    setInactive(null);
                  }}
                  placeholder={t("namePlaceholder")}
                  aria-invalid={error ? true : undefined}
                  className={`min-h-11 min-w-0 flex-1 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(!!error)}`}
                />
                <button
                  type="submit"
                  aria-label={t("add")}
                  disabled={create.isPending}
                  aria-busy={create.isPending}
                  className="grid size-11 shrink-0 place-items-center rounded-control bg-chestnut text-ivory aria-busy:opacity-80"
                >
                  {create.isPending ? <Spinner /> : <Plus className="size-5" aria-hidden />}
                </button>
              </div>

              {/* the problem with the name, and for an inactive match the way to bring it back */}
              {error && (
                <FieldMessage>{t(`errors.${error}`, { name: titleCase(inactive?.name ?? name.trim()) })}</FieldMessage>
              )}
              {inactive && (
                <button
                  type="button"
                  onClick={() => void bringBack()}
                  disabled={reactivate.isPending}
                  aria-busy={reactivate.isPending}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-chestnut/60 px-3 text-sm font-medium hover:border-chestnut aria-busy:opacity-80"
                >
                  {reactivate.isPending ? <Spinner /> : <RotateCcw className="size-4" aria-hidden />}
                  {t("reactivateName", { name: titleCase(inactive.name) })}
                </button>
              )}
            </form>
          )}

          {/* the sub-categories, or a line when there are none */}
          {category.subCategories.length === 0 ? (
            <p className="p-6 text-center text-sm text-chestnut/80">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2 p-3">
              {category.subCategories.map((sub) => (
                <SubCategoryRow key={sub.id} sub={sub} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
