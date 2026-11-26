"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { packLabel, rupees } from "~/lib/format";

import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { CostChart } from "../order/new/cost-chart";
import { type PriceField, settleLine } from "../order/new/state";
import { MoneyBox } from "../shared/figures-table";
import { ProductDetailsCard as CardFrame } from "../shared/product-details-card";
import { type CostLine, usePurchaseEdit } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// an edit's product details card, as a purchase's: what it cost on its last purchases; Basis | Current | New for Cost
// per unit and Cost + GST (each fills the other; Current what it was bought at here), Quantity as bought (not to be
// changed), and Save. No bin, no godowns
export function ProductDetailsCard() {
  const { cardFor, packOf } = usePurchaseEdit();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each item opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { ts, lines, putLine, setCardFor, savedLine, sizeOf } = usePurchaseEdit();
  const t = useTranslations("orders");
  const tp = useTranslations("transactions.purchase");
  const units = useTranslations("products.items.form.units");
  const [draft, setDraft] = useState<CostLine>(() => lines.find((l) => l.productId === pack.productId)!);
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const saved = savedLine(pack.productId);
  const size = sizeOf(pack.productId);
  const rateLabel = t("costPer", { unit: units(pack.packSizeCode) });

  // one of the costs typed: the other follows
  const setFigure = (field: PriceField, v: string) =>
    setDraft((d) => {
      const s = settleLine({ ...d, [field]: v, from: field, quantity: "1" }, size, saved.gstRate);
      return { productId: s.productId, unitGst: s.unitGst, price: s.price, priceGst: s.priceGst, from: s.from };
    });
  // the figures: the pack's rate before GST, and the line's total at the quantity bought (its discount as saved)
  const rate = Math.round((Number(draft.price) || 0) * 100);
  const value = Math.max(0, rate * saved.quantity - Math.round(saved.discount * 100));
  const total = value + Math.round((value * saved.gstRate) / 100);
  // what it was bought at here: per unit and per pack, with GST
  const savedGst = round2(saved.rateBeforeGst * (1 + saved.gstRate / 100));
  // Save tapped with no cost: marked red, said under Save
  const [tried, setTried] = useState(false);

  function done() {
    if (rate <= 0) return setTried(true);
    putLine(draft);
    close();
  }

  return (
    <CardFrame
      group={group}
      pack={pack}
      onClose={close}
      // what this pack size cost on its last purchases
      above={<CostChart productId={pack.productId} />}
      headings={{ basis: t("basis"), current: t("current"), new: t("new") }}
      rows={[
        {
          key: "rate",
          label: rateLabel,
          current: rupees(round2(savedGst / size)),
          // quiet: Cost + GST is the one to type; the rate follows it (and can still be typed)
          input: <MoneyBox quiet value={draft.unitGst} maxDigits={6} onChange={(v) => setFigure("unitGst", v)} label={`${rateLabel}: ${name}`} />,
        },
        {
          key: "price",
          label: t("costGst"),
          current: rupees(savedGst),
          // the cursor starts here whenever the card opens
          input: (
            <MoneyBox autoFocus invalid={tried && rate <= 0} value={draft.priceGst} maxDigits={7} onChange={(v) => setFigure("priceGst", v)} label={`${t("costGst")}: ${name}`} />
          ),
        },
        // how many were bought: stays
        {
          key: "quantity",
          label: t("quantity"),
          current: "",
          input: <span className="tabular block pr-3.5 text-right text-base font-semibold">{saved.quantity.toLocaleString("en-IN")}</span>,
        },
      ]}
      total={total}
      error={tried && rate <= 0 ? tp("hintCost") : null}
      actionLabel={ts("saveLine")}
      onDone={done}
    />
  );
}
