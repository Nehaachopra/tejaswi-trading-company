"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { packLabel, rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { SETTLE_ICON } from "../sale-return/product-details-card";
import { chip } from "../shared/form-basics";
import { QuantityBox } from "../shared/pack-parts";
import { ProductDetailsCard as CardFrame, GodownRows } from "../shared/product-details-card";
import { emptyLine, placedOf, type ReturnLine, type Settle, useReturnEntry, type When } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// a purchase return's product details card, as a sale return's, in two steps. First: Basis | Current | New for the rate
// (as bought, not changed) and Quantity (Current: what was bought and can still go back; New: how many go back), and
// Item sent from (the main godown filled in when it holds them, never more than a godown holds), then Next. Second:
// Replace or Refund; Replace asks when the new packs come: Now (and the godowns they go into) or Later (nothing more).
// Save. Clearing the quantity of one on the return turns Next into Save, which takes it off
export function ProductDetailsCard() {
  const { cardFor, packOf } = useReturnEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each item opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, lines, lineOf, putLine, setCardFor, purchaseLine, godownsOf, spotsOf, fromMain } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const line = purchaseLine(pack.productId);
  const [draft, setDraft] = useState<ReturnLine>(() => lineOf(pack.productId));
  const [step, setStep] = useState<"first" | "second">("first");
  const close = () => setCardFor(null);
  const price = round2(line.rate * (1 + line.gstRate / 100));
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;

  // the figures: how many go back, taken out of godowns, coming in again (replaced), and what they come to with GST, in
  // paise (replaced or refunded alike)
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft.godowns);
  const into = placedOf(draft.into);
  const value = Math.round(line.rate * 100) * quantity;
  const total = value + Math.round((value * line.gstRate) / 100);
  // undo: one already on the return with its quantity cleared (or 0) shows Save, which takes it off the return
  const undo = !!lines[pack.productId] && quantity < 1;
  // Next or Save tapped with something missing: marked red, said under the button
  const [tried, setTried] = useState(false);
  const bad = {
    quantity: quantity < 1,
    godowns: quantity >= 1 && placed !== quantity,
    settle: draft.settle === null,
    when: draft.settle === "replace" && draft.when === null,
    into: draft.settle === "replace" && draft.when === "now" && into !== quantity,
  };
  const error = !tried
    ? null
    : step === "first"
      ? bad.quantity
        ? t("missing.quantity")
        : bad.godowns
          ? t("missing.godowns")
          : null
      : bad.settle
        ? t("missing.settle")
        : bad.when
          ? t("missing.when")
          : bad.into
            ? t("missing.replaceInto")
            : null;

  // Next: on to Replace or Refund once the quantity and its godowns are in
  function next() {
    if (bad.quantity || bad.godowns) return setTried(true);
    setTried(false);
    setStep("second");
  }
  // Save: only the godowns something leaves from or goes into
  function done() {
    if (bad.settle || bad.when || bad.into) return setTried(true);
    const kept = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => (Number(v) || 0) > 0));
    putLine(pack.productId, { ...draft, godowns: kept(draft.godowns), into: draft.settle === "replace" && draft.when === "now" ? kept(draft.into) : {} });
    close();
  }
  // Refund: when the new packs come, and their godowns, start empty again
  const pick = (s: Settle) => {
    setTried(false);
    setDraft((d) => (s === "refund" ? { ...d, settle: s, when: null, into: {} } : { ...d, settle: s }));
  };
  // Later: the new packs' godowns are asked when they come
  const pickWhen = (w: When) => {
    setTried(false);
    setDraft((d) => ({ ...d, when: w, into: w === "later" ? {} : d.into }));
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
        // the rate it was bought at, with GST: shown under New only, never changed
        { key: "price", label: ts("priceGst"), current: "", input: <span className="tabular text-right font-bold">{rupees(price)}</span> },
        // how many were bought and can still go back, and how many go back
        {
          key: "quantity",
          label: ts("quantity"),
          current: line.canReturn.toLocaleString("en-IN"),
          input: (
            <QuantityBox
              autoFocus
              value={draft.quantity}
              // never more than can go back, nor more than is free (the rest is reserved for orders)
              max={Math.min(line.canReturn, line.free)}
              // down to 0: one already on the return can be undone
              min={lines[pack.productId] ? 0 : 1}
              label={`${t("returning")}: ${name}`}
              invalid={tried && bad.quantity}
              // a new quantity: all of it from the main godown (when it holds that many), the replacement's godowns
              // picked again
              onChange={(v) => setDraft((d) => (d.quantity === v ? d : { ...d, quantity: v, godowns: fromMain(pack.productId, Number(v) || 0), into: {} }))}
            />
          ),
        },
      ]}
      // where they leave from: the godowns holding this pack, never more than each holds
      godowns={{
        spots: godownsOf(pack.productId),
        quantity,
        parts: draft.godowns,
        onPart: (godownId, v) => setDraft((d) => ({ ...d, godowns: { ...d.godowns, [godownId]: v } })),
        leftLabel: ts("leftToPlace"),
        invalid: tried && step === "first" && bad.godowns,
        label: t("sentFrom"),
        // (the arrow pulses while packs are still to take: the main godown may not hold them)
        capAtHeld: true,
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
            {/* Replace: when the new packs come, plain chips */}
            {draft.settle === "replace" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold opacity-60">{t("newPacksCome")}</span>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("newPacksCome")}>
                  {(["now", "later"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={draft.when === w}
                      aria-invalid={tried && bad.when}
                      onClick={() => pickWhen(w)}
                      className={cn(chip(draft.when === w), tried && bad.when && "border-danger")}
                    >
                      {t(`when.${w}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Now: the godowns the new packs go into */}
            {draft.settle === "replace" && draft.when === "now" && (
              <div className={cn("rounded-control", tried && bad.into && "ring-2 ring-danger")}>
                <GodownRows
                  spots={spotsOf(pack.productId)}
                  quantity={quantity}
                  parts={draft.into}
                  onPart={(godownId, v) => setDraft((d) => ({ ...d, into: { ...d.into, [godownId]: v } }))}
                  leftLabel={ts("leftToPlace")}
                  name={name}
                />
              </div>
            )}
          </>
        ),
      }}
      total={total}
      error={error}
      actionLabel={step === "first" && !undo ? t("next") : ts("saveLine")}
      onDone={step === "first" ? (undo ? () => (putLine(pack.productId, emptyLine()), close()) : next) : done}
    />
  );
}
