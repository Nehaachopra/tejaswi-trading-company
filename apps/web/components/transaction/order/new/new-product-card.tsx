"use client";

import { Plus, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { fieldClass } from "~/components/ui/card-form";
import { Spinner } from "~/components/ui/icons/spinner";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { toast } from "~/components/ui/toast";
import { packLabel, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useProductActions, useProducts } from "~/providers/products";

import { categoryError } from "../../../product/categories/category-errors";
import { CategoryFields } from "../../../product/products/category-fields";
import { GstPicker } from "../../../product/products/gst-picker";
import { CODES, type Code, percent, wholeAbove0 } from "../../../product/products/pack-draft";
import { brandChars } from "../../../product/products/product-details";
import { type ProductGroup, productTitle } from "../../../product/products/product-tile";
import { similarProducts } from "../../../product/products/similar";
import { PackCountInput } from "../../../product/products/pack-count-input";
import { PickMenu } from "../../../stock/pick-menu";
import { Reveal } from "~/components/ui/reveal";
import { fieldRow, pickRow } from "../../shared/form-basics";

// a box's value at its right end, as in the New product sheet
const input = (bad: boolean) =>
  cn(
    "min-h-11 w-full min-w-0 px-3 text-right text-base placeholder:text-chestnut/50",
    fieldClass(bad),
  );

// the GST % most of a sub-category's pack sizes already have (none when it has none)
function usualGst(products: ProductGroup[], subCategoryId: string) {
  const counts = new Map<number, number>();
  for (const g of products.filter((g) => g.subCategoryId === subCategoryId))
    for (const p of g.packs)
      if (p.gstPercent != null) counts.set(p.gstPercent, (counts.get(p.gstPercent) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// a purchase order's last product card: a dashed + New product. It opens a popup like the line card's, over the dimmed
// page, with the five things a new product needs: category, sub-category, brand, pack size with its unit, and GST %
// (filled in from the sub-category's other products, still changeable). Add product saves it at once, with no selling
// price yet, and its line card opens next to type the cost and quantity. Products that look like it are listed as a
// warning. The ✕ closes it; a tap on the dim area or Escape only while nothing is typed, so nothing typed is lost
export function NewProductCard({
  open,
  onOpen,
  onClose,
  onCreated,
  tile = true,
}: {
  // the dashed card after the last product (a purchase opens it from a button instead)
  tile?: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCreated: (productId: string) => void;
}) {
  const t = useTranslations("products.items");
  const to = useTranslations("orders");
  const { create, refreshProducts } = useProductActions();
  // every product, inactive too: for the usual GST % and the look-alike warning
  const all = useProducts({ includeInactive: true }, open);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [packSize, setPackSize] = useState("");
  // how many of that size make one pack (1 ltr × 10)
  const [packCount, setPackCount] = useState("1");
  const [unit, setUnit] = useState<Code>("KGS");
  const [gst, setGst] = useState("");
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // each time it opens: empty
  useEffect(() => {
    if (!open) return;
    setCategoryId(null);
    setSubCategoryId(null);
    setBrand("");
    setPackSize("");
    setPackCount("1");
    setUnit("KGS");
    setGst("");
    setTried(false);
    setServerError(null);
  }, [open]);

  // nothing typed yet: a tap outside or Escape may close it
  const untouched = !categoryId && !subCategoryId && brand === "" && packSize === "" && gst === "";

  // while open the page behind doesn't scroll, and Escape closes it while nothing is typed
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && untouched && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, untouched, onClose]);

  // a sub-category picked: its usual GST % fills in (changeable)
  function pickSub(id: string | null) {
    setSubCategoryId(id);
    const usual = id ? usualGst(all.data ?? [], id) : null;
    if (usual != null) setGst(String(usual));
  }

  const bad = {
    category: !categoryId,
    subCategory: !subCategoryId,
    brand: brand.trim() === "",
    size: !wholeAbove0(packSize) || !wholeAbove0(packCount),
    gst: !percent(gst),
  };
  const ok = !Object.values(bad).some(Boolean);
  // one after the other: the category (its sub-category appears once it's picked), then the brand once there's a
  // sub-category, the pack size once a brand is typed, and the GST % and Add product once the pack size is
  const step = {
    brand: !!subCategoryId,
    pack: !!subCategoryId && brand.trim() !== "",
    gst: !!subCategoryId && brand.trim() !== "" && wholeAbove0(packSize),
  };
  const similar = similarProducts(all.data ?? [], { brand, name: "", categoryId });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    if (!ok) return;
    try {
      const created = await create.mutateAsync({
        fromPurchase: true,
        categoryId: categoryId!,
        subCategoryId: subCategoryId!,
        brand,
        packs: [{ packSizeCode: unit, packSize: Number(packSize), packCount: Number(packCount), gstPercent: Number(gst) }],
      });
      toast.success(t("form.toast.added", { name: productTitle(created) }));
      refreshProducts();
      const made = created.packs.find(
        (p) => p.packSizeCode === unit && p.packSize === Number(packSize) && p.packCount === Number(packCount),
      );
      onClose();
      if (made) onCreated(made.productId);
    } catch (err) {
      const key = categoryError(err);
      setServerError(
        t(
          `form.errors.${key === "hasProducts" ? "inactive" : key === "invalidName" ? "check" : key}`,
        ),
      );
    }
  }

  return (
    <>
      {/* the dashed card after the last product */}
      {tile && (
      <li className="flex min-w-0">
        <button
          type="button"
          onClick={onOpen}
          className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-control border border-dashed border-chestnut/40 p-3.5 text-sm font-semibold transition-colors hover:bg-chestnut/[0.04]"
        >
          <Plus className="size-6" aria-hidden />
          {to("newProduct")}
        </button>
      </li>
      )}

      {/* the popup, straight on the page's body as the line card is, so nothing on the page sits over it */}
      {open &&
        createPortal(
          <div
            onClick={(e) => e.target === e.currentTarget && untouched && onClose()}
            className="fixed inset-0 z-50 grid animate-fade-in place-items-center overflow-y-auto bg-[rgba(30,12,6,0.62)] p-4 backdrop-blur-[3px]"
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-label={to("newProduct")}
              onSubmit={submit}
              noValidate
              className="on-ivory flex w-[min(340px,100%)] animate-zoom-in flex-col gap-3 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
            >
              {/* its name and ✕ on top */}
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-bold">{to("newProduct")}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("close")}
                  className="grid place-items-center rounded-control p-2 hover:bg-chestnut/8"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>

              {/* category, then its sub-category (+ New in each) */}
              <CategoryFields
                categoryId={categoryId}
                subCategoryId={subCategoryId}
                onChange={(patch) => {
                  if (patch.categoryId !== undefined) setCategoryId(patch.categoryId);
                  pickSub(patch.subCategoryId);
                }}
                categoryInvalid={tried && bad.category}
                subInvalid={tried && bad.subCategory}
                labelClass={pickRow}
                pickEnd
              />

              {/* brand, once there's a sub-category, with the look-alikes under it */}
              <Reveal show={step.brand} gap="0.75rem">
                {/* the gap goes inside: the reveal wraps its parts in a box of its own */}
                <div className="flex flex-col gap-3">
                  <label className={fieldRow}>
                    <span>
                      {t("brand")}
                      <RequiredMark />
                    </span>
                    <input
                      value={brand}
                      placeholder={t("form.brandPlaceholder")}
                      maxLength={50}
                      onChange={(e) => setBrand(brandChars(e.target.value))}
                      aria-invalid={(tried && bad.brand) || undefined}
                      className={input(tried && bad.brand)}
                    />
                  </label>

                  {/* products already listed that look like this one: a warning, so the same one isn't added twice */}
                  {similar.length > 0 && (
                    <div
                      role="status"
                      className="flex flex-col gap-1.5 rounded-control bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800"
                    >
                      <p className="flex items-start gap-2 font-semibold">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {t("form.similar")}
                      </p>
                      <ul className="flex flex-col gap-1 pl-6">
                        {similar.map((g) => (
                          <li
                            key={g.key}
                            className="flex flex-wrap items-baseline justify-between gap-x-3"
                          >
                            <span className="font-medium">{productTitle(g)}</span>
                            <span className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="opacity-80">{titleCase(g.subCategoryName)}</span>
                              {g.packs.map((p) => (
                                <span
                                  key={p.productId}
                                  className="rounded-full border border-amber-800/30 px-1.5 py-px"
                                >
                                  {packLabel(p.packSize, p.packSizeCode, p.packCount)}
                                </span>
                              ))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Reveal>

              {/* pack size, its unit and × how many make one pack, all three in the row, once a brand is typed */}
              <Reveal show={step.pack} gap="0.75rem">
                <div className={fieldRow}>
                  <span>
                    {t("form.packSize")}
                    <RequiredMark />
                  </span>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <NumberInput
                      aria-label={t("form.packSize")}
                      value={packSize}
                      maxDigits={5}
                      placeholder="25"
                      onChange={(v) => setPackSize(v.replace(/^0+/, ""))}
                      aria-invalid={(tried && bad.size) || undefined}
                      className={cn(input(tried && bad.size), "tabular px-2")}
                    />
                    <div className="w-16 shrink-0">
                      <PickMenu
                        label={t("form.packUnit")}
                        current={t(`form.units.${unit}`)}
                        options={CODES.map((c) => ({ id: c, name: t(`form.units.${c}`) }))}
                        picked={unit}
                        onPick={(c) => setUnit(c as Code)}
                        matchWidth
                        valueEnd
                      />
                    </div>
                    <PackCountInput value={packCount} onChange={setPackCount} invalid={tried && bad.size} />
                  </div>
                </div>
              </Reveal>

              {/* GST % (the sub-category's usual one, filled in) and Add product, once the pack size is typed */}
              <Reveal show={step.gst} gap="0.75rem">
                {/* the gap goes inside: the reveal wraps its parts in a box of its own */}
                <div className="flex flex-col gap-3">
                  <div className={pickRow}>
                    <span>
                      {t("gstLabel")}
                      <RequiredMark />
                    </span>
                    <GstPicker value={gst} onPick={setGst} invalid={tried && bad.gst} pickEnd />
                  </div>

                  {/* what to fix, then Add product (full width, as the line card's Add to order) */}
                  {tried && !ok && (
                    <FieldMessage className="mt-0">{t("form.errors.fill")}</FieldMessage>
                  )}
                  {serverError && <FieldMessage className="mt-0">{serverError}</FieldMessage>}
                  <button
                    type="submit"
                    disabled={create.isPending}
                    aria-busy={create.isPending}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-chestnut px-5 font-heading text-lg font-bold text-ivory aria-busy:opacity-80"
                  >
                    {create.isPending && <Spinner className="size-5" />}
                    {t("form.addTitle")}
                  </button>
                </div>
              </Reveal>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
