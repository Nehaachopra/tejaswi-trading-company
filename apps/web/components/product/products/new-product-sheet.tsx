"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { addSquare } from "~/components/ui/page-styles";
import { RequiredMark } from "~/components/ui/required-mark";
import { Sheet } from "~/components/ui/sheet";
import { toast } from "~/components/ui/toast";
import { packLabel } from "~/lib/format";
import { parseAmount } from "~/lib/price";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { PickMenu } from "../../stock/pick-menu";
import { PlainRows } from "../../transaction/shared/amount-table";
import { fieldRow, pickRow } from "../../transaction/shared/form-basics";
import { categoryError } from "../categories/category-errors";
import { CategoryFields } from "./category-fields";
import { GstPicker } from "./gst-picker";
import { CODES, emptyPack, packInput, packKey, packOk, packProblems, type PackDraft, settle, wholeAbove0 } from "./pack-draft";
import { PackChips } from "./pack-chips";
import { PhotoPicker } from "./photo-picker";
import { brandChars } from "./product-details";
import { productTitle } from "./product-tile";
import { RatePriceFields } from "./rate-price-fields";

// a part's heading, as in Edit details; the line and room above the second and third parts
const heading = "-mb-1 text-xs font-semibold uppercase tracking-[0.08em] opacity-60";
const part = "mt-2.5 border-t border-chestnut/15 pt-[18px]";
// every value sits at the right end of its box, as in the rows
const input = (bad: boolean) => cn("min-h-11 w-full min-w-0 px-3 text-right text-base placeholder:text-chestnut/50", fieldClass(bad));
// a header button with no border (✕, the bin)
const bareButton = "grid size-11 shrink-0 place-items-center rounded-control hover:bg-chestnut/8 disabled:opacity-30";

const round2 = (v: number) => Math.round(v * 100) / 100;

// a new product, laid out like Edit details: its pack sizes as chips on top (+ for another, the bin removes the one
// shown when there's more than one) and ✕; then Product details (shared by every pack size), Pack size and Price
// details for the chip picked, each field a row (label left, box or accordion right). A new pack size starts
// empty: nothing is copied from another
export function NewProductSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("products.items");
  const utils = trpc.useUtils();
  const create = trpc.inventory.product.create.useMutation();

  // the product
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [hsn, setHsn] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // its pack sizes, and the one shown
  const [packs, setPacks] = useState<PackDraft[]>([emptyPack(0)]);
  const [shown, setShown] = useState(0);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // each time it opens, start empty
  useEffect(() => {
    if (!open) return;
    setCategoryId(null);
    setSubCategoryId(null);
    setBrand("");
    setName("");
    setHsn("");
    setImageUrl(null);
    setPacks([emptyPack(0)]);
    setShown(0);
    setTried(false);
    setServerError(null);
  }, [open]);

  const pack = packs.find((p) => p.key === shown) ?? packs[0]!;

  // what's missing or wrong: the product's details, and each pack size's
  const bad = {
    category: !categoryId,
    subCategory: !subCategoryId,
    brand: brand.trim() === "" || brand.trim().length > 50,
    name: name.trim().length > 50,
    hsn: hsn !== "" && !/^(\d{4}|\d{8})$/.test(hsn),
  };
  const detailsOk = !Object.values(bad).some(Boolean);
  const wrong = packProblems(pack);
  const keys = packs.filter((p) => wholeAbove0(p.packSize)).map((p) => packKey(p.packSizeCode, p.packSize));
  const isDuplicate = (p: PackDraft) => wholeAbove0(p.packSize) && keys.filter((k) => k === packKey(p.packSizeCode, p.packSize)).length > 1;
  const duplicates = [...new Set(packs.filter(isDuplicate).map((p) => packLabel(Number(p.packSize), p.packSizeCode)))];

  // change the pack size shown; rate and price fill each other in
  const update = (patch: Partial<PackDraft>) => setPacks((all) => all.map((p) => (p.key === pack.key ? settle({ ...p, ...patch }) : p)));
  const addPack = () => {
    const key = Math.max(...packs.map((p) => p.key)) + 1;
    setPacks((all) => [...all, emptyPack(key)]);
    setShown(key);
  };
  const removePack = () => {
    const rest = packs.filter((p) => p.key !== pack.key);
    setPacks(rest);
    setShown(rest[0]!.key);
  };

  // save the product with all its pack sizes; a pack size that needs fixing is brought into view
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    const firstBad = packs.find((p) => !packOk(p) || isDuplicate(p));
    if (firstBad) setShown(firstBad.key);
    if (!detailsOk || firstBad || uploading) return;
    try {
      const created = await create.mutateAsync({
        categoryId: categoryId!,
        subCategoryId: subCategoryId!,
        brand,
        name: name.trim() || undefined,
        // the first 4 digits are the product's; all 8, when typed, go on every pack size
        hsn4Digit: hsn ? hsn.slice(0, 4) : undefined,
        hsn8Digit: hsn.length === 8 ? hsn : undefined,
        imageUrl: imageUrl ?? undefined,
        packs: packInput(packs),
      });
      toast.success(t("form.toast.added", { name: productTitle(created) }));
      void utils.inventory.product.list.invalidate();
      void utils.inventory.category.list.invalidate();
      onClose();
    } catch (err) {
      const key = categoryError(err);
      setServerError(t(`form.errors.${key === "hasProducts" ? "inactive" : key === "invalidName" ? "check" : key}`));
    }
  }

  // price details: the typed price with GST, split by the GST % picked
  const unit = t(`form.units.${pack.packSizeCode}`);
  const price = parseAmount(pack.priceAfterGst);
  const gst = parseAmount(pack.gstPercent);
  const before = price != null && gst != null ? round2(price / (1 + gst / 100)) : null;
  const priceRows = [
    { key: "before", label: t("priceBeforeGst"), amount: before },
    { key: "gst", label: gst == null ? t("gst") : t("gstAmount", { gst }), amount: price != null && before != null ? round2(price - before) : null, plus: true },
    { key: "total", label: t("priceWithGst"), amount: price, tone: "total" as const },
  ];

  return (
    <Sheet
      open={open}
      title={t("form.addTitle")}
      closeLabel={t("close")}
      onClose={onClose}
      bareHeader
      // the pack sizes typed so far, with + to add another
      visual={
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0">
            <PackChips
              packs={packs.map((p) => ({
                productId: String(p.key),
                packSize: Number(p.packSize),
                packSizeCode: p.packSizeCode,
                isActive: true,
                name: wholeAbove0(p.packSize) ? undefined : t("form.newPack"),
              }))}
              selected={String(pack.key)}
              onSelect={(key) => setShown(Number(key))}
              label={t("packSizes")}
            />
          </div>
          <button type="button" aria-label={t("addPack")} title={t("addPack")} onClick={addPack} className={addSquare("size-8")}>
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      }
      // the bin (when there's more than one pack size) and ✕, no borders
      actions={
        <div className="flex shrink-0 items-center">
          {packs.length > 1 && (
            <button
              type="button"
              aria-label={t("form.removePack", { n: packs.indexOf(pack) + 1 })}
              title={t("form.removePack", { n: packs.indexOf(pack) + 1 })}
              onClick={removePack}
              className={cn(bareButton, "text-danger")}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
          <button type="button" aria-label={t("close")} onClick={onClose} className={bareButton}>
            <X className="size-5" aria-hidden />
          </button>
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-5 [&>*]:shrink-0">
          {/* product details: shared by every pack size */}
          <h3 className={heading}>{t("productDetails")}</h3>
          <PhotoPicker variant="big" value={imageUrl} onChange={setImageUrl} onBusy={setUploading} />
          <CategoryFields
            categoryId={categoryId}
            subCategoryId={subCategoryId}
            onChange={(patch) => {
              if (patch.categoryId !== undefined) setCategoryId(patch.categoryId);
              setSubCategoryId(patch.subCategoryId);
            }}
            categoryInvalid={tried && bad.category}
            subInvalid={tried && bad.subCategory}
            labelClass={pickRow}
            pickEnd
          />
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
          <label className={fieldRow}>
            <span className="gap-1">
              {t("name")} <span className="text-xs opacity-60">{t("form.optional")}</span>
            </span>
            <input value={name} maxLength={50} onChange={(e) => setName(brandChars(e.target.value))} className={input(tried && bad.name)} />
          </label>
          <label className={fieldRow}>
            <span>{t("hsn")}</span>
            <input
              value={hsn}
              inputMode="numeric"
              maxLength={8}
              placeholder="1006"
              onChange={(e) => setHsn(e.target.value.replace(/\D/g, "").slice(0, 8))}
              aria-invalid={(tried && bad.hsn) || undefined}
              className={cn(input(tried && bad.hsn), "tabular")}
            />
          </label>

          {/* pack size: its unit and size */}
          <h3 className={cn(heading, part)}>{t("form.packSize")}</h3>
          <div className={pickRow}>
            <span>
              {t("form.packUnit")}
              <RequiredMark />
            </span>
            <PickMenu
              label={t("form.packUnit")}
              current={unit}
              options={CODES.map((c) => ({ id: c, name: t(`form.units.${c}`) }))}
              picked={pack.packSizeCode}
              onPick={(c) => update({ packSizeCode: c as PackDraft["packSizeCode"] })}
              matchWidth
              valueEnd
            />
          </div>
          <label className={fieldRow}>
            <span>
              {t("form.packSize")}
              <RequiredMark />
            </span>
            <NumberInput
              value={pack.packSize}
              maxDigits={5}
              placeholder="25"
              onChange={(v) => update({ packSize: v.replace(/^0+/, "") })}
              aria-invalid={(tried && wrong.size) || isDuplicate(pack) || undefined}
              className={cn(input((tried && wrong.size) || isDuplicate(pack)), "tabular")}
            />
          </label>

          {/* price details: GST %, rate and price (either fills in the other), then the split */}
          <h3 className={cn(heading, part)}>{t("priceDetails")}</h3>
          <div className={pickRow}>
            <span>
              {t("gstLabel")}
              <RequiredMark />
            </span>
            <GstPicker value={pack.gstPercent} onPick={(gstPercent) => update({ gstPercent })} invalid={tried && wrong.gst} pickEnd />
          </div>
          <RatePriceFields
            unit={unit}
            rate={pack.rate}
            price={pack.priceAfterGst}
            onRate={(rate) => update({ rate, from: "rate" })}
            onPrice={(priceAfterGst) => update({ priceAfterGst, from: "price" })}
            priceInvalid={tried && wrong.price}
            rows
            placeholders={{ rate: "55.24", price: "1,450" }}
          />
          <PlainRows rows={priceRows} />
        </div>

        {/* what to fix, and Add product, stay at the bottom */}
        <footer className="flex shrink-0 flex-col gap-3 border-t border-chestnut/15 px-5 py-4">
          {duplicates.length > 0 && <FieldMessage className="mt-0">{t("form.errors.duplicate", { packs: duplicates.join(", ") })}</FieldMessage>}
          {tried && (!detailsOk || !packs.every(packOk)) && <FieldMessage className="mt-0">{t("form.errors.fill")}</FieldMessage>}
          {serverError && <FieldMessage className="mt-0">{serverError}</FieldMessage>}
          <SubmitButton busy={create.isPending} disabled={uploading}>
            {t("form.addTitle")}
          </SubmitButton>
        </footer>
      </form>
    </Sheet>
  );
}
