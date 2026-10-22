"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { toast } from "~/components/ui/toast";
import { packLabel, titleCase } from "~/lib/format";
import { asField, packPriceFromRate, parseAmount, rateFromPackPrice } from "~/lib/price";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { categoryError } from "../categories/category-errors";
import { PhotoPicker } from "./photo-picker";
import { type ProductGroup, productTitle } from "./product-tile";

// what the sheet is for: a new product, or more pack sizes for one (its details are edited in place)
export type FormMode = { kind: "new" } | { kind: "addPack"; group: ProductGroup };

const CODES = ["KGS", "ML", "BOX", "PCS"] as const;
type Code = (typeof CODES)[number];
// a pack size being typed; the rate (per unit, before GST) and the price (GST included) fill each other in,
// and `from` remembers which was typed last, so a new size or GST % recalculates the other one
type PackDraft = {
  key: number;
  packSizeCode: Code;
  packSize: string;
  gstPercent: string;
  rate: string;
  priceAfterGst: string;
  from: "rate" | "price";
};

const emptyPack = (key: number): PackDraft => ({
  key,
  packSizeCode: "KGS",
  packSize: "",
  gstPercent: "",
  rate: "",
  priceAfterGst: "",
  from: "price",
});

// after any change, work out whichever of rate and price wasn't typed last
function settle(p: PackDraft): PackDraft {
  const size = wholeAbove0(p.packSize) ? Number(p.packSize) : null;
  const gst = parseAmount(p.gstPercent);
  if (size == null || gst == null || gst > 100) return p;
  if (p.from === "rate") {
    const rate = parseAmount(p.rate);
    return rate == null ? p : { ...p, priceAfterGst: asField(packPriceFromRate(rate, size, gst)) };
  }
  const price = parseAmount(p.priceAfterGst);
  return price == null ? p : { ...p, rate: asField(rateFromPackPrice(price, size, gst)) };
}

const packKey = (code: string, size: string | number) => `${code}:${Number(size)}`;

// numbers as typed: a pack size is a whole number above 0; GST 0–100; a price 0 or more, up to paise
const wholeAbove0 = (v: string) => /^\d+$/.test(v.trim()) && Number(v) > 0;
const percent = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) <= 100;
const money = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());

export function ProductFormSheet({
  mode,
  onClose,
}: {
  mode: FormMode | null;
  onClose: () => void;
}) {
  const t = useTranslations("products.items.form");
  const utils = trpc.useUtils();
  const create = trpc.inventory.product.create.useMutation();
  // the active categories and their active sub-categories, for the pickers
  const categories = trpc.inventory.category.list.useQuery(
    { includeInactive: false },
    { enabled: !!mode },
  );

  // the form: where it goes, what it's called, and its pack sizes
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [hsn, setHsn] = useState("");
  // the photo's link once uploaded, and whether one is uploading (saving waits for it)
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [packs, setPacks] = useState<PackDraft[]>([emptyPack(0)]);
  // after a save attempt, the fields that need attention are outlined in red
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // each time it opens, start from the product (more pack sizes), or empty
  useEffect(() => {
    if (!mode) return;
    const group = mode.kind === "new" ? null : mode.group;
    setCategoryId(group?.categoryId ?? null);
    setSubCategoryId(group?.subCategoryId ?? null);
    setBrand(group ? titleCase(group.brand) : "");
    setName(group?.name ? titleCase(group.name) : "");
    setHsn(group?.hsn4Digit ?? "");
    setImageUrl(group?.imageUrl ?? null);
    setPacks([emptyPack(0)]);
    setTried(false);
    setServerError(null);
  }, [mode]);

  const showWhere = mode?.kind !== "addPack";
  const subs = categories.data?.find((c) => c.id === categoryId)?.subCategories ?? [];

  // what's missing or wrong, field by field
  const bad = {
    category: showWhere && !categoryId,
    subCategory: showWhere && !subCategoryId,
    brand: showWhere && (brand.trim() === "" || brand.trim().length > 50),
    name: showWhere && name.trim().length > 50,
    hsn: showWhere && hsn.trim() !== "" && !/^\d{4}$/.test(hsn.trim()),
    pack: (p: PackDraft) => ({
      size: !wholeAbove0(p.packSize),
      gst: !percent(p.gstPercent),
      price: !money(p.priceAfterGst),
    }),
  };

  // duplicate pack sizes: typed twice here, or (adding pack sizes) one the product already has
  const existing = new Set(
    mode?.kind === "addPack"
      ? mode.group.packs.map((p) => packKey(p.packSizeCode, p.packSize))
      : [],
  );
  const typed = packs
    .filter((p) => wholeAbove0(p.packSize))
    .map((p) => packKey(p.packSizeCode, p.packSize));
  const isDuplicate = (p: PackDraft) => {
    if (!wholeAbove0(p.packSize)) return false;
    const k = packKey(p.packSizeCode, p.packSize);
    return existing.has(k) || typed.filter((x) => x === k).length > 1;
  };
  const duplicates = [
    ...new Set(packs.filter(isDuplicate).map((p) => packLabel(Number(p.packSize), p.packSizeCode))),
  ];

  const packsOk =
    packs.every((p) => Object.values(bad.pack(p)).every((v) => !v)) && duplicates.length === 0;
  const othersOk =
    !bad.category &&
    !bad.subCategory &&
    !bad.brand &&
    !bad.name &&
    !bad.hsn &&
    packs.every((p) => Object.values(bad.pack(p)).every((v) => !v));
  const valid = othersOk && packsOk;

  const update = (key: number, patch: Partial<PackDraft>) =>
    setPacks((all) => all.map((p) => (p.key === key ? settle({ ...p, ...patch }) : p)));

  // save: create the product, or its new pack sizes; the page then refreshes behind
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    if (!mode || !valid || uploading) return;

    const packInput = packs.map((p) => ({
      packSizeCode: p.packSizeCode,
      packSize: Number(p.packSize),
      gstPercent: Number(p.gstPercent),
      priceAfterGst: Number(p.priceAfterGst),
    }));

    try {
      if (mode.kind === "new") {
        const created = await create.mutateAsync({
          categoryId: categoryId!,
          subCategoryId: subCategoryId!,
          brand,
          name: name.trim() || undefined,
          hsn4Digit: hsn.trim() || undefined,
          imageUrl: imageUrl ?? undefined,
          packs: packInput,
        });
        toast.success(t("toast.added", { name: productTitle(created) }));
      } else {
        const g = mode.group;
        // the new pack sizes start with the product's photo; each can be changed afterwards
        await create.mutateAsync({
          categoryId: g.categoryId,
          subCategoryId: g.subCategoryId,
          brand: g.brand,
          name: g.name ?? undefined,
          imageUrl: g.imageUrl ?? undefined,
          packs: packInput,
        });
        toast.success(t("toast.packsAdded", { name: productTitle(g) }));
      }
      void utils.inventory.product.list.invalidate();
      void utils.inventory.category.list.invalidate();
      onClose();
    } catch (err) {
      const key = categoryError(err);
      setServerError(
        key === "taken"
          ? t("errors.taken")
          : key === "hasProducts"
            ? t("errors.inactive")
            : t(`errors.${key === "invalidName" ? "check" : key}`),
      );
    }
  }

  const title = !mode
    ? ""
    : mode.kind === "new"
      ? t("addTitle")
      : t("addPackTitle", { name: productTitle(mode.group) });
  const chip = (on: boolean) =>
    cn(
      "min-h-9 rounded-control border px-3 text-sm transition-colors",
      on
        ? "border-chestnut bg-chestnut font-medium text-ivory"
        : "border-chestnut/60 hover:border-chestnut",
    );

  return (
    <Sheet open={!!mode} title={title} closeLabel={t("close")} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {showWhere && (
            <>
              {/* the starting photo for every pack size; each can be changed afterwards */}
              <PhotoPicker value={imageUrl} onChange={setImageUrl} onBusy={setUploading} />

              {/* category, then its sub-categories */}
              <fieldset className="flex flex-col gap-2">
                <legend
                  className={cn("mb-2 text-sm", tried && bad.category && "font-medium text-danger")}
                >
                  {t("category")}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(categories.data ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={categoryId === c.id}
                      onClick={() => {
                        setCategoryId(c.id);
                        if (c.id !== categoryId) setSubCategoryId(null);
                      }}
                      className={chip(categoryId === c.id)}
                    >
                      {titleCase(c.name)}
                    </button>
                  ))}
                </div>
              </fieldset>
              {categoryId && (
                <fieldset className="flex flex-col gap-2">
                  <legend
                    className={cn(
                      "mb-2 text-sm",
                      tried && bad.subCategory && "font-medium text-danger",
                    )}
                  >
                    {t("subCategory")}
                  </legend>
                  {subs.length === 0 ? (
                    <p className="text-sm text-chestnut/80">{t("noSubCategories")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {subs.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={subCategoryId === s.id}
                          onClick={() => setSubCategoryId(s.id)}
                          className={chip(subCategoryId === s.id)}
                        >
                          {titleCase(s.name)}
                        </button>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}

              {/* brand, the optional name, the optional HSN */}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm">{t("brand")}</span>
                <input
                  value={brand}
                  maxLength={50}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder={t("brandPlaceholder")}
                  aria-invalid={tried && bad.brand ? true : undefined}
                  className={`min-h-11 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(tried && bad.brand)}`}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm">{t("name")}</span>
                  <input
                    value={name}
                    maxLength={50}
                    onChange={(e) => setName(e.target.value)}
                    className={`min-h-11 min-w-0 px-3 text-base ${fieldClass(tried && bad.name)}`}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm">{t("hsn")}</span>
                  <input
                    value={hsn}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))}
                    placeholder="1006"
                    className={`tabular min-h-11 min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(tried && bad.hsn)}`}
                  />
                </label>
              </div>
            </>
          )}

          {/* pack sizes: size and unit, GST %, price with GST; one or more */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm">{t("packs")}</legend>
            {packs.map((p, i) => {
              const wrong = bad.pack(p);
              return (
                <div
                  key={p.key}
                  className="flex flex-col gap-2 rounded-control border border-chestnut/20 p-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={t("packSize")}
                      value={p.packSize}
                      inputMode="numeric"
                      onChange={(e) =>
                        update(p.key, { packSize: e.target.value.replace(/\D/g, "") })
                      }
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
                      <input
                        value={p.gstPercent}
                        inputMode="decimal"
                        onChange={(e) => update(p.key, { gstPercent: e.target.value })}
                        placeholder="5"
                        className={`tabular min-h-11 min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(tried && wrong.gst)}`}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-xs text-chestnut/80">
                        {t("rate", { unit: t(`units.${p.packSizeCode}`) })}
                      </span>
                      <input
                        value={p.rate}
                        inputMode="decimal"
                        onChange={(e) => update(p.key, { rate: e.target.value, from: "rate" })}
                        placeholder="55.24"
                        className={`tabular min-h-11 min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(false)}`}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-xs text-chestnut/80">{t("price")}</span>
                      <input
                        value={p.priceAfterGst}
                        inputMode="decimal"
                        onChange={(e) =>
                          update(p.key, { priceAfterGst: e.target.value, from: "price" })
                        }
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
              onClick={() =>
                setPacks((all) => [...all, emptyPack(Math.max(...all.map((x) => x.key)) + 1)])
              }
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-dashed border-chestnut/60 text-sm font-medium hover:border-chestnut"
            >
              <Plus className="size-4" aria-hidden /> {t("anotherPack")}
            </button>
          </fieldset>

          {/* what to fix: the highlighted fields, or the server's reason */}
          {duplicates.length > 0 && (
            <FieldMessage>{t("errors.duplicate", { packs: duplicates.join(", ") })}</FieldMessage>
          )}
          {tried && !othersOk && <FieldMessage>{t("errors.fill")}</FieldMessage>}
          {serverError && <FieldMessage>{serverError}</FieldMessage>}
        </div>

        {/* the save button stays at the bottom of the sheet */}
        <footer className="flex shrink-0 flex-col border-t border-chestnut/15 px-5 py-4">
          <SubmitButton busy={create.isPending || uploading}>{t("save")}</SubmitButton>
        </footer>
      </form>
    </Sheet>
  );
}
