"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { Sheet } from "~/components/ui/sheet";
import { toast } from "~/components/ui/toast";
import { packLabel } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { categoryError } from "../categories/category-errors";
import { CODES, emptyPack, packInput, packKey, packOk, packProblems, type PackDraft, settle, wholeAbove0 } from "./pack-draft";
import { type ProductGroup, productTitle } from "./product-tile";

// more pack sizes for a product (the + beside its pack sizes); its details are edited in place on its sheet
export function ProductFormSheet({ group, onClose }: { group: ProductGroup | null; onClose: () => void }) {
  const t = useTranslations("products.items.form");
  const utils = trpc.useUtils();
  const create = trpc.inventory.product.create.useMutation();

  const [packs, setPacks] = useState<PackDraft[]>([emptyPack(0)]);
  // after a save attempt, the fields that need attention are outlined in red
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // each time it opens, start with one empty pack size
  useEffect(() => {
    if (!group) return;
    setPacks([emptyPack(0)]);
    setTried(false);
    setServerError(null);
  }, [group]);

  // duplicate pack sizes: typed twice here, or one the product already has
  const existing = new Set((group?.packs ?? []).map((p) => packKey(p.packSizeCode, p.packSize)));
  const typed = packs.filter((p) => wholeAbove0(p.packSize)).map((p) => packKey(p.packSizeCode, p.packSize));
  const isDuplicate = (p: PackDraft) => {
    if (!wholeAbove0(p.packSize)) return false;
    const k = packKey(p.packSizeCode, p.packSize);
    return existing.has(k) || typed.filter((x) => x === k).length > 1;
  };
  const duplicates = [...new Set(packs.filter(isDuplicate).map((p) => packLabel(Number(p.packSize), p.packSizeCode)))];
  const filled = packs.every(packOk);

  const update = (key: number, patch: Partial<PackDraft>) =>
    setPacks((all) => all.map((p) => (p.key === key ? settle({ ...p, ...patch }) : p)));

  // save the new pack sizes; they start with the product's photo, and each can be changed afterwards
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    if (!group || !filled || duplicates.length > 0) return;
    try {
      await create.mutateAsync({
        categoryId: group.categoryId,
        subCategoryId: group.subCategoryId,
        brand: group.brand,
        name: group.name ?? undefined,
        imageUrl: group.imageUrl ?? undefined,
        packs: packInput(packs),
      });
      toast.success(t("toast.packsAdded", { name: productTitle(group) }));
      void utils.inventory.product.list.invalidate();
      void utils.inventory.category.list.invalidate();
      onClose();
    } catch (err) {
      const key = categoryError(err);
      setServerError(
        key === "taken" ? t("errors.taken") : key === "hasProducts" ? t("errors.inactive") : t(`errors.${key === "invalidName" ? "check" : key}`),
      );
    }
  }

  const chip = (on: boolean) =>
    cn(
      "min-h-9 rounded-control border px-3 text-sm transition-colors",
      on ? "border-chestnut bg-chestnut font-medium text-ivory" : "border-chestnut/60 hover:border-chestnut",
    );

  return (
    <Sheet open={!!group} title={group ? t("addPackTitle", { name: productTitle(group) }) : ""} closeLabel={t("close")} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {/* pack sizes: size and unit, GST %, price with GST; one or more */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm">{t("packs")}</legend>
            {packs.map((p, i) => {
              const wrong = packProblems(p);
              return (
                <div key={p.key} className="flex flex-col gap-2 rounded-control border border-chestnut/20 p-3">
                  <div className="flex items-center gap-2">
                    <NumberInput
                      aria-label={t("packSize")}
                      value={p.packSize}
                      maxDigits={6}
                      onChange={(v) => update(p.key, { packSize: v })}
                      placeholder="25"
                      aria-invalid={isDuplicate(p) || (tried && wrong.size) ? true : undefined}
                      className={`tabular min-h-11 w-20 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(isDuplicate(p) || (tried && wrong.size))}`}
                    />
                    <div role="group" aria-label={t("unit")} className="flex flex-1 gap-1">
                      {CODES.map((code) => (
                        <button
                          key={code}
                          type="button"
                          aria-pressed={p.packSizeCode === code}
                          onClick={() => update(p.key, { packSizeCode: code })}
                          className={cn(chip(p.packSizeCode === code), "flex-1 px-1")}
                        >
                          {t(`units.${code}`)}
                        </button>
                      ))}
                    </div>
                    {packs.length > 1 && (
                      <button
                        type="button"
                        aria-label={t("removePack", { n: i + 1 })}
                        onClick={() => setPacks((all) => all.filter((x) => x.key !== p.key))}
                        className="grid size-11 shrink-0 place-items-center rounded-control border border-chestnut/40 hover:border-chestnut"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                  {/* GST %, then the rate per unit before GST or the price with GST: type either one */}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs text-chestnut/80">{t("gst")}</span>
                      <NumberInput
                        value={p.gstPercent}
                        decimals={2}
                        maxDigits={3}
                        onChange={(v) => update(p.key, { gstPercent: v })}
                        placeholder="5"
                        className={`tabular min-h-11 min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(tried && wrong.gst)}`}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-xs text-chestnut/80">{t("rate", { unit: t(`units.${p.packSizeCode}`) })}</span>
                      <NumberInput
                        value={p.rate}
                        decimals={2}
                        onChange={(v) => update(p.key, { rate: v, from: "rate" })}
                        placeholder="55.24"
                        className={`tabular min-h-11 min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(false)}`}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-xs text-chestnut/80">{t("price")}</span>
                      <NumberInput
                        value={p.priceAfterGst}
                        decimals={2}
                        onChange={(v) => update(p.key, { priceAfterGst: v, from: "price" })}
                        placeholder="1450"
                        className={`tabular min-h-11 min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(tried && wrong.price)}`}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setPacks((all) => [...all, emptyPack(Math.max(...all.map((x) => x.key)) + 1)])}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-dashed border-chestnut/60 text-sm font-medium hover:border-chestnut"
            >
              <Plus className="size-4" aria-hidden /> {t("anotherPack")}
            </button>
          </fieldset>

          {/* what to fix: the highlighted fields, or the server's reason */}
          {duplicates.length > 0 && <FieldMessage>{t("errors.duplicate", { packs: duplicates.join(", ") })}</FieldMessage>}
          {tried && !filled && <FieldMessage>{t("errors.fill")}</FieldMessage>}
          {serverError && <FieldMessage>{serverError}</FieldMessage>}
        </div>

        {/* the save button stays at the bottom of the sheet */}
        <footer className="flex shrink-0 flex-col border-t border-chestnut/15 px-5 py-4">
          <SubmitButton busy={create.isPending}>{t("save")}</SubmitButton>
        </footer>
      </form>
    </Sheet>
  );
}
