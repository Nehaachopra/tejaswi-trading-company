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
import { cn } from "~/lib/utils";
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

type Utils = ReturnType<typeof trpc.useUtils>;
// take a pack size off the cards at once (a product with no pack size left goes too): from the lists that hide
// inactive ones (made inactive), or from every list (deleted); the refetch after then confirms it
function dropPack(utils: Utils, productId: string, everywhere: boolean) {
  utils.inventory.product.list.setQueriesData(
    {},
    { predicate: (q) => everywhere || !(q.queryKey[1] as { input?: { includeInactive?: boolean } } | undefined)?.input?.includeInactive },
    (groups) =>
      groups?.map((g) => ({ ...g, packs: g.packs.filter((p) => p.productId !== productId) })).filter((g) => g.packs.length > 0),
  );
}

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
  const utils = trpc.useUtils();
  const update = trpc.inventory.product.updateDetails.useMutation();
  const remove = trpc.inventory.product.delete.useMutation();
  // the delete confirmation is open
  const [confirming, setConfirming] = useState(false);
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
      // made inactive: off the cards at once
      if (!draft.isActive && pack!.isActive) dropPack(utils, pack!.productId, false);
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

  // only a pack size with no quantity left (none in stock, none reserved) can be deleted
  const canDelete = pack.quantity === 0 && pack.reservedQuantity === 0;
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`;

  // delete, once confirmed: off the cards and the sheet closed at once; back with a red toast if the server refuses
  // (an open order still has it, or stock arrived meanwhile)
  function deletePack() {
    const productId = pack!.productId;
    setConfirming(false);
    dropPack(utils, productId, true);
    onClose();
    toast.success(t("toast.deleted", { pack: name }));
    remove.mutate(
      { productIds: [productId] },
      {
        onSettled: () => {
          void utils.inventory.product.list.invalidate();
          void utils.inventory.category.list.invalidate();
        },
        onError: (err) => {
          const key = categoryError(err);
          toast.error(t(`errors.${key === "hasProducts" ? "used" : key === "invalidName" ? "failed" : key}`));
        },
      },
    );
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
      // nothing on the left (the title is read out, not shown)
      visual={<span aria-hidden />}
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
    </Sheet>
  );
}
