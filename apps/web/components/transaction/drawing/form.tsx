"use client";

import { useState } from "react";

import { DrawingProvider } from "~/providers/drawing";

import { EntryNote, EntryPage, NextButton, StepCard, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { AmountCard } from "./amount-card";
import { DetailsCard, SaveBlock } from "./details-card";
import { KindCard } from "./kind-card";
import { ProductsCard } from "./products-card";
import { type DrawingStep, DrawingEntryProvider, useDrawingEntry, useDrawingEntryState } from "./state";

// /transaction/drawing (the admin's): what the owner takes out for themselves, one card at a time with Back and Next,
// and a summary that goes back to any card. 1 Money or Goods (a chip moves on); 2 money: the amount and where it's
// taken from (never more than it holds); goods: the products, as a sale's (a cart, godowns), valued at cost; 3 the
// remarks, the day and Save. A save goes to its own page. Discarding to open a menu starts the form again
export function DrawingForm() {
  const [round, setRound] = useState(0);
  return (
    <DrawingProvider>
      <DrawingEntry key={round} onDiscard={() => setRound((r) => r + 1)} />
    </DrawingProvider>
  );
}

function DrawingEntry({ onDiscard }: { onDiscard: () => void }) {
  const state = useDrawingEntryState({ onDiscard });
  return (
    <DrawingEntryProvider value={state}>
      <DrawingEntryView />
    </DrawingEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function DrawingEntryView() {
  const { t, tc, tpf, loading, loadFailed, retryLoad, total, tried, complete, steps, current, index, reachable, summaryOpen, setSummaryOpen, stepName, missingOf, summary, leaveDialog, show, next } =
    useDrawingEntry();

  if (loading)
    return (
      <EntryNote title={t("title")} loading>
        {tc("looking")}
      </EntryNote>
    );
  if (loadFailed)
    return (
      <EntryNote title={t("title")} failed onRetry={retryLoad}>
        {t("loadFailed")}
      </EntryNote>
    );

  const lines = (
    <SummaryLines<DrawingStep>
      type={t("title")}
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
      title={t("title")}
      summaryLabel={tpf("summary")}
      showBar={total > 0}
      bar={
        <SummaryBar label={tpf("summary")} total={total} open={summaryOpen} onToggle={() => setSummaryOpen((o) => !o)}>
          {lines}
        </SummaryBar>
      }
      summary={
        <SummaryCard label={tpf("summary")} total={total}>
          {lines}
        </SummaryCard>
      }
    >
      {leaveDialog}
      <StepCard
        key={current}
        id={current}
        name={stepName(current)}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf() : null}
        // the kind's chips move on by themselves: no Next under them
        end={current === "details" ? <SaveBlock /> : current === "kind" ? null : <NextButton onClick={next} />}
      >
        {current === "kind" ? <KindCard /> : current === "amount" ? <AmountCard /> : current === "products" ? <ProductsCard /> : <DetailsCard />}
      </StepCard>
    </EntryPage>
  );
}
