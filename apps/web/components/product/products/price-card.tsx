"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SlotAmount } from "~/components/ui/slot-amount";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { packLabel, rupees } from "~/lib/format";
import { asField, packPriceFromRate, parseAmount, rateFromPackPrice } from "~/lib/price";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { categoryError } from "../categories/category-errors";
import { PriceChart } from "./price-chart";
import { RatePriceFields } from "./rate-price-fields";
import { type ProductGroup, TileTop } from "./product-tile";

// one product's card zoomed in over the dimmed page, to change one pack size's price: the rate per unit or the price
// with GST (each fills in the other), the cost and the profit that price earns, the last 5 prices, and Save price.
// The ✕, a tap on the dim area or Escape closes it unsaved
export function PriceCard({
  group,
  packId,
  onPack,
  onClose,
}: {
  group: ProductGroup;
  packId: string;
  onPack: (productId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("products.items");
  const utils = trpc.useUtils();
  const updatePrice = trpc.inventory.product.updatePrice.useMutation();
  const pack = group.packs.find((p) => p.productId === packId) ?? group.packs[0]!;
  const gst = pack.gstPercent ?? 0;
  const unit = t(`form.units.${pack.packSizeCode}`);

  // the draft: the price with GST and the rate per unit, filled in from the saved price on open and on another pack
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState("");
  useEffect(() => {
    const saved = pack.priceAfterGst;
    setPrice(saved == null ? "" : asField(saved));
    setRate(saved == null ? "" : asField(rateFromPackPrice(saved, pack.packSize, gst)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when another pack size is shown
  }, [pack.productId]);

  // the page behind doesn't scroll, and Escape closes
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // either field fills in the other: price = rate × pack size + GST
  const typePrice = (v: string) => {
    setPrice(v);
    const p = parseAmount(v);
    setRate(p == null ? "" : asField(rateFromPackPrice(p, pack.packSize, gst)));
  };
  const typeRate = (v: string) => {
    setRate(v);
    const r = parseAmount(v);
    setPrice(r == null ? "" : asField(packPriceFromRate(r, pack.packSize, gst)));
  };

  // the profit on the typed price: its before-GST part against the average cost
  const typed = parseAmount(price);
  const cost = pack.weightedAverageCost;
  const before = typed == null ? null : typed / (1 + gst / 100);
  const profitPct = before != null && cost ? ((before - cost) / cost) * 100 : null;
  const loss = profitPct != null && profitPct < 0;
  const canSave = typed != null && typed > 0 && typed !== pack.priceAfterGst && !updatePrice.isPending;

  // save the new price; it applies to new sales only and becomes the next point on the graph
  async function save() {
    if (!canSave) return;
    try {
      await updatePrice.mutateAsync({ productId: pack.productId, priceAfterGst: typed!, gstPercent: gst });
      toast.success(t("toast.priceSaved", { pack: packLabel(pack.packSize, pack.packSizeCode), price: rupees(typed!) }));
      void utils.inventory.product.list.invalidate();
      void utils.inventory.product.priceHistory.invalidate({ productId: pack.productId });
      onClose();
    } catch (err) {
      toast.error(t(`errors.${categoryError(err)}`));
    }
  }

  return (
    // the dim, blurred page; a tap on it closes
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center overflow-y-auto bg-[rgba(30,12,6,0.62)] p-4 backdrop-blur-[3px]"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${t("editPrice")}: ${packLabel(pack.packSize, pack.packSizeCode)}`}
        className="on-ivory flex w-[min(300px,100%)] animate-zoom-in flex-col gap-2 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
      >
        {/* ✕ on top, no border */}
        <div className="-mb-1.5 -mr-1.5 -mt-1.5 flex justify-end">
          <button type="button" onClick={onClose} aria-label={t("close")} className="grid size-11 place-items-center rounded-control hover:bg-chestnut/8">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* the card as on the page, its photo shorter */}
        <TileTop group={group} pack={pack} onPack={onPack} short />

        <div className="flex flex-col gap-2.5">
          {/* rate per unit, then the price with GST (chestnut), each a row: label left, box right */}
          <RatePriceFields unit={unit} rate={rate} price={price} onRate={typeRate} onPrice={typePrice} autoFocus rows />

          {/* cost and profit: two big numbers, a line between; the profit's digits spin as it changes */}
          <div className="mt-2.5 grid grid-cols-2 text-center">
            <div className="grid justify-items-center">
              <b className="tabular font-heading text-2xl font-extrabold leading-[1.15]">{cost == null ? "–" : rupees(cost)}</b>
              <span className="text-[11px] text-chestnut/60">{t("cost")}</span>
            </div>
            <div className="grid justify-items-center border-l border-chestnut/12">
              <b className={cn("font-heading text-2xl font-extrabold leading-[1.15]", profitPct != null && (loss ? "text-danger" : "text-success"))}>
                {profitPct == null ? "–" : <SlotAmount text={`${Math.abs(profitPct).toFixed(1)}%`} className="leading-[1.15]" />}
              </b>
              <span className="text-[11px] text-chestnut/60">{loss ? t("loss") : t("profitEarnable")}</span>
            </div>
          </div>

          {/* the last 5 saved prices */}
          <PriceChart productId={pack.productId} />

          {/* Save price */}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            aria-busy={updatePrice.isPending}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-opacity disabled:not-aria-busy:opacity-40 aria-busy:opacity-80"
          >
            {updatePrice.isPending && <Spinner />}
            {t("savePrice")}
          </button>
        </div>
      </section>
    </div>
  );
}
