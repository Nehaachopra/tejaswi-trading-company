"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldMessage, useNudge } from "~/components/ui/field-message";
import { packLabel, rupees } from "~/lib/format";
import { unitsIn } from "~/lib/price";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { CostChart } from "../order/new/cost-chart";
import { QuantityBox } from "../order/new/quantity-box";
import { emptyLine, lineFigures, type PriceField, settleLine } from "../order/new/state";
import { MoneyBox } from "../shared/figures-table";
import { ProductDetailsCard as CardFrame } from "../shared/product-details-card";
import { type CartLine, placedOf, usePurchaseEntry } from "./state";

// a purchase's product details card, on the shared one (as a purchase order's): what it cost on its last purchases; Basis |
// Current | New for Cost per unit, Cost + GST (each fills the other) and Quantity (Current: what's in stock now; an
// item its order waits for: the order's costs as Current, and Ordered with ⌄ opening what's in stock); the godowns the
// packs go into; Add to cart (or Save; the bin takes one already in the cart out)
export function ProductDetailsCard() {
  const { cardFor, packOf } = usePurchaseEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each pack size opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { ts, lines, putLine, removeLine, setCardFor, orderLine, orderLeft, orderCost, spotsOf } = usePurchaseEntry();
  const t = useTranslations("orders");
  const units = useTranslations("products.items.form.units");
  const tp = useTranslations("transactions.purchase");
  const saved = lines.find((l) => l.productId === pack.productId);
  // an arrival on a purchase order: how many of it the order still waits for (never more can come on it)
  const left = orderLeft(pack.productId);
  const onOrder = left > 0 ? orderLine(pack.productId) : null;
  // a new line starts with the quantity and costs empty; one its order waits for starts from the cost it was ordered at
  // (its quantity still empty: how many came is typed)
  const [draft, setDraft] = useState<CartLine>(
    () =>
      saved ??
      (left > 0
        ? { ...settleLine({ ...emptyLine(pack.productId), priceGst: orderCost(pack.productId), from: "priceGst" }, unitsIn(pack), pack.gstPercent), quantity: "", godowns: {} }
        : { ...emptyLine(pack.productId), quantity: "", godowns: {} }),
  );
  // typed past what the order still waits for: cut to it, and it says so (until changed again)
  const cutQty = useNudge();
  // what's in stock now, in every godown together (Quantity's Current)
  const inStock = spotsOf(pack.productId).reduce((a, g) => a + g.held, 0);
  // from an order: whether the Quantity row (what's in stock now) under Ordered shows
  const [stockOpen, setStockOpen] = useState(false);
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const rateLabel = t("costPer", { unit: units(pack.packSizeCode) });

  // one of the costs typed: the others follow
  const setFigure = (field: PriceField, v: string) => setDraft((d) => ({ ...d, ...settleLine({ ...d, [field]: v, from: field }, unitsIn(pack), pack.gstPercent) }));
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft);
  const { total } = lineFigures(draft, unitsIn(pack), pack.gstPercent);
  const costOk = (Number(draft[draft.from]) || 0) > 0;
  const ok = costOk && quantity >= 1 && placed === quantity;
  // Add tapped with something missing: what's missing is marked red, and said under Add
  const [tried, setTried] = useState(false);
  const bad = { cost: !costOk, quantity: quantity < 1, godowns: quantity >= 1 && placed !== quantity };
  const error = !tried ? null : bad.cost ? tp("hintCost") : bad.quantity ? ts("hintQuantity") : bad.godowns ? tp("hintGodowns") : null;

  function done() {
    if (!ok) {
      setTried(true);
      return;
    }
    // only the godowns with something going into them
    putLine({ ...draft, godowns: Object.fromEntries(Object.entries(draft.godowns).filter(([, v]) => (Number(v) || 0) > 0)) });
    close();
  }

  // how many come: − and + around the number (from an order, never past what it still waits for, saying so when cut)
  const quantityBox = (
    <div className="flex flex-col gap-1.5">
      <QuantityBox
        value={draft.quantity}
        max={left > 0 ? left : undefined}
        onChange={(v, cut) => {
          if (cut) cutQty.nudge();
          setDraft((d) => (d.quantity === v ? d : { ...d, quantity: v, godowns: {} }));
        }}
        name={name}
        invalid={tried && bad.quantity}
      />
      {cutQty.shown > 0 && (
        <FieldMessage key={cutQty.shown} tone="warning" className="mt-0">
          {tp("orderCap", { n: left.toLocaleString("en-IN") })}
        </FieldMessage>
      )}
    </div>
  );

  return (
    <CardFrame
      group={group}
      pack={pack}
      onClose={close}
      onRemove={saved ? () => removeLine(pack.productId) : undefined}
      removeLabel={ts("removeFromCart")}
      // what this pack size cost on its last purchases
      above={<CostChart productId={pack.productId} />}
      // Basis | Current | New: Current the order's costs (on an arrival) and what's in stock now
      headings={{ basis: t("basis"), current: t("current"), new: t("new") }}
      rows={[
        {
          key: "rate",
          label: rateLabel,
          current: onOrder ? rupees(Math.round((Number(orderCost(pack.productId)) / unitsIn(pack)) * 100) / 100) : "",
          // quiet: Cost + GST is the one to type; the rate follows it (and can still be typed)
          input: <MoneyBox quiet value={draft.unitGst} maxDigits={6} onChange={(v) => setFigure("unitGst", v)} label={rateLabel} />,
        },
        {
          key: "price",
          label: t("costGst"),
          current: onOrder ? rupees(Number(orderCost(pack.productId))) : "",
          // the cursor starts here whenever the card opens
          input: <MoneyBox autoFocus invalid={tried && bad.cost} value={draft.priceGst} maxDigits={7} onChange={(v) => setFigure("priceGst", v)} label={t("costGst")} />,
        },
        // from an order: Ordered, how many it still waits for beside the box (it starts at 0); its ⌄ shows what's in
        // stock now. Otherwise just Quantity
        ...(onOrder
          ? [
              {
                key: "ordered",
                label: (
                  <button type="button" onClick={() => setStockOpen((o) => !o)} aria-expanded={stockOpen} className="flex items-center gap-1 text-left">
                    {ts("ordered")}
                    <ChevronDown className={cn("size-4 shrink-0 transition-transform", stockOpen && "rotate-180")} aria-hidden />
                  </button>
                ),
                // what the order still waits for (all of it until some has come), as its tile shows
                current: left.toLocaleString("en-IN"),
                input: quantityBox,
              },
              ...(stockOpen ? [{ key: "stock", label: t("quantity"), current: inStock.toLocaleString("en-IN"), input: <span /> }] : []),
            ]
          : [{ key: "quantity", label: t("quantity"), current: inStock.toLocaleString("en-IN"), input: quantityBox }]),
      ]}
      // the godowns the packs go into
      godowns={{
        spots: spotsOf(pack.productId),
        quantity,
        parts: draft.godowns,
        onPart: (godownId, v) => setDraft((d) => ({ ...d, godowns: { ...d.godowns, [godownId]: v } })),
        leftLabel: tp("leftToPlace"),
        invalid: tried && bad.godowns,
      }}
      total={total}
      error={error}
      actionLabel={saved ? ts("saveLine") : ts("addToCart")}
      onDone={done}
    />
  );
}
