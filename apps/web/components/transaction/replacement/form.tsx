"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { dayInWords } from "~/components/ui/date-input";
import { rupees } from "~/lib/format";
import { usePendingReplacement } from "~/providers/purchase-return";
import { useReturnSources } from "~/providers/sale-return";

import { ProductImage } from "../../product/products/product-tile";
import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { CartStage } from "./cart-stage";
import { BillCard, DetailsCard, SaveBlock } from "./cards";
import { ReplacementProvider, type ReplacementStep, useReplacement, useReplacementState } from "./state";

// /history/[id]/replacement, from Record replacement on a return's debit note (the admin's): the packs the supplier
// sent back on their own invoice, as a purchase: 1 Items: how many of each came and their godowns; 2 Bill: the supplier's
// bill (its file, number and date); 3 Details: remarks and Save. A summary on the right (a bar above on a phone).
// Saved, it lands on the purchase's success card
export function ReplacementForm({ id }: { id: string }) {
  const [round, setRound] = useState(0);
  return <Loader key={round} id={id} onDiscard={() => setRound((r) => r + 1)} />;
}

// waits for what's still to come, the products and stock, then opens the stages
function Loader({ id, onDiscard }: { id: string; onDiscard: () => void }) {
  const t = useTranslations("transactions.purchaseReturn.receive");
  const ts = useTranslations("transactions.sale");
  const read = usePendingReplacement(id, true);
  const sources = useReturnSources();
  if (read.loading || sources.loading)
    return (
      <EntryNote title={t("title")} loading>
        {t("loading")}
      </EntryNote>
    );
  if (read.loadFailed || sources.loadFailed || !read.pending)
    return (
      <EntryNote title={t("title")} failed onRetry={sources.retry}>
        {ts("loadFailed")}
      </EntryNote>
    );
  // nothing left to come: said plainly
  if (read.pending.lines.length === 0) return <EntryNote title={t("title")}>{t("nothingLeft")}</EntryNote>;
  return <Entry pending={read.pending} products={sources.products} stock={sources.stock} onDiscard={onDiscard} />;
}

// the state, made once, for every stage
function Entry(props: Parameters<typeof useReplacementState>[0]) {
  const state = useReplacementState(props);
  return (
    <ReplacementProvider value={state}>
      <View />
    </ReplacementProvider>
  );
}

// the page: the stage on its own with Back and Next, and the summary
function View() {
  const { t, tp, tc, locale, pending, lines, nameOf, packOf, figureOf, total, billNumber, billDay, remarks, current, index, steps, reachable, summaryOpen, setSummaryOpen, show, next, tried, complete, missingOf, leaveDialog } =
    useReplacement();
  const title = t("titleFor", { number: pending.assignedId });

  // the summary: the supplier, each item that came (photo, name, how many, its total), the bill, then the remarks
  const summary: SummaryItem<ReplacementStep>[] = [
    { key: "supplier", step: "items", heading: tp("steps.supplier"), value: pending.supplierName },
    {
      key: "items",
      step: "items",
      heading: t("steps.items"),
      value: Object.entries(lines).map(([productId, l]) => {
        const found = packOf(productId);
        const q = Number(l.quantity) || 0;
        return {
          name: nameOf(productId),
          middle: `×${q.toLocaleString("en-IN")}`,
          amount: rupees(figureOf(productId, q).total / 100),
          image: found ? <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" /> : undefined,
        };
      }),
    },
    { key: "bill", step: "bill", heading: tp("billNumber"), value: billNumber || null },
    { key: "billDate", step: "bill", heading: tp("billDate"), value: index >= steps.indexOf("bill") && billDay ? dayInWords(billDay, locale) : null },
    { key: "remarks", step: "details", heading: tc("q.remarks"), value: remarks.trim() || null },
  ];
  const linesView = (
    <SummaryLines<ReplacementStep>
      type={t("type")}
      items={summary}
      current={current}
      reachable={reachable}
      onPick={(s) => {
        setSummaryOpen(false);
        show(s);
      }}
    />
  );

  return (
    <EntryPage
      title={title}
      summaryLabel={t("summary")}
      showBar
      bar={
        <SummaryBar label={t("summary")} total={total} open={summaryOpen} onToggle={() => setSummaryOpen((o) => !o)}>
          {linesView}
        </SummaryBar>
      }
      summary={
        <SummaryCard label={t("summary")} total={total}>
          {linesView}
        </SummaryCard>
      }
    >
      {leaveDialog}
      <StepCard
        key={current}
        id={current}
        // (the items stage reads Cart)
        name={current === "items" ? t("steps.cart") : t(`steps.${current}`)}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        end={current === "details" ? <SaveBlock /> : <NextButton onClick={next} />}
      >
        {current === "items" ? <CartStage /> : current === "bill" ? <BillCard /> : <DetailsCard />}
      </StepCard>
    </EntryPage>
  );
}
