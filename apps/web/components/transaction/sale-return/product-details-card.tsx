"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { packLabel, rupees } from "~/lib/format";

import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { QuantityBox } from "../shared/pack-parts";
import { ProductDetailsCard as CardFrame } from "../shared/product-details-card";
import { placedOf, type ReturnLine, useReturnEntry } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// a return's product details card, on the shared one: Basis | Current | New for the price (as sold, not changed) and
// Quantity (Current: what was sold and can still come back; New: how many come back), then the godowns they go back
// into (nothing filled in; only the packs coming back are placed) and Save. The bin takes it off the return
export function ProductDetailsCard() {
  const { cardFor, packOf } = useReturnEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each item opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, lines, lineOf, putLine, setCardFor, saleLine, godownsOf } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const line = saleLine(pack.productId);
  const [draft, setDraft] = useState<ReturnLine>(() => lineOf(pack.productId));
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;

  // the figures: how many come back, placed in godowns, and what they come to with GST, in paise
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft);
  const value = Math.round(line.rate * 100) * quantity;
  const total = value + Math.round((value * line.gstRate) / 100);
  // Save tapped with something missing: marked red, said under Save
  const [tried, setTried] = useState(false);
  const bad = { quantity: quantity < 1, godowns: quantity >= 1 && placed !== quantity };
  const error = !tried ? null : bad.quantity ? t("missing.quantity") : bad.godowns ? ts("hintGodowns") : null;

  function done() {
    if (bad.quantity || bad.godowns) {
      setTried(true);
      return;
    }
    // only the godowns something goes back into
    putLine(pack.productId, { ...draft, godowns: Object.fromEntries(Object.entries(draft.godowns).filter(([, v]) => (Number(v) || 0) > 0)) });
    close();
  }

  return (
    <CardFrame
      group={group}
      pack={pack}
      onClose={close}
      // (once some of it is on the return: the bin takes it off)
      onRemove={lines[pack.productId] ? () => (putLine(pack.productId, { quantity: "", godowns: {} }), close()) : undefined}
      removeLabel={t("removeFromReturn")}
      headings={{ basis: ts("basis"), current: ts("current"), new: ts("new") }}
      rows={[
        // the price it sold at, with GST: shown, not changed
        { key: "price", label: ts("priceGst"), current: rupees(round2(line.rate * (1 + line.gstRate / 100))), input: <span /> },
        // how many were sold and can still come back, and how many come back
        {
          key: "quantity",
          label: ts("quantity"),
          current: line.canReturn.toLocaleString("en-IN"),
          input: (
            <QuantityBox
              autoFocus
              value={draft.quantity}
              max={line.canReturn}
              label={`${t("returning")}: ${name}`}
              invalid={tried && bad.quantity}
              // a new quantity clears the godowns, to be placed again
              onChange={(v) => setDraft((d) => (d.quantity === v ? d : { quantity: v, godowns: {} }))}
            />
          ),
        },
      ]}
      // the godowns they go back into, only once some come back (none past what's coming back)
      godowns={{
        spots: godownsOf(pack.productId),
        quantity,
        parts: draft.godowns,
        onPart: (godownId, v) => setDraft((d) => ({ ...d, godowns: { ...d.godowns, [godownId]: v } })),
        leftLabel: ts("leftToPlace"),
        invalid: tried && bad.godowns,
      }}
      total={total}
      error={error}
      actionLabel={ts("saveLine")}
      onDone={done}
    />
  );
}
