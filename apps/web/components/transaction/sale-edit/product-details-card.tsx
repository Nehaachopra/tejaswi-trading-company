"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { packLabel, rupees } from "~/lib/format";
import { asField, parseAmount, unitsIn } from "~/lib/price";

import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { lineFigures } from "../sale/state";
import { MoneyBox } from "../shared/figures-table";
import { ProductDetailsCard as CardFrame } from "../shared/product-details-card";
import { type PriceLine, useSaleEdit } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// an edit's product details card, on the shared one: Basis | Current | New for Rate per unit and Price + GST (the New
// price starts at what it sold at), Quantity as sold (not to be changed), and Save. No bin, no godowns. Below cost,
// Save asks first
export function ProductDetailsCard() {
  const { cardFor, packOf } = useSaleEdit();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each item opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, lines, putPrice, setCardFor, savedLine } = useSaleEdit();
  const units = useTranslations("products.items.form.units");
  const [draft, setDraft] = useState<PriceLine>(() => lines.find((l) => l.productId === pack.productId)!);
  // the rate as typed, until the price is typed instead (then it follows the price)
  const [rateText, setRateText] = useState<string | null>(null);
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const gst = pack.gstPercent ?? 0;
  const list = pack.priceAfterGst ?? 0;

  // the figures: the price, its rate before GST, and the line's total at the quantity sold
  const quantity = savedLine(pack.productId).quantity;
  const price = parseAmount(draft.price) ?? 0;
  const { rate, total } = lineFigures(price, quantity, gst);
  const belowCost = pack.weightedAverageCost != null && rate < Math.round(pack.weightedAverageCost * 100);
  const costGst = round2((pack.weightedAverageCost ?? 0) * (1 + gst / 100));
  const rateLabel = t("pricePer", { unit: units(pack.packSizeCode) });
  const rateValue = rateText ?? (price > 0 ? asField(round2(price / unitsIn(pack))) : "");
  // Save tapped with no price: marked red, said under Save; below cost: asked first
  const [tried, setTried] = useState(false);
  const [askBelow, setAskBelow] = useState(false);

  function done(sellBelow = false) {
    if (price <= 0) {
      setTried(true);
      return;
    }
    if (belowCost && !sellBelow) {
      setAskBelow(true);
      return;
    }
    putPrice({ ...draft, belowCostOk: belowCost });
    close();
  }

  return (
    <CardFrame
      group={group}
      pack={pack}
      onClose={close}
      headings={{ basis: t("basis"), current: t("current"), new: t("new") }}
      rows={[
        // the rate for one unit, with GST: typing it fills the price
        {
          key: "rate",
          label: rateLabel,
          current: pack.priceAfterGst != null ? rupees(round2(list / unitsIn(pack))) : "–",
          input: (
            <MoneyBox
              quiet
              value={rateValue}
              maxDigits={6}
              label={`${rateLabel}: ${name}`}
              onChange={(v) => {
                setRateText(v);
                const r = parseAmount(v);
                setDraft((d) => ({ ...d, price: r === null ? "" : asField(round2(r * unitsIn(pack))) }));
              }}
            />
          ),
        },
        // the pack's price with GST (the cursor starts here)
        {
          key: "price",
          label: t("priceGst"),
          current: pack.priceAfterGst != null ? rupees(list) : "–",
          input: (
            <MoneyBox
              autoFocus
              value={draft.price}
              invalid={tried && price <= 0}
              maxDigits={7}
              label={`${t("priceGst")}: ${name}`}
              onChange={(v) => {
                setRateText(null);
                setDraft((d) => ({ ...d, price: v }));
              }}
            />
          ),
        },
        // how many were sold: stays
        {
          key: "quantity",
          label: t("quantity"),
          current: "",
          input: <span className="tabular block pr-3.5 text-right text-base font-semibold">{quantity.toLocaleString("en-IN")}</span>,
        },
      ]}
      total={total}
      error={tried && price <= 0 ? t("hintPrice") : null}
      actionLabel={t("saveLine")}
      onDone={() => done()}
      // (not while the below-cost question is open: Escape answers that one)
      escapeOff={askBelow}
    >
      {/* below cost: asked whether to sell it that low */}
      <ConfirmDialog
        open={askBelow}
        tone="danger"
        title={t("sellBelowTitle")}
        body={
          <>
            <p>{t("sellBelowFact", { price: rupees(price), cost: rupees(costGst) })}</p>
            <p className="mt-2 font-semibold text-chestnut">{t("sellBelowAsk", { loss: rupees(round2(costGst - price)) })}</p>
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
