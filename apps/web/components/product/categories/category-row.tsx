"use client";

import { Check, ChevronRight, Pencil, Power, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { RouterOutputs } from "@repo/trpc/client";

import { fieldClass } from "~/components/ui/card-form";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { useCategoryCache } from "./category-cache";
import { type CategoryError, categoryError, NAME_MAX, nameProblem } from "./category-errors";

type Category = RouterOutputs["inventory"]["category"]["list"][number];

// a 44px icon button whose outline follows the row's ink (chestnut on ivory, ivory on chestnut); used while renaming
const iconButton =
  "grid size-11 shrink-0 place-items-center rounded-control border border-current/40 hover:border-current disabled:not-aria-busy:opacity-30 aria-busy:opacity-80";

// one segment of the action box: no outline of its own, the box draws it and the dividers between
const segment =
  "grid h-11 w-11 place-items-center hover:bg-current/10 disabled:not-aria-busy:opacity-30 aria-busy:opacity-80 lg:w-auto lg:flex-1";

// one category as a compact row: name and counts (tap → its drawer of sub-categories), then Rename, Deactivate and Delete
export function CategoryRow({ category, onOpen }: { category: Category; onOpen: () => void }) {
  const t = useTranslations("products.categories");
  const utils = trpc.useUtils();
  const cache = useCategoryCache();
  const rename = trpc.inventory.category.rename.useMutation();
  const setActive = trpc.inventory.category.setActive.useMutation();
  const remove = trpc.inventory.category.delete.useMutation();

  // the delete confirmation is open
  const [confirming, setConfirming] = useState(false);

  // rename in place: the name becomes a field while editing
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<CategoryError | null>(null);

  const display = titleCase(category.name);
  const subCategories = category.subCategories.filter((s) => s.isActive).length;

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
    if (name.trim().toLowerCase() === category.name) return setEditing(false);
    try {
      const renamed = await rename.mutateAsync({ id: category.id, name });
      cache.updateCategory(category.id, { name: renamed.name });
      cache.sync();
      toast.success(t("toast.renamed", { name: titleCase(renamed.name) }));
      setEditing(false);
    } catch (err) {
      const key = categoryError(err);
      if (key === "invalidName") return setError(key);
      if (key !== "taken") return toast.error(t(`errors.${key}`));

      // taken: say so plainly when it's by an inactive category, which the list may be hiding
      const all = await utils.inventory.category.list.fetch({ includeInactive: true });
      const hidden = all.some((c) => !c.isActive && c.name === name.trim().toLowerCase());
      setError(hidden ? "takenInactive" : "taken");
    }
  }

  // deactivate or reactivate: shown at once; undone with a red toast if the server refuses
  // (it does while the category has active products)
  function toggleActive() {
    const undo = cache.updateCategory(category.id, { isActive: !category.isActive });
    toast.success(
      t(category.isActive ? "toast.deactivated" : "toast.reactivated", { name: display }),
    );
    setActive.mutate(
      { id: category.id, isActive: !category.isActive },
      {
        onSuccess: cache.sync,
        onError: (err) => {
          undo();
          toast.error(t(`errors.${categoryError(err)}`));
        },
      },
    );
  }

  // delete, once confirmed: gone at once; back with a red toast if the server refuses
  // (it does while sub-categories or products belong to the category)
  function deleteCategory() {
    setConfirming(false);
    const undo = cache.removeCategory(category.id);
    toast.success(t("toast.deleted", { name: display }));
    remove.mutate(
      { id: category.id },
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
    // active: solid ivory with chestnut ink; inactive: no fill, a solid ivory border and ivory ink.
    // Inside, outlines and muted text follow the ink (currentColor), so both look right
    <li
      className={cn(
        // both have a 2px ivory border (invisible on the ivory fill), so active and inactive rows are the same size
        "rounded-control border border-ivory px-2.5 py-1.5",
        category.isActive ? "on-ivory bg-ivory text-chestnut" : "text-ivory",
      )}
    >
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
            <button
              type="submit"
              aria-label={t("save")}
              disabled={rename.isPending}
              aria-busy={rename.isPending}
              className={iconButton}
            >
              {rename.isPending ? <Spinner /> : <Check className="size-5" aria-hidden />}
            </button>
            <button
              type="button"
              aria-label={t("cancel")}
              onClick={() => setEditing(false)}
              className={iconButton}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {error && (
            <FieldMessage>{t(`errors.${error}`, { name: titleCase(name.trim()) })}</FieldMessage>
          )}
        </form>
      ) : (
        // phones: a row (name left, action box right); from 1024px: a tile (name on top, action box across the bottom)
        <div className="flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3">
          {/* name and counts: opens this category's drawer with its sub-categories */}
          <button
            type="button"
            onClick={onOpen}
            aria-haspopup="dialog"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-control py-1 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-heading text-lg font-bold leading-6">{display}</span>
                {!category.isActive && (
                  <span className="shrink-0 rounded-control border border-current/60 px-1.5 text-xs leading-5">
                    {t("inactive")}
                  </span>
                )}
              </span>
              <span className="tabular block truncate text-xs opacity-80">
                {t("cardCounts", { subCategories, products: category.activeProducts })}
              </span>
            </span>
            {/* the arrow says this opens: here beside the name on tiles (from 1024px) */}
            <ChevronRight className="hidden size-5 shrink-0 opacity-70 lg:block" aria-hidden />
          </button>

          {/* actions in one outlined box, split by lines: Rename (active only), Deactivate / Reactivate, Delete (asks first) */}
          <div className="flex shrink-0 divide-x divide-current/30 overflow-hidden rounded-control border border-current/40">
            <button
              type="button"
              aria-label={t("rename")}
              onClick={startEditing}
              disabled={!category.isActive}
              className={segment}
            >
              <Pencil className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={category.isActive ? t("deactivate") : t("reactivate")}
              onClick={toggleActive}
              className={segment}
            >
              <Power className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("delete")}
              onClick={() => setConfirming(true)}
              className={cn(segment, category.isActive && "text-danger")}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>

          {/* on phones the arrow sits at the end of the row, after the buttons; it opens the category too */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={onOpen}
            className="-mr-1 grid h-11 w-6 shrink-0 place-items-center opacity-70 lg:hidden"
          >
            <ChevronRight className="size-5" />
          </button>
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
        onConfirm={deleteCategory}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}
