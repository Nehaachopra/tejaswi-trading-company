"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { Spinner } from "~/components/ui/icons/spinner";
import { toast } from "~/components/ui/toast";
import { packLabel, rupees, titleCase } from "~/lib/format";
import { asField, packPriceFromRate, parseAmount, rateFromPackPrice, unitsIn } from "~/lib/price";
import { cn } from "~/lib/utils";
import { useProductActions } from "~/providers/products";

import { FiguresTable, MoneyBox } from "../../transaction/shared/figures-table";
import { categoryError } from "../categories/category-errors";
import { PackChips } from "./pack-chips";
import { PriceChart } from "./price-chart";
import { type ProductGroup, ProductImage, productTitle } from "./product-tile";

// a read-only figure in a row's right column
const figure = "tabular flex min-h-11 items-center justify-end text-base font-bold";

// one product's card zoomed in over the dimmed page, to change one pack size's price. On top the pack size chips and
// ✕, the name and the square photo (as on a sale's card), the last 5 prices, then four rows: Rate per unit and
// Price + GST (each fills in the other), the cost a pack, and the profit or loss that price makes (green or red).
// Save price; a price below cost asks first. The ✕, a tap on the dim area or Escape closes it unsaved
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
  const { updatePrice, refreshList, refreshPrices } = useProductActions();
  const pack = group.packs.find((p) => p.productId === packId) ?? group.packs[0]!;
  const gst = pack.gstPercent ?? 0;
  const rateLabel = t("ratePer", { unit: t(`form.units.${pack.packSizeCode}`) });

  // the draft: the price with GST and the rate per unit, filled in from the saved price on open and on another pack
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState("");
  useEffect(() => {
    const saved = pack.priceAfterGst;
    setPrice(saved == null ? "" : asField(saved));
    setRate(saved == null ? "" : asField(rateFromPackPrice(saved, unitsIn(pack), gst)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when another pack size is shown
  }, [pack.productId]);
  // asking before saving a price below cost
  const [askLoss, setAskLoss] = useState(false);

  // the page behind doesn't scroll, and Escape closes (not while the below-cost question is open)
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !askLoss && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, askLoss]);

  // either field fills in the other: price = rate × pack size + GST
  const typePrice = (v: string) => {
    setPrice(v);
    const p = parseAmount(v);
    setRate(p == null ? "" : asField(rateFromPackPrice(p, unitsIn(pack), gst)));
  };
  const typeRate = (v: string) => {
    setRate(v);
    const r = parseAmount(v);
    setPrice(r == null ? "" : asField(packPriceFromRate(r, unitsIn(pack), gst)));
  };

  // the profit on the typed price: its before-GST part against the average cost a pack, in rupees and as a share
  const typed = parseAmount(price);
  const cost = pack.weightedAverageCost;
  const before = typed == null ? null : typed / (1 + gst / 100);
  const profit = before != null && cost != null ? Math.round((before - cost) * 100) / 100 : null;
  const profitPct = profit != null && cost ? (profit / cost) * 100 : null;
  const loss = profit != null && profit < 0;
  const canSave =
    typed != null && typed > 0 && typed !== pack.priceAfterGst && !updatePrice.isPending;

  // save the new price; it applies to new sales only and becomes the next point on the graph
  async function save() {
    if (!canSave) return;
    try {
      await updatePrice.mutateAsync({
        productId: pack.productId,
        priceAfterGst: typed!,
        gstPercent: gst,
      });
      toast.success(
        t("toast.priceSaved", {
          pack: packLabel(pack.packSize, pack.packSizeCode, pack.packCount),
          price: rupees(typed!),
        }),
      );
      refreshList();
      refreshPrices(pack.productId);
      setAskLoss(false);
      onClose();
    } catch (err) {
      setAskLoss(false);
      toast.error(t(`errors.${categoryError(err)}`));
    }
  }

  return (
    // the dim, blurred page; a tap on it closes
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 grid animate-fade-in grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto bg-[rgba(30,12,6,0.62)] p-4 backdrop-blur-[3px]"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${t("editPrice")}: ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`}
        className="on-ivory flex w-[min(300px,100%)] animate-zoom-in flex-col gap-2 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
      >
        {/* pack sizes, always on top, and ✕ */}
        <div className="flex justify-between">
          <PackChips
            packs={group.packs}
            selected={pack.productId}
            onSelect={onPack}
            label={t("packSizes")}
            onChestnut={false}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid place-items-center rounded-control p-2 hover:bg-chestnut/8"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* the name, category | sub-category, then the square photo in the middle (as on a sale's card) */}
        <div className="min-w-0">
          <p className="wrap-break-word font-heading text-base font-bold leading-6">{productTitle(group)}</p>
          <p className="truncate text-xs opacity-70">
            {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
          </p>
        </div>
        <ProductImage group={group} imageUrl={pack.imageUrl} className="size-40 self-center" />

        {/* the last 5 saved prices */}
        <PriceChart productId={pack.productId} />

        <div className="mt-2 flex flex-col gap-3">
          {/* the four rows: label left, box or figure right */}
          <FiguresTable
            rows={[
              {
                key: "rate",
                label: rateLabel,
                input: <MoneyBox value={rate} maxDigits={6} label={rateLabel} onChange={typeRate} autoFocus />,
              },
              {
                key: "price",
                label: t("priceGst"),
                input: <MoneyBox value={price} maxDigits={7} label={t("priceGst")} onChange={typePrice} />,
              },
              // the average cost a pack, as it is
              {
                key: "cost",
                label: t("cost"),
                input: <span className={figure}>{cost == null ? "–" : rupees(cost)}</span>,
              },
              // what the price makes a pack over that cost, green, or under it, red, and as a share of the cost
              {
                key: "profit",
                label: loss ? t("loss") : t("profit"),
                input: (
                  <span className={cn(figure, "flex-col items-end justify-center leading-tight", profit != null && (loss ? "text-danger" : "text-success"))}>
                    {profit == null ? "–" : rupees(Math.abs(profit))}
                    {profitPct != null && (
                      <span className="text-xs font-semibold">{Math.abs(profitPct).toFixed(1)}%</span>
                    )}
                  </span>
                ),
              },
            ]}
          />

          {/* Save price: below cost, it asks first */}
          <button
            type="button"
            onClick={() => (loss ? setAskLoss(true) : void save())}
            disabled={!canSave}
            aria-busy={updatePrice.isPending}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-opacity disabled:not-aria-busy:opacity-40 aria-busy:opacity-80"
          >
            {updatePrice.isPending && <Spinner />}
            {t("savePrice")}
          </button>
        </div>
      </section>

      {/* a price below cost: asked once more before it's saved */}
      <ConfirmDialog
        open={askLoss}
        title={t("belowCostTitle")}
        body={t("belowCostBody", {
          price: typed == null ? "–" : rupees(typed),
          cost: cost == null ? "–" : rupees(cost),
        })}
        confirmLabel={t("saveAnyway")}
        cancelLabel={t("cancel")}
        busy={updatePrice.isPending}
        onConfirm={() => void save()}
        onCancel={() => setAskLoss(false)}
      />
    </div>
  );
}
