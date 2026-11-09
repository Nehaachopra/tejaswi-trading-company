"use client";

import { useState } from "react";

import { OtherProvider } from "~/providers/other";

import { EntryNote, EntryPage, NextButton, StepCard, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { DetailsCard, SaveBlock } from "./details-card";
import { EntryCard } from "./entry-card";
import { type OtherStep, OtherEntryProvider, useOtherEntry, useOtherEntryState } from "./state";

// /transaction/other, the admin's: a journal entry for anything no other page covers, laid out like a receipt: one card
// at a time with Back and Next, and a summary that goes back to any card. 1 the amount, the ledger debited and the one
// credited (our own heads only); 2 why (required), the day and Save. A save goes to its own page. Discarding to open a
// menu starts the form again
export function OtherForm() {
  const [round, setRound] = useState(0);
  return (
    <OtherProvider>
      <OtherEntry key={round} onDiscard={() => setRound((r) => r + 1)} />
    </OtherProvider>
  );
}

function OtherEntry({ onDiscard }: { onDiscard: () => void }) {
  const state = useOtherEntryState({ onDiscard });
  return (
    <OtherEntryProvider value={state}>
      <OtherEntryView />
    </OtherEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function OtherEntryView() {
  const { t, tc, tpf, loading, loadFailed, retryLoad, value, tried, complete, steps, current, index, reachable, summaryOpen, setSummaryOpen, stepName, missingOf, summary, leaveDialog, show, next } =
    useOtherEntry();

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
    <SummaryLines<OtherStep>
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
      showBar={value > 0}
      bar={
        <SummaryBar label={tpf("summary")} total={value} open={summaryOpen} onToggle={() => setSummaryOpen((o) => !o)}>
          {lines}
        </SummaryBar>
      }
      summary={
        <SummaryCard label={tpf("summary")} total={value}>
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
        missing={tried && !complete[current] ? missingOf(current) : null}
        end={current === "details" ? <SaveBlock /> : <NextButton onClick={next} />}
      >
        {current === "entry" ? <EntryCard /> : <DetailsCard />}
      </StepCard>
    </EntryPage>
  );
}
