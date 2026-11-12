"use client";

import { useTranslations } from "next-intl";

import { fieldClass } from "~/components/ui/card-form";
import { NumberInput } from "~/components/ui/number-input";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { PickMenu } from "../../stock/pick-menu";
import { fieldRow, pickRow } from "../../transaction/shared/form-basics";
import { CategoryFields } from "./category-fields";
import { GstPicker } from "./gst-picker";
import { PhotoPicker } from "./photo-picker";
import type { Pack, ProductGroup } from "./product-tile";

type Code = Pack["packSizeCode"];
const CODES: Code[] = ["KGS", "ML", "BOX", "PCS"];

// lengths follow the products table: brand and sub-category 50, HSN 4 or 8 digits, pack size up to 5 digits
const NAME_MAX = 50;

// one pack size's details as typed
export type DetailsDraft = {
  categoryId: string;
  subCategoryId: string | null;
  brand: string;
  packSizeCode: Code;
  packSize: string;
  hsn: string;
  gst: string;
  imageUrl: string | null;
  isActive: boolean;
};

// the saved details as a draft, copied once when the drawer opens
export const draftFrom = (group: ProductGroup, pack: Pack): DetailsDraft => ({
  categoryId: group.categoryId,
  subCategoryId: group.subCategoryId,
  brand: titleCase(group.brand),
  packSizeCode: pack.packSizeCode,
  packSize: String(pack.packSize),
  hsn: pack.hsn8Digit ?? group.hsn4Digit ?? "",
  gst: pack.gstPercent == null ? "" : String(pack.gstPercent),
  imageUrl: pack.imageUrl,
  isActive: pack.isActive,
});

// what's missing or wrong, field by field
export function draftProblems(d: DetailsDraft) {
  const gst = Number(d.gst);
  return {
    subCategoryId: !d.subCategoryId,
    brand: d.brand.trim() === "" || d.brand.trim().length > NAME_MAX,
    packSize: !/^[1-9]\d{0,4}$/.test(d.packSize),
    hsn: d.hsn !== "" && !/^(\d{4}|\d{8})$/.test(d.hsn),
    gst: !/^\d+(\.\d{1,2})?$/.test(d.gst) || gst > 100,
  };
}

export const draftOk = (d: DetailsDraft) => Object.values(draftProblems(d)).every((bad) => !bad);

// a brand: letters, digits, spaces and & . ' - (India Gate, 24 Mantra, Dr. Oetker)
export const brandChars = (v: string) => v.replace(/[^\p{L}\d &.'-]/gu, "");

// every value at the right end of its box, as in the rows
const input = (bad: boolean) => cn("min-h-11 w-full min-w-0 px-3 text-right text-base placeholder:text-chestnut/50", fieldClass(bad));

// the Product details part: the photo, then each field a row (label left, value right): category, sub-category
// (+ New), brand, pack unit and size, HSN and GST % (an accordion)
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
        <span>{t("brand")}</span>
        <input
          value={draft.brand}
          maxLength={NAME_MAX}
          placeholder={t("form.brandPlaceholder")}
          onChange={(e) => onChange({ brand: brandChars(e.target.value) })}
          aria-invalid={show("brand") || undefined}
          className={input(show("brand"))}
        />
      </label>

      {/* pack unit, then pack size */}
      <div className={pickRow}>
        <span>{t("form.packUnit")}</span>
        <PickMenu
          label={t("form.packUnit")}
          current={t(`form.units.${draft.packSizeCode}`)}
          options={CODES.map((c) => ({ id: c, name: t(`form.units.${c}`) }))}
          picked={draft.packSizeCode}
          onPick={(packSizeCode) => onChange({ packSizeCode })}
          matchWidth
          valueEnd
        />
      </div>
      <label className={fieldRow}>
        <span>{t("form.packSize")}</span>
        <NumberInput
          value={draft.packSize}
          maxDigits={5}
          placeholder="25"
          onChange={(v) => onChange({ packSize: v.replace(/^0+/, "") })}
          aria-invalid={show("packSize") || undefined}
          className={cn(input(show("packSize")), "tabular")}
        />
      </label>

      {/* HSN, then GST % (an accordion) */}
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
      <div className={pickRow}>
        <span>{t("gstLabel")}</span>
        <GstPicker value={draft.gst} onPick={(gst) => onChange({ gst })} invalid={show("gst")} pickEnd />
      </div>
    </div>
  );
}
