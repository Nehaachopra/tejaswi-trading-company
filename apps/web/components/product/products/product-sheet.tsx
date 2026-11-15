"use client";

import { Eye, EyeOff, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SubmitButton } from "~/components/ui/card-form";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { toast } from "~/components/ui/toast";
import { packLabel, titleCase } from "~/lib/format";
import { parseAmount } from "~/lib/price";
import { cn } from "~/lib/utils";
import { useProductActions } from "~/providers/products";

import { RequiredMark } from "~/components/ui/required-mark";

import { PlainRows } from "../../transaction/shared/amount-table";
import { pickRow } from "../../transaction/shared/form-basics";
import { categoryError } from "../categories/category-errors";
import { GstPicker } from "./gst-picker";
import { type DetailsDraft, draftFrom, draftOk, draftProblems, ProductDetails, settleDraft } from "./product-details";
import { RatePriceFields } from "./rate-price-fields";
import { type ProductGroup, productTitle } from "./product-tile";

// a part's heading, as the payment's Breakup is headed
const heading = "-mb-1 text-xs font-semibold uppercase tracking-[0.08em] opacity-60";
// the line and room above the second and third parts
const part = "mt-2.5 border-t border-chestnut/15 pt-[18px]";

const round2 = (v: number) => Math.round(v * 100) / 100;

// one pack size's details drawer, opened from the pen on its card's photo: Active and ✕ on top, then Product details
// (all changeable), Price details (rate and price changeable), Quantity details (read only), and Save details
export function ProductSheet({
  group,
  packId,
  onClose,
}: {
  group: ProductGroup | null;
  packId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("products.items");
  const { updateDetails: update, updatePrice, remove, refreshProducts, refreshPrices, dropPack } = useProductActions();
  // the delete confirmation is open
  const [confirming, setConfirming] = useState(false);
  // "Create a new product?" is open (Save details with the category, sub-category or brand changed), and which of
  // its answers is being saved
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState<"all" | "one">("all");
  // the details, then the price, are being saved
  const [busy, setBusy] = useState(false);
  const pack = group?.packs.find((p) => p.productId === packId) ?? null;

  const [draft, setDraft] = useState<DetailsDraft | null>(null);
  const [tried, setTried] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // copy the saved details once when it opens (or opens on another pack size): a live refresh while it's open
  // doesn't overwrite what's being typed
  useEffect(() => {
    if (!group || !pack) return setDraft(null);
    setDraft(draftFrom(group, pack));
    setTried(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens on a pack size
  }, [pack?.productId]);

  if (!group || !pack || !draft) return <Sheet open={false} title="" closeLabel="" onClose={onClose}>{null}</Sheet>;

  const change = (patch: Partial<DetailsDraft>) => {
    setError(null);
    setDraft((d) => (d ? settleDraft(d, patch) : d));
  };

  // the category, sub-category or brand is no longer the saved one
  const saved = draftFrom(group, pack);
  const moved =
    draft.categoryId !== saved.categoryId ||
    draft.subCategoryId !== saved.subCategoryId ||
    draft.brand.trim().toLowerCase() !== saved.brand.trim().toLowerCase();

  // Save details: with the category, sub-category or brand changed, ask first whether a new product is wanted
  function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (!draft || !draftOk(draft) || photoBusy) return;
    // a product with one pack size has nothing to choose between
    if (moved && group!.packs.length > 1) return setAsking(true);
    void saveDetails("all");
  }

  // Undo changes: the category, sub-category and brand go back to the saved ones; everything else typed stays
  function undoMove() {
    setAsking(false);
    change({ categoryId: saved.categoryId, subCategoryId: saved.subCategoryId, brand: saved.brand });
  }

  // save everything at once; a new GST % keeps the price with GST. "all": the category, sub-category, brand and HSN
  // go on every pack size of the product. "one": only this pack size takes them, so it leaves the others and becomes
  // a product of its own, with its stock, price and history
  async function saveDetails(scope: "all" | "one") {
    if (!draft) return;
    setSaving(scope);
    setBusy(true);
    // the price with GST, saved only when it was changed
    const price = parseAmount(draft.price)!;
    const newPrice = () => updatePrice.mutateAsync({ productId: pack!.productId, priceAfterGst: price, gstPercent: Number(draft.gst) });
    try {
      // a pack size with no price yet needs one before its details can be saved
      if (pack!.priceAfterGst == null) await newPrice();
      await update.mutateAsync({
        productIds: scope === "one" ? [pack!.productId] : group!.packs.map((p) => p.productId),
        categoryId: draft.categoryId,
        subCategoryId: draft.subCategoryId!,
        brand: draft.brand,
        name: draft.name.trim() || null,
        hsn: draft.hsn || null,
        pack: {
          productId: pack!.productId,
          packSizeCode: draft.packSizeCode,
          packSize: Number(draft.packSize),
          gstPercent: Number(draft.gst),
          isActive: draft.isActive,
        },
        // the photo is this pack size's own, sent only when it was changed
        image: draft.imageUrl !== saved.imageUrl ? { productId: pack!.productId, imageUrl: draft.imageUrl } : undefined,
      });
      if (pack!.priceAfterGst != null && price !== pack!.priceAfterGst) await newPrice();
      // made inactive: off the cards at once
      if (!draft.isActive && pack!.isActive) dropPack(pack!.productId, false);
      toast.success(t("form.toast.saved", { name: `${titleCase(draft.brand.trim())} ${packLabel(Number(draft.packSize), draft.packSizeCode)}` }));
      refreshProducts();
      refreshPrices(pack!.productId);
      setAsking(false);
      onClose();
    } catch (err) {
      setAsking(false);
      const key = categoryError(err);
      setError(t(`form.errors.${key === "hasProducts" ? "inactive" : key === "invalidName" ? "check" : key}`));
    } finally {
      setBusy(false);
    }
  }

  // only a pack size with no quantity left (none in stock, none reserved) can be deleted
  const canDelete = pack.quantity === 0 && pack.reservedQuantity === 0;
  const name: string =`${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`;

  // delete, once confirmed: off the cards and the sheet closed at once; back with a red toast if the server refuses
  // (an open order still has it, or stock arrived meanwhile)
  function deletePack() {
    const productId = pack!.productId;
    setConfirming(false);
    dropPack(productId, true);
    onClose();
    toast.success(t("toast.deleted", { pack: name }));
    remove.mutate(
      { productIds: [productId] },
      {
        onSettled: refreshProducts,
        onError: (err) => {
          const key = categoryError(err);
          toast.error(t(`errors.${key === "hasProducts" ? "used" : key === "invalidName" ? "failed" : key}`));
        },
      },
    );
  }

  // price details: the typed price with GST, split by the GST % typed above
  const price = parseAmount(draft.price);
  const gst = Number(draft.gst) || 0;
  const before = price == null ? null : round2(price / (1 + gst / 100));
  const priceRows = [
    { key: "before", label: t("priceBeforeGst"), amount: before },
    { key: "gst", label: t("gstAmount", { gst }), amount: price == null || before == null ? null : round2(price - before), plus: true },
    { key: "total", label: t("priceWithGst"), amount: price, tone: "total" as const },
  ];

  // quantity details: free and reserved, adding up to the quantity held
  const count = (n: number) => n.toLocaleString("en-IN");
  const quantityRows = [
    { key: "free", label: t("available"), amount: 0, text: count(pack.unreservedQuantity) },
    { key: "reserved", label: t("reserved"), amount: 0, text: count(pack.reservedQuantity) },
    { key: "total", label: t("quantity"), amount: 0, text: count(pack.quantity), tone: "total" as const },
  ];

  return (
    <Sheet
      open
      title={`${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`}
      closeLabel={t("close")}
      onClose={onClose}
      bareHeader
      // on the right: the eye (open while it shows on the cards, crossed out once hidden; saved with Save details),
      // the bin (only while no quantity is left) and ✕; all three the same plain chestnut icons, no borders
      actions={
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            aria-pressed={!draft.isActive}
            aria-label={draft.isActive ? t("hidePack", { pack: name }) : t("showPack", { pack: name })}
            title={draft.isActive ? t("hide") : t("show")}
            onClick={() => change({ isActive: !draft.isActive })}
            // pressed (hidden): chestnut with an ivory eye
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-control transition-colors",
              draft.isActive ? "hover:bg-chestnut/8" : "bg-chestnut text-ivory hover:bg-chestnut/90",
            )}
          >
            {draft.isActive ? <Eye className="size-5" aria-hidden /> : <EyeOff className="size-5" aria-hidden />}
          </button>
          {canDelete && (
            <button
              type="button"
              aria-label={t("deletePack", { pack: name })}
              title={t("delete")}
              onClick={() => setConfirming(true)}
              className="grid size-11 shrink-0 place-items-center rounded-control hover:bg-chestnut/8"
            >
              <Trash2 className="size-5" aria-hidden />
            </button>
          )}
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-control hover:bg-chestnut/8"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      }
    >
      <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 [&>*]:shrink-0">
          {/* product details: all changeable */}
          <h3 className={heading}>{t("productDetails")}</h3>
          <ProductDetails
            draft={draft}
            onChange={change}
            onPhotoBusy={setPhotoBusy}
            tried={tried}
          />

          {/* price details: GST %, rate and price (either fills in the other), then the split in the payment breakup's rows */}
          <h3 className={`${heading} ${part}`}>{t("priceDetails")}</h3>
          <div className={pickRow}>
            <span>
              {t("gstLabel")}
              <RequiredMark />
            </span>
            <GstPicker value={draft.gst} onPick={(gst) => change({ gst })} invalid={tried && draftProblems(draft).gst} pickEnd />
          </div>
          <RatePriceFields
            unit={t(`form.units.${draft.packSizeCode}`)}
            rate={draft.rate}
            price={draft.price}
            onRate={(rate) => change({ rate })}
            onPrice={(price) => change({ price })}
            priceInvalid={tried && draftProblems(draft).price}
            rows
          />
          <PlainRows rows={priceRows} />

          {/* quantity details: read only, the same rows */}
          <h3 className={`${heading} ${part}`}>{t("quantityDetails")}</h3>
          <PlainRows rows={quantityRows} />
        </div>

        {/* Save details */}
        <footer className="flex shrink-0 flex-col gap-3 border-t border-chestnut/15 px-5 py-4">
          {tried && !draftOk(draft) && <FieldMessage className="mt-0">{t("form.errors.fill")}</FieldMessage>}
          {error && <FieldMessage className="mt-0">{error}</FieldMessage>}
          <SubmitButton busy={busy} disabled={photoBusy}>
            {t("form.saveDetails")}
          </SubmitButton>
        </footer>
      </form>

      {/* the confirmation before deleting */}
      <ConfirmDialog
        open={confirming}
        title={t("deleteTitle", { name: productTitle(group), pack: packLabel(pack.packSize, pack.packSizeCode) })}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        busy={false}
        onConfirm={deletePack}
        onCancel={() => setConfirming(false)}
      />

      {/* the category, sub-category or brand was changed: this pack size becomes a new product, or every pack size
          changes, or the three go back */}
      <ConfirmDialog
        open={asking}
        tone="plain"
        title={t("form.newProduct.title")}
        body={t("form.newProduct.bodyEdit", { pack: packLabel(pack.packSize, pack.packSizeCode), name: productTitle(group) })}
        confirmLabel={t("form.newProduct.yes")}
        cancelLabel={t("form.newProduct.no")}
        busy={busy && saving === "one"}
        onConfirm={() => void saveDetails("one")}
        extra={{ label: t("form.newProduct.all"), busy: busy && saving === "all", onClick: () => void saveDetails("all") }}
        onCancel={undoMove}
      />
    </Sheet>
  );
}
