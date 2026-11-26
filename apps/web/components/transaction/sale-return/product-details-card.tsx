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
import { emptyLine, placedOf, type ReturnLine, type Settle, useReturnEntry, type When } from "./state";

const round2 = (v: number) => Math.round(v * 100) / 100;

// each choice's icon: Replace (arrows going round), Refund (₹)
export const SETTLE_ICON = { replace: RefreshCw, refund: IndianRupee } as const;

// a return's product details card, on the shared one, in two steps (as a purchase return's). First: Basis | Current |
// New for the price (as sold, not changed) and Quantity (Current: what was sold and can still come back; New: how many
// come back), and Item received in (the main godown filled in, changed only for the odd other one), then Next. Second:
// Replace or Refund; Replace asks when the new packs go (a saved customer's): Now (and the godowns they leave from, as
// many as come back) or Later (nothing more: sent from History). A walk-in's go now. Save. The bin takes it off
export function ProductDetailsCard() {
  const { cardFor, packOf } = useReturnEntry();
  const found = cardFor ? packOf(cardFor) : null;
  if (!found) return null;
  // a fresh draft for each item opened
  return <CardBody key={found.pack.productId} group={found.group} pack={found.pack} />;
}

function CardBody({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, lines, lineOf, putLine, setCardFor, saleLine, godownsOf, outOf, mainId, walkIn } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const line = saleLine(pack.productId);
  const [draft, setDraft] = useState<ReturnLine>(() => lineOf(pack.productId));
  const [step, setStep] = useState<"first" | "second">("first");
  const close = () => setCardFor(null);
  const price = round2(line.rate * (1 + line.gstRate / 100));
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode, pack.packCount)}`;

  // the figures: how many come back, placed in godowns, going out again (replaced), and what they come to with GST, in
  // paise (replaced or refunded alike)
  const quantity = Number(draft.quantity) || 0;
  const placed = placedOf(draft);
  const out = Object.values(draft.out).reduce((a, v) => a + (Number(v) || 0), 0);
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
    out: draft.settle === "replace" && draft.when === "now" && out !== quantity,
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
        : bad.when
          ? t("missing.when")
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
    if (bad.settle || bad.when || bad.out) return setTried(true);
    const kept = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => (Number(v) || 0) > 0));
    putLine(pack.productId, { ...draft, godowns: kept(draft.godowns), out: draft.settle === "replace" && draft.when === "now" ? kept(draft.out) : {} });
    close();
  }
  // Refund: when the new packs go, and their godowns, start empty again; Replace for a walk-in: always now
  const pick = (s: Settle) => {
    setTried(false);
    setDraft((d) => (s === "refund" ? { ...d, settle: s, when: null, out: {} } : { ...d, settle: s, when: walkIn ? "now" : d.when }));
  };
  // Later: the godowns are asked when the packs go
  const pickWhen = (w: When) => {
    setTried(false);
    setDraft((d) => ({ ...d, when: w, out: w === "later" ? {} : d.out }));
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
        // the price it sold at, with GST: shown under New only, never changed
        {
          key: "price",
          label: ts("priceGst"),
          current: "",
          input: <span className="tabular text-right font-bold">{rupees(price)}</span>,
        },
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
              // down to 0: one already on the return can be undone
              min={lines[pack.productId] ? 0 : 1}
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
            {/* Replace (a saved customer's): when the new packs go, plain chips */}
            {draft.settle === "replace" && !walkIn && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold opacity-60">{t("newPacksGo")}</span>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("newPacksGo")}>
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
            {/* Now: the godowns the new packs leave from */}
            {draft.settle === "replace" && draft.when === "now" && (
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
      actionLabel={step === "first" && !undo ? t("next") : ts("saveLine")}
      onDone={step === "first" ? (undo ? () => (putLine(pack.productId, emptyLine()), close()) : next) : done}
    />
  );
}
