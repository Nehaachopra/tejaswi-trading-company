"use client";

import { useState } from "react";

import { packLabel, rupees } from "~/lib/format";

import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { QuantityBox } from "../shared/pack-parts";
import { ProductDetailsCard as CardFrame } from "../shared/product-details-card";
import { type CameLine, placedOf, useReplacement } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// the Items stage's product details card, as a purchase return's: Basis | Current | New for the cost (as bought, not
// changed) and Quantity (Current: how many are to come; New: how many came on this bill, nothing filled in), then the
// godowns they go into (nothing filled in), and Save. Clearing the quantity of one already in takes it off
export function ProductDetailsCard() {
  const { cardFor, packOf } = useReplacement();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each item opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, ts, tp, lines, lineOf, putLine, setCardFor, pendingLine, spotsOf, figureOf } = useReplacement();
  const owed = pendingLine(pack.productId);
  const [draft, setDraft] = useState<CameLine>(() => lineOf(pack.productId));
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft.into);
  const already = !!lines[pack.productId];
  // Save tapped with something missing: marked red, said under Save
  const [tried, setTried] = useState(false);
  const bad = { quantity: quantity < 1 && !already, godowns: quantity >= 1 && placed !== quantity };
  const error = !tried ? null : bad.quantity ? ts("hintQuantity") : bad.godowns ? t("missing") : null;

  function done() {
    if (bad.quantity || bad.godowns) return setTried(true);
    // only the godowns something goes into
    putLine(pack.productId, { ...draft, into: Object.fromEntries(Object.entries(draft.into).filter(([, v]) => (Number(v) || 0) > 0)) });
    close();
  }

  return (
    <CardFrame
      group={group}
      pack={pack}
      onClose={close}
      // (once it's in: the bin takes it off)
      onRemove={already ? () => (putLine(pack.productId, { quantity: "", into: {} }), close()) : undefined}
      removeLabel={ts("removeFromCart")}
      headings={{ basis: ts("basis"), current: ts("current"), new: ts("new") }}
      rows={[
        // the cost it was bought at, with GST: under New only, never changed
        { key: "price", label: ts("priceGst"), current: "", input: <span className="tabular text-right font-bold">{rupees(round2(owed.rate * (1 + owed.gstRate / 100)))}</span> },
        // how many are to come, and how many came
        {
          key: "quantity",
          label: ts("quantity"),
          current: owed.quantity.toLocaleString("en-IN"),
          input: (
            <QuantityBox
              autoFocus
              value={draft.quantity}
              max={owed.quantity}
              // down to 0: one already in can be taken off
              min={already ? 0 : 1}
              label={`${t("came")}: ${name}`}
              invalid={tried && bad.quantity}
              // a new quantity: its godowns picked again
              onChange={(v) => setDraft((d) => (d.quantity === v ? d : { quantity: v, into: {} }))}
            />
          ),
        },
      ]}
      // where they go
      godowns={{
        spots: spotsOf(pack.productId),
        quantity,
        parts: draft.into,
        onPart: (godownId, v) => setDraft((d) => ({ ...d, into: { ...d.into, [godownId]: v } })),
        leftLabel: tp("leftToPlace"),
        invalid: tried && bad.godowns,
      }}
      total={figureOf(pack.productId, quantity).total}
      error={error}
      actionLabel={ts("saveLine")}
      onDone={done}
    />
  );
}
