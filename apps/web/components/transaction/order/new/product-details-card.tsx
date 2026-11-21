"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldMessage, useNudge } from "~/components/ui/field-message";
import { packLabel, rupees } from "~/lib/format";
import { unitsIn } from "~/lib/price";

import { type Pack, type ProductGroup, productTitle } from "../../../product/products/product-tile";
import { MoneyBox } from "../../shared/figures-table";
import { ProductDetailsCard as CardFrame } from "../../shared/product-details-card";
import { CostChart } from "./cost-chart";
import { QuantityBox } from "./quantity-box";
import { emptyLine, lineFigures, type OrderLine, type PriceField, settleLine, useOrderEntry } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// an order's product details card, on the shared one: a sale order's Basis | Current | New for Rate per unit, Price +
// GST and Quantity; a purchase order's the same for costs, with what it cost on its last purchases above. Then Add to
// order (or Save; the bin takes off one none of which has moved)
export function ProductDetailsCard() {
  const { cardFor, packOf } = useOrderEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each pack size opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, kind, lines, putLine, removeLine, setCardFor, movedOf, heldOf } = useOrderEntry();
  const units = useTranslations("products.items.form.units");
  const saved = lines.find((l) => l.productId === pack.productId);
  const sale = kind === "sale";
  // a new line starts with the quantity empty; a sale also starts from the pack's saved price with GST (changed here for
  // this order only), a purchase with its costs empty
  const [draft, setDraft] = useState<OrderLine>(() => {
    if (saved) return saved;
    const start = { ...emptyLine(pack.productId), quantity: "" };
    return sale && pack.priceAfterGst != null
      ? settleLine(
          { ...start, priceGst: String(pack.priceAfterGst), from: "priceGst" },
          unitsIn(pack),
          pack.gstPercent,
        )
      : start;
  });
  // a sale: how many are free to order (not held for another order; what this order holds now counts as free for it);
  // the quantity stops there
  const available = pack.unreservedQuantity + heldOf(pack.productId);
  const most = sale ? Math.min(available, 99_999) : 99_999;
  // an order being changed: what has already moved (arrived, or gone out); the quantity can't go below it
  const moved = movedOf(pack.productId);
  const least = Math.max(1, moved);
  // a sale: the pack's saved price with GST
  const listPrice = pack.priceAfterGst;
  // more than that was typed: cut to it, and it says so for a while
  const over = useNudge();
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  // a unit's price (a sale order) or cost (a purchase order) with GST: "Price / kg", "Cost / kg"
  const rateLabel = t(sale ? "pricePer" : "costPer", { unit: units(pack.packSizeCode) });

  // one of the three typed: the other two follow
  const setFigure = (field: PriceField, v: string) =>
    setDraft((d) => settleLine({ ...d, [field]: v, from: field }, unitsIn(pack), pack.gstPercent));
  const { total } = lineFigures(draft, unitsIn(pack), pack.gstPercent);
  // Add tapped with something missing: what's missing is marked red, and said under Add
  const ts = useTranslations("transactions.sale");
  const tp = useTranslations("transactions.purchase");
  const [tried, setTried] = useState(false);
  const bad = {
    price: (Number(draft[draft.from]) || 0) <= 0,
    quantity: (Number(draft.quantity) || 0) < least || Number(draft.quantity) > most,
  };
  const ok = !bad.price && !bad.quantity;
  const error = !tried ? null : bad.price ? (sale ? ts("hintPrice") : tp("hintCost")) : bad.quantity ? ts("hintQuantity") : null;

  function done() {
    if (!ok) {
      setTried(true);
      return;
    }
    putLine(draft);
    close();
  }

  // the New column: the two ₹ boxes (rate or cost per unit, price or cost + GST) and the quantity
  const rateBox = (
    // quiet: the price is the one to type; the rate follows it (and can still be typed)
    <MoneyBox
      quiet
      value={draft.unitGst}
      maxDigits={6}
      onChange={(v) => setFigure("unitGst", v)}
      label={rateLabel}
    />
  );
  const priceBox = (
    // a purchase order: the cursor starts here when the card opens (a sale order's price is filled in: quantity instead)
    <MoneyBox
      autoFocus={!sale}
      invalid={tried && bad.price}
      value={draft.priceGst}
      maxDigits={7}
      onChange={(v) => setFigure("priceGst", v)}
      label={sale ? t("priceGst") : t("costGst")}
    />
  );
  // the quantity box, and under it what more was typed than there is (cut to it) and what has moved
  const quantityBox = (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <QuantityBox
        value={draft.quantity}
        onChange={(v, cut) => {
          if (cut) over.nudge();
          setDraft((d) => ({ ...d, quantity: v }));
        }}
        name={name}
        max={most}
        min={moved}
        autoFocus={sale}
        invalid={tried && bad.quantity}
      />
      {sale && over.shown > 0 && (
        <FieldMessage key={over.shown} tone="warning" className="mt-0">
          {t("onlyAvailable", { n: most.toLocaleString("en-IN") })}
        </FieldMessage>
      )}
      {moved > 0 && (
        <span className="text-xs opacity-70">
          {t(sale ? "goneOut" : "arrived", { n: moved.toLocaleString("en-IN") })}
        </span>
      )}
    </div>
  );

  return (
    <CardFrame
      group={group}
      pack={pack}
      onClose={close}
      onRemove={saved && moved === 0 ? () => removeLine(pack.productId) : undefined}
      removeLabel={t("removeFromOrder")}
      // a purchase: what this pack size cost on its last purchases
      above={sale ? undefined : <CostChart productId={pack.productId} />}
      // a sale has the saved figures beside this order's; a purchase, only this order's costs
      headings={{ basis: t("basis"), current: sale ? t("current") : undefined, new: t("new") }}
      rows={[
        { key: "rate", label: rateLabel, current: listPrice == null ? "–" : rupees(round2(listPrice / unitsIn(pack))), input: rateBox },
        { key: "price", label: sale ? t("priceGst") : t("costGst"), current: listPrice == null ? "–" : rupees(listPrice), input: priceBox },
        { key: "quantity", label: t("quantity"), current: available.toLocaleString("en-IN"), input: quantityBox },
      ]}
      total={total}
      error={error}
      actionLabel={saved ? t("saveLine") : t("addToOrder")}
      onDone={done}
    />
  );
}
