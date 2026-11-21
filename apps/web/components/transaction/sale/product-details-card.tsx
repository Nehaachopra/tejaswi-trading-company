"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { packLabel, rupees } from "~/lib/format";
import { asField, parseAmount, unitsIn } from "~/lib/price";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";

import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { MoneyBox } from "../shared/figures-table";
import { QuantityBox } from "../shared/pack-parts";
import { ProductDetailsCard as CardFrame } from "../shared/product-details-card";
import { type CartLine, lineFigures, placedOf, priceOf, useSaleEntry } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// a sale's product details card, on the shared one: Basis | Current | New for Rate per unit, Price + GST and Quantity (from an
// order, Ordered with ⌄ for what's free), the godowns the packs leave from, and Add to cart (or Save; the bin takes it
// out). The New prices start from the saved ones. Below cost, Add asks first
export function ProductDetailsCard() {
  const { cardFor, packOf } = useSaleEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each pack size opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, lines, putLine, removeLine, setCardFor, freeOf, orderPrice, order, godownsOf } =
    useSaleEntry();
  const units = useTranslations("products.items.form.units");
  // a dispatch on a sale order: this pack's line on the order (how many were ordered, how many have gone out), while
  // the order still waits for some of it
  const onOrder = order?.lines.find((l) => l.productId === pack.productId) ?? null;
  const ordered = onOrder && onOrder.quantity > onOrder.delivered ? onOrder : null;
  const saved = lines.find((l) => l.productId === pack.productId);
  // a pack its order still waits for starts from the price it was ordered at
  // what the order still waits for of it
  const orderedLeft = ordered ? Math.max(0, ordered.quantity - ordered.delivered) : 0;
  // (otherwise from the saved price, filled in the New box), and, from an order, from the quantity still to go on it,
  // as much as there is to take
  const [draft, setDraft] = useState<CartLine>(
    () =>
      saved ?? {
        productId: pack.productId,
        newPrice:
          orderPrice(pack) || (pack.priceAfterGst != null ? asField(pack.priceAfterGst) : ""),
        quantity: orderedLeft > 0 ? String(Math.min(orderedLeft, freeOf(pack))) : "",
        godowns: {},
      },
  );
  // the rate as typed, until the price is typed instead (then it follows the price)
  const [rateText, setRateText] = useState<string | null>(null);
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const gst = pack.gstPercent ?? 0;
  const list = pack.priceAfterGst ?? 0;

  // the figures: the price it sells at, its rate before GST, the quantity and what's placed in godowns
  const price = priceOf(draft, pack);
  const quantity = Number(draft.quantity) || 0;
  const available = freeOf(pack);
  const placed = placedOf(draft);
  const { rate, total } = lineFigures(price, quantity, gst);
  // a new price below what a pack costs us can't be saved
  const belowCost =
    pack.weightedAverageCost != null && rate < Math.round(pack.weightedAverageCost * 100);
  // a unit's price with GST: "Price / kg"
  const rateLabel = t("pricePer", { unit: units(pack.packSizeCode) });
  const typedPrice = parseAmount(draft.newPrice);
  const rateValue =
    rateText ?? (typedPrice === null ? "" : asField(round2(typedPrice / unitsIn(pack))));
  const ok = price > 0 && quantity >= 1 && quantity <= available && placed === quantity;
  // below cost: Add asks first whether to sell it that low (a pack's cost with GST, to set against the price)
  const [askBelow, setAskBelow] = useState(false);
  const costGst = round2((pack.weightedAverageCost ?? 0) * (1 + gst / 100));
  // Add tapped with something missing: what's missing is marked red, and said under Add
  const [tried, setTried] = useState(false);
  const bad = { price: price <= 0, quantity: quantity < 1 || quantity > available, godowns: quantity >= 1 && placed !== quantity };
  const error = !tried
    ? null
    : bad.price
      ? t("hintPrice")
      : quantity < 1
        ? t("hintQuantity")
        : bad.godowns
          ? t("hintGodowns")
          : null;

  function done(sellBelow = false) {
    if (!ok) {
      setTried(true);
      return;
    }
    // below cost: asked first
    if (belowCost && !sellBelow) {
      setAskBelow(true);
      return;
    }
    // only the godowns with something leaving them
    putLine({
      ...draft,
      belowCostOk: belowCost,
      godowns: Object.fromEntries(
        Object.entries(draft.godowns).filter(([, v]) => (Number(v) || 0) > 0),
      ),
    });
    close();
  }

  // from an order: whether the stock rows under Ordered show
  const [stockOpen, setStockOpen] = useState(false);
  // how many this sale sends: − and + around the number
  const quantityBox = (
    // the cursor starts here when the card opens
    <QuantityBox
      autoFocus
      value={draft.quantity}
      max={available}
      min={1}
      label={`${t("quantity")}: ${name}`}
      invalid={tried && bad.quantity}
      // a new quantity clears the godowns, to be placed again
      onChange={(v) => setDraft((d) => (d.quantity === v ? d : { ...d, quantity: v, godowns: {} }))}
    />
  );
  return (
    <CardFrame
      group={group}
      pack={pack}
      onClose={close}
      onRemove={saved ? () => removeLine(pack.productId) : undefined}
      removeLabel={t("removeFromCart")}
      headings={{ basis: t("basis"), current: t("current"), new: t("new") }}
      rows={[
        // no saved price: what a pack costs us with GST, to price above it (first, above the rate)
        ...(pack.priceAfterGst == null && pack.weightedAverageCost != null
          ? [{ key: "cost", label: t("costGst"), current: rupees(costGst), input: <span /> }]
          : []),
        // the rate for one unit, with GST: typing it fills the price
        {
          key: "rate",
          label: rateLabel,
          current: pack.priceAfterGst != null ? rupees(round2(list / unitsIn(pack))) : "–",
          input: (
            // quiet: the price is the one to type; the rate follows it (and can still be typed)
            <MoneyBox
              quiet
              value={rateValue}
              maxDigits={6}
              label={`${rateLabel}: ${name}`}
              onChange={(v) => {
                setRateText(v);
                const r = parseAmount(v);
                setDraft((d) => ({ ...d, newPrice: r === null ? "" : asField(round2(r * unitsIn(pack))) }));
              }}
            />
          ),
        },
        // the pack's price with GST
        {
          key: "price",
          label: t("priceGst"),
          current: pack.priceAfterGst != null ? rupees(list) : "–",
          input: (
            <MoneyBox
              value={draft.newPrice}
              invalid={tried && bad.price}
              maxDigits={7}
              label={`${t("priceGst")}: ${name}`}
              onChange={(v) => {
                setRateText(null);
                setDraft((d) => ({ ...d, newPrice: v }));
              }}
            />
          ),
        },
        // from an order: Ordered, how many it ordered beside the box (it starts at what's still to go); its ⌄ shows
        // what's free to sell (and, once some have gone out, how many it still waits for)
        ...(ordered
          ? [
              {
                key: "ordered",
                label: (
                  <button type="button" onClick={() => setStockOpen((o) => !o)} aria-expanded={stockOpen} className="flex items-center gap-1 text-left">
                    {t("ordered")}
                    <ChevronDown className={cn("size-4 shrink-0 transition-transform", stockOpen && "rotate-180")} aria-hidden />
                  </button>
                ),
                current: ordered.quantity.toLocaleString("en-IN"),
                input: quantityBox,
              },
              ...(stockOpen
                ? [
                    ...(ordered.delivered > 0
                      ? [{ key: "left", label: t("leftToPlace"), current: orderedLeft.toLocaleString("en-IN"), input: <span /> }]
                      : []),
                    { key: "available", label: t("quantity"), current: available.toLocaleString("en-IN"), input: <span /> },
                  ]
                : []),
            ]
          : // what's free to sell, and how many
            [{ key: "quantity", label: t("quantity"), current: available.toLocaleString("en-IN"), input: quantityBox }]),
      ]}
      // the godowns the packs leave from (none gives more than it holds)
      godowns={{
        spots: godownsOf(pack.productId),
        quantity,
        parts: draft.godowns,
        onPart: (godownId, v) => setDraft((d) => ({ ...d, godowns: { ...d.godowns, [godownId]: v } })),
        leftLabel: t("leftToPlace"),
        capAtHeld: true,
        invalid: tried && bad.godowns,
      }}
      total={total}
      error={error}
      actionLabel={saved ? t("saveLine") : t("addToCart")}
      onDone={() => done()}
      // (not while the below-cost question is open: Escape answers that one)
      escapeOff={askBelow}
    >
      {/* Add to cart below cost: asked whether to sell it that low */}
      <ConfirmDialog
        open={askBelow}
        // No on the left, Yes on the right
        tone="danger"
        title={t("sellBelowTitle")}
        // the price and a pack's cost (both with GST), then on its own line the question with the loss on all the packs
        body={
          <>
            <p>{t("sellBelowFact", { price: rupees(price), cost: rupees(costGst) })}</p>
            <p className="mt-2 font-semibold text-chestnut">{t("sellBelowAsk", { loss: rupees(round2((costGst - price) * quantity)) })}</p>
          </>
        }
        confirmLabel={t("yes")}
        cancelLabel={t("no")}
        busy={false}
        onConfirm={() => {
          setAskBelow(false);
          done(true);
        }}
        onCancel={() => setAskBelow(false)}
      />
    </CardFrame>
  );
}
