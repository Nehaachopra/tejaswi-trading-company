"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { useCategoryCache } from "./category-cache";
import { type CategoryError, categoryError, NAME_MAX, nameProblem } from "./category-errors";

// one field: a problem with the name shows under it; anything else is a toast
export function AddCategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("products.categories");
  const utils = trpc.useUtils();
  const cache = useCategoryCache();
  const create = trpc.inventory.category.create.useMutation();
  const reactivate = trpc.inventory.category.setActive.useMutation();

  const [name, setName] = useState("");
  const [error, setError] = useState<CategoryError | null>(null);
  // the inactive category that already has this name, offered back instead of a duplicate
  const [inactive, setInactive] = useState<{ id: string; name: string } | null>(null);

  const close = () => {
    setName("");
    setError(null);
    setInactive(null);
    onClose();
  };

  // check the name here, then the server checks it too (it may be taken); the new row then shows at once
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = nameProblem(name);
    if (problem) return setError(problem);
    try {
      const created = await create.mutateAsync({ name });
      cache.addCategory({ ...created, activeProducts: 0, subCategories: [] });
      cache.sync();
      toast.success(t("toast.added", { name: titleCase(created.name) }));
      close();
    } catch (err) {
      const key = categoryError(err);
      if (key === "invalidName") return setError(key);
      if (key !== "taken") return toast.error(t(`errors.${key}`));

      // taken: if it's by an inactive category (hidden from the list), say so and offer to bring it back
      const all = await utils.inventory.category.list.fetch({ includeInactive: true });
      const match = all.find((c) => !c.isActive && c.name === name.trim().toLowerCase());
      setInactive(match ? { id: match.id, name: match.name } : null);
      setError(match ? "takenInactive" : "taken");
    }
  }

  // Reactivate the inactive category instead of adding a new one
  async function bringBack() {
    if (!inactive) return;
    try {
      await reactivate.mutateAsync({ id: inactive.id, isActive: true });
      cache.updateCategory(inactive.id, { isActive: true });
      cache.sync();
      toast.success(t("toast.reactivated", { name: titleCase(inactive.name) }));
      close();
    } catch (err) {
      toast.error(t(`errors.${categoryError(err)}`));
    }
  }

  return (
    <Sheet open={open} title={t("addTitle")} closeLabel={t("close")} onClose={close}>
      <form onSubmit={submit} className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          {/* the one field: Name */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">{t("nameLabel")}</span>
            <input
              autoFocus
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                setInactive(null);
              }}
              placeholder={t("namePlaceholder")}
              aria-invalid={error ? true : undefined}
              className={`min-h-11 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(!!error)}`}
            />
          </label>

          {/* the problem with the name, and for an inactive match the way to bring it back */}
          {error && <FieldMessage>{t(`errors.${error}`, { name: titleCase(inactive?.name ?? name.trim()) })}</FieldMessage>}
          {inactive && (
            <button
              type="button"
              onClick={() => void bringBack()}
              disabled={reactivate.isPending}
              aria-busy={reactivate.isPending}
              className="-mt-2 flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-chestnut/60 px-3 text-sm font-medium hover:border-chestnut aria-busy:opacity-80"
            >
              {reactivate.isPending ? <Spinner /> : <RotateCcw className="size-4" aria-hidden />}
              {t("reactivateName", { name: titleCase(inactive.name) })}
            </button>
          )}
        </div>

        {/* the save button stays at the bottom of the sheet */}
        <footer className="flex flex-col border-t border-chestnut/15 px-5 py-4">
          <SubmitButton busy={create.isPending}>{t("add")}</SubmitButton>
        </footer>
      </form>
    </Sheet>
  );
}
