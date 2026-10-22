"use client";

import { Check, Pencil, Power, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { type SubCategory, useCategoryCache } from "../categories/category-cache";
import { type CategoryError, categoryError, NAME_MAX, nameProblem } from "../categories/category-errors";
import { actionBox, iconButton, rowBodyInline, rowShellOnIvory, segmentInline } from "../row-styles";

// one sub-category inside its category's sheet: name and product count, then Rename, Deactivate and Delete
export function SubCategoryRow({ sub }: { sub: SubCategory }) {
  const t = useTranslations("products.subCategories");
  const utils = trpc.useUtils();
  const cache = useCategoryCache();
  const rename = trpc.inventory.subCategory.rename.useMutation();
  const setActive = trpc.inventory.subCategory.setActive.useMutation();
  const remove = trpc.inventory.subCategory.delete.useMutation();

  // the delete confirmation is open
  const [confirming, setConfirming] = useState(false);

  // rename in place: the name becomes a field while editing
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<CategoryError | null>(null);

  const display = titleCase(sub.name);

  const startEditing = () => {
    setName(display);
    setError(null);
    setEditing(true);
  };

  // rename: the server checks the name first (it may be taken), then the row changes at once
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = nameProblem(name);
    if (problem) return setError(problem);
    if (name.trim().toLowerCase() === sub.name) return setEditing(false);
    try {
      const renamed = await rename.mutateAsync({ id: sub.id, name });
      cache.updateSub(sub.categoryId, sub.id, { name: renamed.name });
      cache.sync();
      toast.success(t("toast.renamed", { name: titleCase(renamed.name) }));
      setEditing(false);
    } catch (err) {
      const key = categoryError(err);
      if (key === "invalidName") return setError(key);
      if (key !== "taken") return toast.error(t(`errors.${key}`));

      // taken: say so plainly when it's by an inactive sub-category of the same category
      const all = await utils.inventory.category.list.fetch({ includeInactive: true });
      const siblings = all.find((c) => c.id === sub.categoryId)?.subCategories ?? [];
      const hidden = siblings.some((s) => !s.isActive && s.name === name.trim().toLowerCase());
      setError(hidden ? "takenInactive" : "taken");
    }
  }

  // deactivate or reactivate: shown at once; undone with a red toast if the server refuses
  // (it does while the sub-category has active products)
  function toggleActive() {
    const undo = cache.updateSub(sub.categoryId, sub.id, { isActive: !sub.isActive });
    toast.success(t(sub.isActive ? "toast.deactivated" : "toast.reactivated", { name: display }));
    setActive.mutate(
      { id: sub.id, isActive: !sub.isActive },
      {
        onSuccess: cache.sync,
        onError: (err) => {
          undo();
          toast.error(t(`errors.${categoryError(err)}`));
        },
      },
    );
  }

  // delete, once confirmed: gone at once; back with a red toast if the server refuses (it has products)
  function deleteSub() {
    setConfirming(false);
    const undo = cache.removeSub(sub.categoryId, sub.id);
    toast.success(t("toast.deleted", { name: display }));
    remove.mutate(
      { id: sub.id },
      {
        onSuccess: cache.sync,
        onError: (err) => {
          undo();
          const key = categoryError(err);
          toast.error(t(`errors.${key === "hasProducts" ? "notEmpty" : key}`));
        },
      },
    );
  }

  return (
    <li className={rowShellOnIvory(sub.isActive)}>
      {editing ? (
        // renaming: the field, then Save and Cancel; a problem with the name shows underneath
        <form onSubmit={save} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              aria-label={t("nameLabel")}
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              aria-invalid={error ? true : undefined}
              className={`min-h-11 min-w-0 flex-1 px-3 text-base ${fieldClass(!!error)}`}
            />
            <button type="submit" aria-label={t("save")} disabled={rename.isPending} aria-busy={rename.isPending} className={iconButton}>
              {rename.isPending ? <Spinner /> : <Check className="size-5" aria-hidden />}
            </button>
            <button type="button" aria-label={t("cancel")} onClick={() => setEditing(false)} className={iconButton}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {error && <FieldMessage>{t(`errors.${error}`, { name: titleCase(name.trim()) })}</FieldMessage>}
        </form>
      ) : (
        <div className={rowBodyInline}>
          {/* name and product count */}
          <div className="min-w-0 flex-1 py-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-heading text-lg font-bold leading-6">{display}</span>
              {!sub.isActive && <span className="shrink-0 rounded-control border border-current/60 px-1.5 text-xs leading-5">{t("inactive")}</span>}
            </span>
            <span className="tabular block truncate text-xs opacity-80">{t("productCount", { products: sub.activeProducts })}</span>
          </div>

          {/* actions in one outlined box: Rename (active only), Deactivate / Reactivate, Delete (asks first) */}
          <div className={actionBox}>
            <button type="button" aria-label={t("rename")} onClick={startEditing} disabled={!sub.isActive} className={segmentInline}>
              <Pencil className="size-4" aria-hidden />
            </button>
            <button type="button" aria-label={sub.isActive ? t("deactivate") : t("reactivate")} onClick={toggleActive} className={segmentInline}>
              <Power className="size-4" aria-hidden />
            </button>
            <button type="button" aria-label={t("delete")} onClick={() => setConfirming(true)} className={cn(segmentInline, "text-danger")}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* the confirmation before deleting */}
      <ConfirmDialog
        open={confirming}
        title={t("deleteTitle", { name: display })}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        busy={false}
        onConfirm={deleteSub}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}
