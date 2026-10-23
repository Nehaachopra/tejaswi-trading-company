"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { Sheet } from "~/components/ui/sheet";
import { toast } from "~/components/ui/toast";
import { packLabel, rupees } from "~/lib/format";
import { parseAmount } from "~/lib/price";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { categoryError } from "../categories/category-errors";
import { CODES, emptyPack, packInput, packKey, packOk, packProblems, type PackDraft, settle, wholeAbove0 } from "./pack-draft";
import { PackChips } from "./pack-chips";
import { PhotoPicker } from "./photo-picker";
import { RowPicker, rowInput } from "./product-details";
import { productTitle } from "./product-tile";

const headerButton =
  "grid size-9 shrink-0 place-items-center rounded-control border border-chestnut/50 hover:border-chestnut disabled:opacity-30";
const tableInput = (bad: boolean) => cn(rowInput(bad), "tabular w-28 min-h-9");

// a new product, laid out like a product's sheet: its pack sizes in the header (+ for another, the bin removes
// the one shown), then Product details and Price details with every field open to type in
export function NewProductSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("products.items");
  const utils = trpc.useUtils();
  const create = trpc.inventory.product.create.useMutation();
  // the active categories and their active sub-categories, for the dropdowns
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false }, { enabled: open });

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

  const category = categories.data?.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];
  const sub = subs.find((s) => s.id === subCategoryId);
  const pack = packs.find((p) => p.key === shown) ?? packs[0]!;

  // what's missing or wrong
  const bad = {
    category: !categoryId,
    subCategory: !subCategoryId,
    brand: brand.trim() === "" || brand.trim().length > 50,
    name: name.trim().length > 50,
    hsn: hsn.trim() !== "" && !/^\d{4}$/.test(hsn.trim()),
  };
  const detailsOk = !Object.values(bad).some(Boolean);
  const keys = packs.filter((p) => wholeAbove0(p.packSize)).map((p) => packKey(p.packSizeCode, p.packSize));
  const isDuplicate = (p: PackDraft) => wholeAbove0(p.packSize) && keys.filter((k) => k === packKey(p.packSizeCode, p.packSize)).length > 1;
  const duplicates = [...new Set(packs.filter(isDuplicate).map((p) => packLabel(Number(p.packSize), p.packSizeCode)))];

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
        hsn4Digit: hsn.trim() || undefined,
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

  // the details rows, each an input or a dropdown
  const detailRows: { label: string; field: React.ReactNode }[] = [
    {
      label: t("category"),
      field: (
        <RowPicker
          label={t("category")}
          current={category?.name}
          items={categories.data ?? []}
          picked={categoryId}
          onPick={(id) => {
            if (id !== categoryId) setSubCategoryId(null);
            setCategoryId(id);
          }}
          invalid={tried && bad.category}
        />
      ),
    },
    {
      label: t("subCategory"),
      field: (
        <RowPicker
          label={t("subCategory")}
          current={sub?.name}
          items={subs}
          picked={subCategoryId}
          onPick={setSubCategoryId}
          invalid={tried && bad.subCategory}
          disabled={subs.length === 0}
        />
      ),
    },
    {
      label: t("brand"),
      field: <input aria-label={t("brand")} value={brand} maxLength={50} onChange={(e) => setBrand(e.target.value)} className={rowInput(tried && bad.brand)} />,
    },
    {
      label: t("name"),
      field: <input aria-label={t("name")} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} className={rowInput(tried && bad.name)} />,
    },
    {
      label: t("hsn"),
      field: (
        <input
          aria-label={t("hsn")}
          value={hsn}
          inputMode="numeric"
          maxLength={4}
          onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))}
          className={cn(rowInput(tried && bad.hsn), "tabular")}
        />
      ),
    },
  ];

  // the price rows for the pack size shown: size and unit, GST %, rate or price (either fills the other in),
  // and what follows from them
  const wrong = packProblems(pack);
  const unit = t(`form.units.${pack.packSizeCode}`);
  const after = parseAmount(pack.priceAfterGst);
  const gstPct = parseAmount(pack.gstPercent);
  const before = after != null && gstPct != null && gstPct <= 100 ? Math.round((after / (1 + gstPct / 100)) * 100) / 100 : null;
  const dash = (v: number | null) => (v == null ? "–" : rupees(v));
  const priceRows: { label: string; field?: React.ReactNode; value?: string; strong?: boolean }[] = [
    {
      label: t("form.packSize"),
      field: (
        <div className="flex justify-end gap-1.5">
          <NumberInput
            aria-label={t("form.packSize")}
            value={pack.packSize}
            maxDigits={6}
            onChange={(v) => update({ packSize: v })}
            placeholder="25"
            className={cn(tableInput(isDuplicate(pack) || (tried && wrong.size)), "w-16")}
          />
          <div className="w-20">
            <RowPicker
              label={t("form.unit")}
              current={unit}
              items={CODES.map((c) => ({ id: c, name: t(`form.units.${c}`) }))}
              picked={pack.packSizeCode}
              onPick={(c) => update({ packSizeCode: c as PackDraft["packSizeCode"] })}
              invalid={false}
            />
          </div>
        </div>
      ),
    },
    {
      label: t("gstLabel"),
      field: (
        <NumberInput aria-label={t("gstLabel")} value={pack.gstPercent} decimals={2} maxDigits={3} onChange={(v) => update({ gstPercent: v })} placeholder="5" className={tableInput(tried && wrong.gst)} />
      ),
    },
    {
      label: t("rateLabel", { unit }),
      field: (
        <NumberInput aria-label={t("rateLabel", { unit })} value={pack.rate} decimals={2} onChange={(v) => update({ rate: v, from: "rate" })} className={tableInput(false)} />
      ),
    },
    { label: t("priceBeforeGst"), value: dash(before) },
    { label: gstPct == null ? t("gst") : t("gstAmount", { gst: gstPct }), value: dash(after != null && before != null ? after - before : null) },
    {
      label: t("priceWithGst"),
      strong: true,
      field: (
        <NumberInput
          aria-label={t("priceWithGst")}
          value={pack.priceAfterGst}
          decimals={2}
          onChange={(v) => update({ priceAfterGst: v, from: "price" })}
          className={cn(tableInput(tried && wrong.price), "font-semibold")}
        />
      ),
    },
  ];

  return (
    <Sheet
      open={open}
      title={t("form.addTitle")}
      closeLabel={t("close")}
      onClose={onClose}
      // the pack sizes typed so far, with + to add another
      visual={
        <div className="flex items-center gap-1.5">
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
          <button
            type="button"
            aria-label={t("addPack")}
            title={t("addPack")}
            onClick={addPack}
            className="grid size-8 shrink-0 place-items-center rounded-control border border-dashed border-chestnut/60 hover:border-chestnut"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      }
      // remove the pack size shown (there's always at least one)
      actions={
        <button
          type="button"
          aria-label={t("form.removePack", { n: packs.indexOf(pack) + 1 })}
          title={t("form.removePack", { n: packs.indexOf(pack) + 1 })}
          onClick={removePack}
          disabled={packs.length === 1}
          className={cn(headerButton, "text-danger")}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      }
    >
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {/* product details: the photo beside the rows */}
          <section className="flex flex-col gap-2">
            <h2 className="flex min-h-11 items-center text-xs text-chestnut/80">{t("productDetails")}</h2>
            <div className="flex gap-4">
              <PhotoPicker variant="square" value={imageUrl} onChange={setImageUrl} onBusy={setUploading} className="w-2/5 max-w-40 shrink-0 self-start" />
              <dl className="flex min-w-0 flex-1 flex-col justify-center divide-y divide-chestnut/10 text-sm">
                {detailRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2 py-1">
                    <dt className="w-24 shrink-0 text-chestnut/70">{row.label}</dt>
                    <dd className="min-w-0 flex-1 text-right font-medium">{row.field}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {category && subs.length === 0 && <FieldMessage>{t("form.noSubCategories")}</FieldMessage>}
          </section>

          {/* price details for the pack size shown */}
          <section className="flex flex-col gap-2">
            <h2 className="flex min-h-11 items-center text-xs text-chestnut/80">{t("priceDetails")}</h2>
            <table className="w-full overflow-hidden rounded-control text-sm">
              <tbody className="divide-y divide-chestnut/10">
                {priceRows.map((row) => (
                  <tr key={row.label} className={cn(row.strong && "bg-chestnut/6 font-semibold")}>
                    <th scope="row" className="px-3 py-2 text-left font-normal text-chestnut/80">
                      {row.label}
                    </th>
                    <td className={cn("tabular px-3 text-right", row.field ? "py-1" : "py-2", row.value === "–" && "text-chestnut/60")}>
                      {row.field ?? row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* what to fix: the highlighted fields, or the server's reason */}
          {duplicates.length > 0 && <FieldMessage>{t("form.errors.duplicate", { packs: duplicates.join(", ") })}</FieldMessage>}
          {tried && (!detailsOk || !packs.every(packOk)) && <FieldMessage>{t("form.errors.fill")}</FieldMessage>}
          {serverError && <FieldMessage>{serverError}</FieldMessage>}
        </div>

        {/* the save button stays at the bottom of the sheet */}
        <footer className="flex shrink-0 flex-col border-t border-chestnut/15 px-5 py-4">
          <SubmitButton busy={create.isPending || uploading}>{t("form.save")}</SubmitButton>
        </footer>
      </form>
    </Sheet>
  );
}
