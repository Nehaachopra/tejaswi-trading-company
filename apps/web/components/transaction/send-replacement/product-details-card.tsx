"use client";

import { useState } from "react";

import { packLabel, rupees } from "~/lib/format";

import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { QuantityBox } from "../shared/pack-parts";
import { ProductDetailsCard as CardFrame } from "../shared/product-details-card";
import { type GoLine, placedOf, useSendEntry } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// the Cart stage's product details card, as a purchase replacement's: Basis | Current | New for the price (as first sold,
// not changed) and Quantity (Current: how many are to go; New: how many go now, nothing filled in), then the godowns they
// leave from (never more than one holds, with what each has), and Save. Clearing the quantity of one already in takes
// it off
export function ProductDetailsCard() {
  const { cardFor, packOf } = useSendEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each item opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, ts, lines, lineOf, putLine, setCardFor, pendingLine, spotsOf, figureOf } = useSendEntry();
  const owed = pendingLine(pack.productId);
  const [draft, setDraft] = useState<GoLine>(() => lineOf(pack.productId));
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft.from);
  const already = !!lines[pack.productId];
  // Save tapped with something missing: marked red, said under Save
  const [tried, setTried] = useState(false);
  const bad = { quantity: quantity < 1 && !already, godowns: quantity >= 1 && placed !== quantity };
  const error = !tried ? null : bad.quantity ? ts("hintQuantity") : bad.godowns ? t("missing") : null;

  function done() {
    if (bad.quantity || bad.godowns) return setTried(true);
    // only the godowns something leaves from
    putLine(pack.productId, { ...draft, from: Object.fromEntries(Object.entries(draft.from).filter(([, v]) => (Number(v) || 0) > 0)) });
    close();
  }

  return (
    <CardFrame
      group={group}
      pack={pack}
      onClose={close}
      // (once it's in: the bin takes it off)
      onRemove={already ? () => (putLine(pack.productId, { quantity: "", from: {} }), close()) : undefined}
      removeLabel={ts("removeFromCart")}
      headings={{ basis: ts("basis"), current: ts("current"), new: ts("new") }}
      rows={[
        // the price it first sold at, with GST: under New only, never changed
        { key: "price", label: ts("priceGst"), current: "", input: <span className="tabular text-right font-bold">{rupees(round2(owed.rate * (1 + owed.gstRate / 100)))}</span> },
        // how many are to go, and how many go now
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
              label={`${t("dispatched")}: ${name}`}
              invalid={tried && bad.quantity}
              // a new quantity: its godowns picked again
              onChange={(v) => setDraft((d) => (d.quantity === v ? d : { quantity: v, from: {} }))}
            />
          ),
        },
      ]}
      // where they leave from: never more than a godown holds
      godowns={{
        spots: spotsOf(pack.productId),
        quantity,
        parts: draft.from,
        onPart: (godownId, v) => setDraft((d) => ({ ...d, from: { ...d.from, [godownId]: v } })),
        leftLabel: ts("leftToPlace"),
        invalid: tried && bad.godowns,
        capAtHeld: true,
      }}
      total={figureOf(pack.productId, quantity).total}
      error={error}
      actionLabel={ts("saveLine")}
      onDone={done}
    />
  );
}
