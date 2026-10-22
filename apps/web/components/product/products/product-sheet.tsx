"use client";

import { Plus, Power, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { packLabel } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { categoryError } from "../categories/category-errors";
import { PackChips } from "./pack-chips";
import { PriceChart } from "./price-chart";
import { ProductDetails } from "./product-details";
import { ProductPrice } from "./product-price";
import { type ProductGroup, productTitle } from "./product-tile";

// a small square button in the header
const headerButton =
  "grid size-9 shrink-0 place-items-center rounded-control border border-chestnut/50 hover:border-chestnut disabled:not-aria-busy:opacity-30 aria-busy:opacity-80";

// everything about one product, opened from its tile on the pack size that tile showed
export function ProductSheet({
  group,
  packId,
  onPack,
  onClose,
  onAddPack,
}: {
  group: ProductGroup | null;
  packId: string | null;
  onPack: (productId: string) => void;
  onClose: () => void;
  onAddPack: (group: ProductGroup) => void;
}) {
  const t = useTranslations("products.items");
  const utils = trpc.useUtils();
  const setActive = trpc.inventory.product.setActive.useMutation();
  const remove = trpc.inventory.product.delete.useMutation();
  const [confirming, setConfirming] = useState(false);

  // the pack size shown; a pack that just went away (deactivated, deleted) falls back to the first
  const pack = group?.packs.find((p) => p.productId === packId) ?? group?.packs[0] ?? null;

  if (!group || !pack) return <Sheet open={false} title="" closeLabel="" onClose={onClose}>{null}</Sheet>;

  const label = packLabel(pack.packSize, pack.packSizeCode);
  const refresh = () => {
    void utils.inventory.product.list.invalidate();
    void utils.inventory.category.list.invalidate();
  };

  // deactivate or reactivate this pack size
  async function toggleActive() {
    try {
      await setActive.mutateAsync({ productIds: [pack!.productId], isActive: !pack!.isActive });
      toast.success(t(pack!.isActive ? "toast.deactivated" : "toast.reactivated", { pack: label }));
      refresh();
    } catch (err) {
      toast.error(t(`errors.${categoryError(err)}`));
    }
  }

  // delete this pack size, once confirmed; refused once it has been used anywhere
  async function deletePack() {
    setConfirming(false);
    try {
      await remove.mutateAsync({ productIds: [pack!.productId] });
      toast.success(t("toast.deleted", { pack: label }));
      refresh();
    } catch (err) {
      const key = categoryError(err);
      toast.error(t(`errors.${key === "hasProducts" ? "used" : key}`));
    }
  }

  const toggleLabel = pack.isActive ? t("deactivatePack", { pack: label }) : t("reactivatePack", { pack: label });

  return (
    <Sheet
      open
      title={productTitle(group)}
      closeLabel={t("close")}
      onClose={onClose}
      // the pack sizes sit in the header, in place of the product's name, with + to add another
      visual={
        <div className="flex items-center gap-1.5">
          <div className="min-w-0">
            <PackChips packs={group.packs} selected={pack.productId} onSelect={onPack} label={t("packSizes")} />
          </div>
          <button
            type="button"
            aria-label={t("addPack")}
            title={t("addPack")}
            onClick={() => onAddPack(group)}
            className="grid size-8 shrink-0 place-items-center rounded-control border border-dashed border-chestnut/60 hover:border-chestnut"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      }
      // this pack size's Deactivate (or Reactivate) and Delete, in place of the close button
      actions={
        <>
          <button
            type="button"
            aria-label={toggleLabel}
            title={toggleLabel}
            aria-pressed={!pack.isActive}
            onClick={() => void toggleActive()}
            disabled={setActive.isPending}
            aria-busy={setActive.isPending}
            className={cn(headerButton, !pack.isActive && "border-chestnut bg-chestnut text-ivory")}
          >
            {setActive.isPending ? <Spinner /> : <Power className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            aria-label={t("deletePack", { pack: label })}
            title={t("deletePack", { pack: label })}
            onClick={() => setConfirming(true)}
            disabled={remove.isPending}
            aria-busy={remove.isPending}
            className={cn(headerButton, "text-danger")}
          >
            {remove.isPending ? <Spinner /> : <Trash2 className="size-4" aria-hidden />}
          </button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {/* the product's details, edited in place */}
        <ProductDetails group={group} pack={pack} />

        {/* this pack size's price, edited in place */}
        <ProductPrice pack={pack} />

        {/* the price history for this pack size */}
        <PriceChart productId={pack.productId} />
      </div>

      {/* the confirmation before deleting a pack size */}
      <ConfirmDialog
        open={confirming}
        title={t("deleteTitle", { name: productTitle(group), pack: label })}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        busy={false}
        onConfirm={() => void deletePack()}
        onCancel={() => setConfirming(false)}
      />
    </Sheet>
  );
}
