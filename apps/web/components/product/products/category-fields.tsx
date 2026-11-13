"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { PlacePicker } from "../../transaction/shared/place-picker";
import { categoryError } from "../categories/category-errors";

// a category's or sub-category's name, as the categories tables take it
const NAME_MAX = 50;

// Category, then its sub-categories (shown once a category is picked), each an accordion as Paid from: every choice
// open as a row until one is picked, then collapsed to it with ▾; the last row, + New, opens a name box with Add
export function CategoryFields({
  categoryId,
  subCategoryId,
  onChange,
  categoryInvalid = false,
  subInvalid,
  labelClass,
  pickEnd = false,
}: {
  categoryId: string | null;
  subCategoryId: string | null;
  onChange: (patch: { categoryId?: string; subCategoryId: string | null }) => void;
  categoryInvalid?: boolean;
  subInvalid: boolean;
  labelClass: string;
  // every value at the right end (Add product's rows)
  pickEnd?: boolean;
}) {
  const t = useTranslations("products.items");
  const utils = trpc.useUtils();
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false });
  const createCategory = trpc.inventory.category.create.useMutation();
  const createSub = trpc.inventory.subCategory.create.useMutation();
  const [adding, setAdding] = useState<"category" | "sub" | null>(null);

  // the picked category's sub-categories
  const category = categories.data?.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];

  // a new category is picked once added, with no sub-category yet; a new sub-category is picked once added
  async function addCategory(name: string) {
    const created = await createCategory.mutateAsync({ name });
    await utils.inventory.category.list.invalidate();
    onChange({ categoryId: created.id, subCategoryId: null });
    setAdding(null);
  }
  async function addSub(name: string) {
    const created = await createSub.mutateAsync({ categoryId: categoryId!, name });
    await utils.inventory.category.list.invalidate();
    onChange({ subCategoryId: created.id });
    setAdding(null);
  }

  return (
    <>
      {/* category */}
      <div className={labelClass}>
        <span>
          {t("category")}
          <RequiredMark />
        </span>
        <PlacePicker
          label={t("category")}
          places={(categories.data ?? []).map((c) => ({ id: c.id, name: titleCase(c.name), disabled: false }))}
          value={categoryId}
          onPick={(id) => {
            if (id !== categoryId) onChange({ categoryId: id, subCategoryId: null });
            setAdding(null);
          }}
          invalid={categoryInvalid}
          pickEnd={pickEnd}
          addLabel={t("form.newCategory")}
          onAdd={() => setAdding("category")}
        />
        {adding === "category" && <NameAdder label={t("form.newCategory")} busy={createCategory.isPending} onAdd={addCategory} />}
      </div>

      {/* its sub-categories, once a category is picked */}
      {categoryId && (
        <div className={labelClass}>
          <span>
            {t("subCategory")}
            <RequiredMark />
          </span>
          <PlacePicker
            label={t("subCategory")}
            places={subs.map((s) => ({ id: s.id, name: titleCase(s.name), disabled: false }))}
            value={subCategoryId}
            onPick={(id) => {
              onChange({ subCategoryId: id });
              setAdding(null);
            }}
            invalid={subInvalid}
            pickEnd={pickEnd}
            addLabel={t("form.newSubCategory")}
            onAdd={() => setAdding("sub")}
          />
          {adding === "sub" && <NameAdder label={t("form.newSubCategoryName")} busy={createSub.isPending} onAdd={addSub} />}
        </div>
      )}
    </>
  );
}

// a name box with Add beside it; Enter adds too. What the server refuses shows under it
function NameAdder({ label, busy, onAdd }: { label: string; busy: boolean; onAdd: (name: string) => Promise<void> }) {
  const t = useTranslations("products.items");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const trimmed = name.trim();
    if (trimmed === "" || busy) return;
    setError(null);
    try {
      await onAdd(trimmed);
    } catch (err) {
      const key = categoryError(err);
      setError(t(`form.errors.${key === "invalidName" ? "check" : key === "hasProducts" ? "inactive" : key}`));
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value.replace(/[^\p{L}\d &.'-]/gu, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder={label}
          aria-label={label}
          className={cn("min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/50", fieldClass(false))}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={name.trim() === "" || busy}
          aria-busy={busy}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-control bg-chestnut px-4 text-sm font-semibold text-ivory disabled:not-aria-busy:opacity-40"
        >
          {busy && <Spinner />}
          {t("form.add")}
        </button>
      </div>
      {error && <FieldMessage className="mt-0">{error}</FieldMessage>}
    </>
  );
}
