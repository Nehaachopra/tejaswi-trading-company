"use client";

import { IndianRupee, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { packLabel, rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { chip } from "../shared/form-basics";
import { QuantityBox } from "../shared/pack-parts";
import { ProductDetailsCard as CardFrame, GodownRows } from "../shared/product-details-card";
import { emptyLine, placedOf, type ReturnLine, type Settle, useReturnEntry } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// each choice's icon: Replace (arrows going round), Refund (₹)
export const SETTLE_ICON = { replace: RefreshCw, refund: IndianRupee } as const;

// a return's product details card, on the shared one, in two steps. First: Basis | Current | New for the price (as sold,
// not changed) and Quantity (Current: what was sold and can still come back; New: how many come back), and Item received
// in (the main godown filled in, changed only for the odd other one), then Next. Second: Replace or Refund; Replace asks
// the godowns the new packs leave from (as many as come back). Save. The bin takes it off the return
export function ProductDetailsCard() {
  const { cardFor, packOf } = useReturnEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each item opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, lines, lineOf, putLine, setCardFor, saleLine, godownsOf, outOf, mainId } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const line = saleLine(pack.productId);
  const [draft, setDraft] = useState<ReturnLine>(() => lineOf(pack.productId));
  const [step, setStep] = useState<"first" | "second">("first");
  const close = () => setCardFor(null);
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;

  // the figures: how many come back, placed in godowns, going out again (replaced), and what they come to with GST, in
  // paise (a replaced one: nothing, the new packs take its place)
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft);
  const out = Object.values(draft.out).reduce((a, v) => a + (Number(v) || 0), 0);
  const value = Math.round(line.rate * 100) * quantity;
  const total = draft.settle === "replace" ? 0 : value + Math.round((value * line.gstRate) / 100);
  // Next or Save tapped with something missing: marked red, said under the button
  const [tried, setTried] = useState(false);
  const bad = {
    quantity: quantity < 1,
    godowns: quantity >= 1 && placed !== quantity,
    settle: draft.settle === null,
    out: draft.settle === "replace" && out !== quantity,
  };
  const error = !tried
    ? null
    : step === "first"
      ? bad.quantity
        ? t("missing.quantity")
        : bad.godowns
          ? ts("hintGodowns")
          : null
      : bad.settle
        ? t("missing.settle")
        : bad.out
          ? t("missing.replaceFrom")
          : null;

  // Next: on to Replace or Refund once the quantity and its godowns are in
  function next() {
    if (bad.quantity || bad.godowns) return setTried(true);
    setTried(false);
    setStep("second");
  }
  // Save: only the godowns something goes into or leaves from
  function done() {
    if (bad.settle || bad.out) return setTried(true);
    const kept = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => (Number(v) || 0) > 0));
    putLine(pack.productId, { ...draft, godowns: kept(draft.godowns), out: draft.settle === "replace" ? kept(draft.out) : {} });
    close();
  }
  const pick = (s: Settle) => {
    setTried(false);
    setDraft((d) => ({ ...d, settle: s }));
  };

  return (
    <CardFrame
      group={group}
      pack={pack}
      onClose={close}
      // (once some of it is on the return: the bin takes it off)
      onRemove={lines[pack.productId] ? () => (putLine(pack.productId, emptyLine()), close()) : undefined}
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
              // a new quantity: all of it into the main godown, and the replacement's godowns picked again
              onChange={(v) =>
                setDraft((d) => (d.quantity === v ? d : { ...d, quantity: v, godowns: mainId && (Number(v) || 0) > 0 ? { [mainId]: v } : {}, out: {} }))
              }
            />
          ),
        },
      ]}
      // where they come in: the main godown already filled in, so the arrow never pulses
      godowns={{
        spots: godownsOf(pack.productId),
        quantity,
        parts: draft.godowns,
        onPart: (godownId, v) => setDraft((d) => ({ ...d, godowns: { ...d.godowns, [godownId]: v } })),
        leftLabel: ts("leftToPlace"),
        invalid: tried && step === "first" && bad.godowns,
        label: t("receivedIn"),
        calm: true,
      }}
      // the second step: Replace or Refund, and a replacement's godowns
      second={{
        open: step === "second",
        backLabel: t("quantityAndGodowns"),
        onBack: () => {
          setTried(false);
          setStep("first");
        },
        body: (
          <>
            <div className="grid grid-cols-2 gap-2 py-1" role="group" aria-label={t("settleLabel")}>
              {(["replace", "refund"] as const).map((s) => {
                const Icon = SETTLE_ICON[s];
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={draft.settle === s}
                    aria-invalid={tried && bad.settle}
                    onClick={() => pick(s)}
                    className={cn(chip(draft.settle === s), "inline-flex items-center justify-center gap-2", tried && bad.settle && "border-danger")}
                  >
                    <Icon className="size-[18px]" aria-hidden />
                    {t(`settle.${s}`)}
                  </button>
                );
              })}
            </div>
            {/* Replace: the godowns the new packs leave from */}
            {draft.settle === "replace" && (
              <div className={cn("rounded-control", tried && bad.out && "ring-2 ring-danger")}>
                <GodownRows
                  spots={outOf(pack.productId)}
                  quantity={quantity}
                  parts={draft.out}
                  onPart={(godownId, v) => setDraft((d) => ({ ...d, out: { ...d.out, [godownId]: v } }))}
                  leftLabel={ts("leftToPlace")}
                  capAtHeld
                  name={name}
                />
              </div>
            )}
          </>
        ),
      }}
      total={total}
      error={error}
      actionLabel={step === "first" ? t("next") : ts("saveLine")}
      onDone={step === "first" ? next : done}
    />
  );
}
