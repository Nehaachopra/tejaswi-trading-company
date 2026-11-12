"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { packLabel, titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { PlainRows } from "../../transaction/shared/amount-table";
import { categoryError } from "../categories/category-errors";
import { type DetailsDraft, draftFrom, draftOk, ProductDetails } from "./product-details";
import { type ProductGroup, productTitle } from "./product-tile";

// a part's heading, as the payment's Breakup is headed
const heading = "-mb-1 text-xs font-semibold uppercase tracking-[0.08em] opacity-60";
// the line and room above the second and third parts
const part = "mt-2.5 border-t border-chestnut/15 pt-[18px]";

const round2 = (v: number) => Math.round(v * 100) / 100;

// one pack size's details drawer, opened from the pen on its card's photo: Active and ✕ on top, then Product details
// (all changeable), Price details and Quantity details (both read only), and Save details
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
  const tc = useTranslations("common");
  const utils = trpc.useUtils();
  const update = trpc.inventory.product.updateDetails.useMutation();
  const activeLabel = useId();
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
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  // save everything at once; a new GST % keeps the price with GST
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (!draft || !draftOk(draft) || photoBusy) return;
    const saved = draftFrom(group!, pack!);
    try {
      await update.mutateAsync({
        productIds: group!.packs.map((p) => p.productId),
        categoryId: draft.categoryId,
        subCategoryId: draft.subCategoryId!,
        brand: draft.brand,
        name: group!.name,
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
      toast.success(t("form.toast.saved", { name: `${titleCase(draft.brand.trim())} ${packLabel(Number(draft.packSize), draft.packSizeCode)}` }));
      void utils.inventory.product.list.invalidate();
      void utils.inventory.category.list.invalidate();
      void utils.inventory.product.priceHistory.invalidate({ productId: pack!.productId });
      onClose();
    } catch (err) {
      const key = categoryError(err);
      setError(t(`form.errors.${key === "hasProducts" ? "inactive" : key === "invalidName" ? "check" : key}`));
    }
  }

  // price details: the saved price with GST, split by the GST % typed above
  const price = pack.priceAfterGst;
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
      // Active on the left, in place of a title
      visual={
        <span className="flex items-center gap-2.5 text-sm">
          <span id={activeLabel}>{tc("active")}</span>
          <Switch on={draft.isActive} onFlip={(isActive) => change({ isActive })} labelledBy={activeLabel} />
        </span>
      }
      // ✕ with no border
      actions={
        <button
          type="button"
          aria-label={t("close")}
          onClick={onClose}
          className="grid size-11 shrink-0 place-items-center rounded-control hover:bg-chestnut/8"
        >
          <X className="size-5" aria-hidden />
        </button>
      }
    >
      <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 [&>*]:shrink-0">
          {/* product details: all changeable */}
          <h3 className={heading}>{t("productDetails")}</h3>
          <ProductDetails draft={draft} onChange={change} onPhotoBusy={setPhotoBusy} tried={tried} />

          {/* price details: read only, the payment breakup's rows */}
          <h3 className={`${heading} ${part}`}>{t("priceDetails")}</h3>
          <PlainRows rows={priceRows} />

          {/* quantity details: read only, the same rows */}
          <h3 className={`${heading} ${part}`}>{t("quantityDetails")}</h3>
          <PlainRows rows={quantityRows} />
        </div>

        {/* Save details */}
        <footer className="flex shrink-0 flex-col gap-3 border-t border-chestnut/15 px-5 py-4">
          {tried && !draftOk(draft) && <FieldMessage className="mt-0">{t("form.errors.fill")}</FieldMessage>}
          {error && <FieldMessage className="mt-0">{error}</FieldMessage>}
          <SubmitButton busy={update.isPending} disabled={photoBusy}>
            {t("form.saveDetails")}
          </SubmitButton>
        </footer>
      </form>
    </Sheet>
  );
}
