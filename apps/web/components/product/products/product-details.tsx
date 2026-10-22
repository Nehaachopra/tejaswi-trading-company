"use client";

import { Check, ChevronDown, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { categoryError } from "../categories/category-errors";
import { PhotoPicker } from "./photo-picker";
import { type ProductGroup, ProductImage, packImage } from "./product-tile";

type Pack = ProductGroup["packs"][number];

const iconButton =
  "grid size-11 shrink-0 place-items-center rounded-control border border-chestnut/40 hover:border-chestnut disabled:not-aria-busy:opacity-30 aria-busy:opacity-80";
const action =
  "flex min-h-9 items-center justify-center gap-1.5 rounded-control border border-chestnut/50 px-3 text-sm font-medium hover:border-chestnut";
const input = (bad: boolean) => `min-h-10 w-full min-w-0 px-2.5 text-right text-sm ${fieldClass(bad)}`;

// the product's details: the image on the left; category, sub-category, brand (name, HSN) and stock on the right.
// Edit details turns the editable rows into inputs in place, and the image into a photo picker
export function ProductDetails({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const t = useTranslations("products.items");
  const utils = trpc.useUtils();
  const updateDetails = trpc.inventory.product.updateDetails.useMutation();
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false });

  // the draft while editing
  const [editing, setEditing] = useState(false);
  const [categoryId, setCategoryId] = useState(group.categoryId);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(group.subCategoryId);
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [hsn, setHsn] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // another product, or another pack size, closes the editor
  useEffect(() => setEditing(false), [group.key, pack.productId]);

  const startEditing = () => {
    setCategoryId(group.categoryId);
    setSubCategoryId(group.subCategoryId);
    setBrand(titleCase(group.brand));
    setName(group.name ? titleCase(group.name) : "");
    setHsn(group.hsn4Digit ?? "");
    setImageUrl(packImage(group, pack));
    setTried(false);
    setServerError(null);
    setEditing(true);
  };

  // the pickers' choices, and what's wrong with the draft
  const category = categories.data?.find((c) => c.id === categoryId);
  const subs = category?.subCategories ?? [];
  const sub = subs.find((s) => s.id === subCategoryId);
  const bad = {
    subCategory: !subCategoryId,
    brand: brand.trim() === "" || brand.trim().length > 50,
    name: name.trim().length > 50,
    hsn: hsn.trim() !== "" && !/^\d{4}$/.test(hsn.trim()),
  };

  // save every pack size's details at once; the page refreshes behind
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    if (Object.values(bad).some(Boolean) || uploading) return;
    try {
      await updateDetails.mutateAsync({
        productIds: group.packs.map((p) => p.productId),
        categoryId,
        subCategoryId: subCategoryId!,
        brand,
        name: name.trim() || null,
        hsn4Digit: hsn.trim() || null,
        // the photo is this pack size's own, sent only when it was changed
        image: imageUrl !== packImage(group, pack) ? { productId: pack.productId, imageUrl } : undefined,
      });
      toast.success(t("form.toast.saved", { name: titleCase(brand.trim()) }));
      setEditing(false);
      void utils.inventory.product.list.invalidate();
      void utils.inventory.category.list.invalidate();
    } catch (err) {
      const key = categoryError(err);
      setServerError(t(`form.errors.${key === "hasProducts" ? "inactive" : key === "invalidName" ? "check" : key}`));
    }
  }

  // a dropdown for category or sub-category, sized like the inputs
  const picker = (label: string, current: string | undefined, items: { id: string; name: string }[], picked: string | null, onPick: (id: string) => void, invalid: boolean) => (
    <Menu
      label={label}
      triggerClassName={cn("min-h-10 w-full justify-between px-2.5 text-sm", invalid && "border-danger")}
      trigger={
        <>
          <span className="truncate">{current ? titleCase(current) : "–"}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </>
      }
    >
      {(close) =>
        items.map((item) => (
          <MenuItem
            key={item.id}
            selected={picked === item.id}
            onClick={() => {
              onPick(item.id);
              close();
            }}
          >
            {titleCase(item.name)}
          </MenuItem>
        ))
      }
    </Menu>
  );

  // the rows: editable ones become inputs while editing; name and HSN show only when set (or while editing)
  const rows: { label: string; value: string; edit?: React.ReactNode; number?: boolean }[] = [
    {
      label: t("category"),
      value: titleCase(group.categoryName),
      edit: picker(t("category"), category?.name, categories.data ?? [], categoryId, (id) => {
        if (id !== categoryId) setSubCategoryId(null);
        setCategoryId(id);
      }, false),
    },
    {
      label: t("subCategory"),
      value: titleCase(group.subCategoryName),
      edit: picker(t("subCategory"), sub?.name, subs, subCategoryId, setSubCategoryId, tried && bad.subCategory),
    },
    {
      label: t("brand"),
      value: titleCase(group.brand),
      edit: <input aria-label={t("brand")} value={brand} maxLength={50} onChange={(e) => setBrand(e.target.value)} className={input(tried && bad.brand)} />,
    },
    ...(editing || group.name
      ? [{
          label: t("name"),
          value: group.name ? titleCase(group.name) : "",
          edit: <input aria-label={t("name")} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} className={input(tried && bad.name)} />,
        }]
      : []),
    ...(editing || group.hsn4Digit
      ? [{
          label: t("hsn"),
          value: group.hsn4Digit ?? "",
          number: true,
          edit: (
            <input
              aria-label={t("hsn")}
              value={hsn}
              inputMode="numeric"
              maxLength={4}
              onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))}
              className={cn(input(tried && bad.hsn), "tabular")}
            />
          ),
        }]
      : []),
    { label: t("quantitySold"), value: pack.quantitySold.toLocaleString("en-IN"), number: true },
    { label: t("inStock"), value: pack.quantity.toLocaleString("en-IN"), number: true },
    { label: t("reserved"), value: pack.reservedQuantity.toLocaleString("en-IN"), number: true },
  ];

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-2">
      {/* the heading, with Edit details; while editing, Cancel and Save instead */}
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h2 className="text-xs text-chestnut/80">{t("productDetails")}</h2>
        {editing ? (
          <div className="flex gap-2">
            <button type="button" aria-label={t("cancel")} onClick={() => setEditing(false)} className={iconButton}>
              <X className="size-5" aria-hidden />
            </button>
            <button
              type="submit"
              aria-label={t("form.saveDetails")}
              disabled={updateDetails.isPending || uploading}
              aria-busy={updateDetails.isPending}
              className={iconButton}
            >
              {updateDetails.isPending ? <Spinner /> : <Check className="size-5" aria-hidden />}
            </button>
          </div>
        ) : (
          <button type="button" onClick={startEditing} className={action}>
            <Pencil className="size-4" aria-hidden /> {t("editDetails")}
          </button>
        )}
      </div>

      {/* the image (a photo picker while editing) beside the rows */}
      <div className="flex gap-4">
        {editing ? (
          <PhotoPicker variant="square" value={imageUrl} onChange={setImageUrl} onBusy={setUploading} className="w-2/5 max-w-40 shrink-0 self-start" />
        ) : (
          <ProductImage group={group} imageUrl={packImage(group, pack)} className="w-2/5 max-w-40 shrink-0 self-start [&_span]:text-3xl" />
        )}
        <dl className="flex min-w-0 flex-1 flex-col justify-center divide-y divide-chestnut/10 text-sm">
          {rows.map((row) => (
            <div key={row.label} className={cn("flex items-center justify-between gap-2", editing && row.edit ? "py-1" : "py-1.5")}>
              <dt className={cn("shrink-0 text-chestnut/70", editing && "w-24")}>{row.label}</dt>
              <dd className={cn("min-w-0 text-right font-medium", editing && row.edit ? "flex-1" : "truncate", row.number && "tabular font-heading text-base font-bold")}>
                {editing && row.edit ? row.edit : row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* what to fix */}
      {tried && Object.values(bad).some(Boolean) && <FieldMessage>{t("form.errors.fill")}</FieldMessage>}
      {serverError && <FieldMessage>{serverError}</FieldMessage>}
    </form>
  );
}
