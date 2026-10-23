"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { packLabel, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { categoryError } from "../../product/categories/category-errors";
import { ProductImage, productTitle } from "../../product/products/product-tile";
import { PickMenu } from "../pick-menu";
import { draftInput, draftOk, emptyDraft, GodownFields, type GodownDraft } from "./godown-fields";

// whole packs, up to a million
const QTY_MAX = 1_000_000;
const quantityOk = (v: string) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= QTY_MAX;

// add a godown in two steps: its details, then the stock already in it (blank = none).
// Both are saved together, so a godown never exists half-entered
export function AddGodownSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("stock.form");
  const tg = useTranslations("stock.godowns");
  const utils = trpc.useUtils();
  const create = trpc.inventory.godown.create.useMutation();
  const products = trpc.inventory.product.list.useQuery({ includeInactive: false }, { enabled: open });
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false }, { enabled: open });

  const [step, setStep] = useState<"details" | "stock">("details");
  const [draft, setDraft] = useState<GodownDraft>(emptyDraft);
  const [tried, setTried] = useState(false);
  // opening quantities typed so far, by pack size
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setStep("details");
    setDraft(emptyDraft());
    setTried(false);
    setQuantities({});
    setCategoryId(null);
    setSubCategoryId(null);
    setError(null);
    onClose();
  };

  // step 1 → step 2 once the details are right
  function next(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (draftOk(draft)) setStep("stock");
  }

  // the typed quantities: which are wrong, and the totals for the footer
  const typed = Object.entries(quantities).filter(([, v]) => v.trim() !== "");
  const wrong = new Set(typed.filter(([, v]) => !quantityOk(v)).map(([id]) => id));
  const units = typed.filter(([id]) => !wrong.has(id)).reduce((sum, [, v]) => sum + Number(v), 0);

  // save the godown with its opening stock
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (wrong.size > 0) return setError(t("errors.quantity"));
    try {
      const created = await create.mutateAsync({
        details: draftInput(draft),
        openingStock: typed.map(([productId, v]) => ({ productId, quantity: Number(v) })),
      });
      toast.success(tg("toast.added", { name: created.godownName }));
      void utils.inventory.godown.list.invalidate();
      void utils.inventory.stock.byGodown.invalidate();
      void utils.inventory.product.list.invalidate();
      close();
    } catch (err) {
      const key = categoryError(err);
      // a taken name belongs to step 1: go back there with the field marked
      if (key === "taken") {
        setStep("details");
        return setError(t("errors.taken"));
      }
      setError(t(`errors.${key === "invalidName" ? "check" : key === "hasProducts" ? "inactive" : key}`));
    }
  }

  // the products for the picked category and sub-category
  const subs = categories.data?.find((c) => c.id === categoryId)?.subCategories ?? [];
  const shown = (products.data ?? []).filter(
    (g) => (!categoryId || g.categoryId === categoryId) && (!subCategoryId || g.subCategoryId === subCategoryId),
  );
  const category = categories.data?.find((c) => c.id === categoryId);
  const sub = subs.find((s) => s.id === subCategoryId);

  return (
    <Sheet open={open} title={t("addTitle")} closeLabel={t("close")} onClose={close}>
      {step === "details" ? (
        // step 1: the details
        <form onSubmit={next} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <GodownFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} tried={tried} />
            {tried && !draftOk(draft) && <FieldMessage>{t("errors.fill")}</FieldMessage>}
            {error && <FieldMessage>{error}</FieldMessage>}
          </div>
          <footer className="flex shrink-0 flex-col border-t border-chestnut/15 px-5 py-4">
            <SubmitButton busy={false}>{t("next")}</SubmitButton>
          </footer>
        </form>
      ) : (
        // step 2: opening stock, filtered by category and sub-category
        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-3 border-b border-chestnut/15 px-5 py-3">
            <p className="text-sm text-chestnut/80">{t("openingHint")}</p>
            <div className="flex flex-wrap gap-2">
              <PickMenu
                label={t("category")}
                current={category ? titleCase(category.name) : t("allCategories")}
                options={[{ id: null, name: t("allCategories") }, ...(categories.data ?? []).map((c) => ({ id: c.id as string | null, name: titleCase(c.name) }))]}
                picked={categoryId}
                onPick={(id) => {
                  setCategoryId(id);
                  setSubCategoryId(null);
                }}
                className="min-h-9 w-auto"
              />
              <PickMenu
                label={t("subCategory")}
                current={sub ? titleCase(sub.name) : t("allSubCategories")}
                options={[{ id: null, name: t("allSubCategories") }, ...subs.map((s) => ({ id: s.id as string | null, name: titleCase(s.name) }))]}
                picked={subCategoryId}
                onPick={setSubCategoryId}
                disabled={subs.length === 0}
                className="min-h-9 w-auto"
              />
            </div>
          </div>

          {/* the products: each with a quantity box per pack size */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            {products.isPending ? (
              <p className="flex items-center justify-center gap-2 py-10 text-chestnut/70">
                <Spinner />
              </p>
            ) : (products.data ?? []).length === 0 ? (
              <p className="py-10 text-center text-chestnut/70">{t("noProducts")}</p>
            ) : shown.length === 0 ? (
              <p className="py-10 text-center text-chestnut/70">{t("noMatch")}</p>
            ) : (
              shown.map((group) => (
                <section key={group.key} className="flex gap-3 rounded-control border border-chestnut/20 p-3">
                  <ProductImage group={group} imageUrl={group.imageUrl} className="size-16 shrink-0 self-start [&_span]:text-xl" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-heading text-base font-bold leading-6">{productTitle(group)}</h3>
                      <p className="truncate text-xs text-chestnut/70">
                        {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
                      </p>
                    </div>
                    {/* one row per pack size: its label and the quantity box */}
                    <ul className="flex flex-col gap-1.5">
                      {group.packs.map((pack) => {
                        const label = packLabel(pack.packSize, pack.packSizeCode);
                        return (
                          <li key={pack.productId} className="flex items-center justify-between gap-3">
                            <span className="tabular text-sm">{label}</span>
                            <NumberInput
                              aria-label={t("quantity", { pack: label })}
                              value={quantities[pack.productId] ?? ""}
                              maxDigits={7}
                              onChange={(v) => setQuantities((q) => ({ ...q, [pack.productId]: v }))}
                              placeholder="0"
                              className={cn(
                                "tabular min-h-10 w-24 px-2.5 text-right text-base placeholder:text-chestnut/40",
                                fieldClass(wrong.has(pack.productId)),
                              )}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </section>
              ))
            )}
          </div>

          {/* the totals, Back, and Save */}
          <footer className="flex shrink-0 flex-col gap-3 border-t border-chestnut/15 px-5 py-4">
            <p className="tabular text-center text-sm text-chestnut/80">{t("summary", { packs: typed.length - wrong.size, units })}</p>
            {error && <FieldMessage>{error}</FieldMessage>}
            <div className="flex gap-2">
              <button
                type="button"
                aria-label={t("back")}
                onClick={() => setStep("details")}
                className="grid size-12 shrink-0 place-items-center rounded-control border border-chestnut/60 hover:border-chestnut"
              >
                <ArrowLeft className="size-5" aria-hidden />
              </button>
              <div className="flex flex-1 flex-col">
                <SubmitButton busy={create.isPending}>{t("save")}</SubmitButton>
              </div>
            </div>
          </footer>
        </form>
      )}
    </Sheet>
  );
}
