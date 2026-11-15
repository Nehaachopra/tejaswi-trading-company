"use client";

import { useTranslations } from "next-intl";

import { fieldClass } from "~/components/ui/card-form";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { titleCase } from "~/lib/format";
import { asField, packPriceFromRate, parseAmount, rateFromPackPrice } from "~/lib/price";
import { cn } from "~/lib/utils";

import { fieldRow, pickRow } from "../../transaction/shared/form-basics";
import { CategoryFields } from "./category-fields";
import { PhotoPicker } from "./photo-picker";
import type { Pack, ProductGroup } from "./product-tile";

type Code = Pack["packSizeCode"];

// lengths follow the products table: brand, name and sub-category 50, HSN 4 or 8 digits, pack size up to 5 digits
const NAME_MAX = 50;

// one pack size's details as typed
export type DetailsDraft = {
  categoryId: string;
  subCategoryId: string | null;
  brand: string;
  name: string;
  packSizeCode: Code;
  packSize: string;
  hsn: string;
  gst: string;
  // the rate per unit (before GST) and the price with GST: either one fills in the other
  rate: string;
  price: string;
  imageUrl: string | null;
  isActive: boolean;
};

// the saved details as a draft, copied once when the drawer opens
export const draftFrom = (group: ProductGroup, pack: Pack): DetailsDraft => ({
  categoryId: group.categoryId,
  subCategoryId: group.subCategoryId,
  brand: titleCase(group.brand),
  name: group.name ? titleCase(group.name) : "",
  packSizeCode: pack.packSizeCode,
  packSize: String(pack.packSize),
  hsn: pack.hsn8Digit ?? group.hsn4Digit ?? "",
  gst: pack.gstPercent == null ? "" : String(pack.gstPercent),
  rate: pack.priceAfterGst == null ? "" : asField(rateFromPackPrice(pack.priceAfterGst, pack.packSize, pack.gstPercent ?? 0)),
  price: pack.priceAfterGst == null ? "" : asField(pack.priceAfterGst),
  imageUrl: pack.imageUrl,
  isActive: pack.isActive,
});

// a change to the draft: a typed rate works the price out; anything else (the price, the pack size, the GST %) keeps
// the price and works the rate out again
export function settleDraft(d: DetailsDraft, patch: Partial<DetailsDraft>): DetailsDraft {
  const next = { ...d, ...patch };
  const size = /^[1-9]\d{0,4}$/.test(next.packSize) ? Number(next.packSize) : null;
  const gst = parseAmount(next.gst);
  if (size == null || gst == null || gst > 100) return next;
  if ("rate" in patch) {
    const rate = parseAmount(next.rate);
    return { ...next, price: rate == null ? "" : asField(packPriceFromRate(rate, size, gst)) };
  }
  const price = parseAmount(next.price);
  return { ...next, rate: price == null ? "" : asField(rateFromPackPrice(price, size, gst)) };
}

// what's missing or wrong, field by field
export function draftProblems(d: DetailsDraft) {
  const gst = Number(d.gst);
  return {
    subCategoryId: !d.subCategoryId,
    brand: d.brand.trim() === "" || d.brand.trim().length > NAME_MAX,
    packSize: !/^[1-9]\d{0,4}$/.test(d.packSize),
    hsn: d.hsn !== "" && !/^(\d{4}|\d{8})$/.test(d.hsn),
    gst: !/^\d+(\.\d{1,2})?$/.test(d.gst) || gst > 100,
    price: !((parseAmount(d.price) ?? 0) > 0),
  };
}

export const draftOk = (d: DetailsDraft) => Object.values(draftProblems(d)).every((bad) => !bad);

// a brand: letters, digits, spaces and & . ' - (India Gate, 24 Mantra, Dr. Oetker)
export const brandChars = (v: string) => v.replace(/[^\p{L}\d &.'-]/gu, "");

// every value at the right end of its box, as in the rows
const input = (bad: boolean) => cn("min-h-11 w-full min-w-0 px-3 text-right text-base placeholder:text-chestnut/50", fieldClass(bad));

// the Product details part, each field a row (label left, value right): the photo, category, sub-category (+ New),
// brand, name, pack size with its unit, and HSN
export function ProductDetails({
  draft,
  onChange,
  onPhotoBusy,
  tried,
}: {
  draft: DetailsDraft;
  onChange: (patch: Partial<DetailsDraft>) => void;
  onPhotoBusy: (busy: boolean) => void;
  tried: boolean;
}) {
  const t = useTranslations("products.items");
  const bad = draftProblems(draft);
  const show = (field: keyof typeof bad) => tried && bad[field];

  return (
    <div className="flex flex-col gap-3.5">
      {/* the photo: a big placeholder until one is uploaded; a camera button over it replaces it */}
      <PhotoPicker variant="big" value={draft.imageUrl} onChange={(imageUrl) => onChange({ imageUrl })} onBusy={onPhotoBusy} />

      {/* category, then its sub-categories (+ New) */}
      <CategoryFields
        categoryId={draft.categoryId}
        subCategoryId={draft.subCategoryId}
        onChange={(patch) => onChange(patch)}
        subInvalid={show("subCategoryId")}
        labelClass={pickRow}
        pickEnd
      />

      {/* brand */}
      <label className={fieldRow}>
        <span>
          {t("brand")}
          <RequiredMark />
        </span>
        <input
          value={draft.brand}
          maxLength={NAME_MAX}
          placeholder={t("form.brandPlaceholder")}
          onChange={(e) => onChange({ brand: brandChars(e.target.value) })}
          aria-invalid={show("brand") || undefined}
          className={input(show("brand"))}
        />
      </label>

      {/* the optional name */}
      <label className={fieldRow}>
        <span className="gap-1">
          {t("name")} <span className="text-xs opacity-60">{t("form.optional")}</span>
        </span>
        <input value={draft.name} maxLength={NAME_MAX} onChange={(e) => onChange({ name: brandChars(e.target.value) })} className={input(false)} />
      </label>

      {/* pack size: the size, and beside it its unit (read only) */}
      <div className={fieldRow}>
        <span>
          {t("form.packSize")}
          <RequiredMark />
        </span>
        <div className="flex min-w-0 gap-2">
          <NumberInput
            aria-label={t("form.packSize")}
            value={draft.packSize}
            maxDigits={5}
            placeholder="25"
            onChange={(v) => onChange({ packSize: v.replace(/^0+/, "") })}
            aria-invalid={show("packSize") || undefined}
            className={cn(input(show("packSize")), "tabular")}
          />
          {/* the unit is set when the product is made and never changes: plain text, a little apart */}
          <span className="ml-2 grid min-h-11 shrink-0 place-items-center text-base">{t(`form.units.${draft.packSizeCode}`)}</span>
        </div>
      </div>

      {/* HSN (GST % sits in the drawer's Price details) */}
      <label className={fieldRow}>
        <span>{t("hsn")}</span>
        <input
          value={draft.hsn}
          inputMode="numeric"
          maxLength={8}
          placeholder="1006"
          onChange={(e) => onChange({ hsn: e.target.value.replace(/\D/g, "").slice(0, 8) })}
          aria-invalid={show("hsn") || undefined}
          className={cn(input(show("hsn")), "tabular")}
        />
      </label>
    </div>
  );
}
