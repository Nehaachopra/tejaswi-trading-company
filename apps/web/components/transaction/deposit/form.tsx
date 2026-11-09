"use client";

import { useState } from "react";

import { DepositProvider } from "~/providers/deposit";

import { EntryNote, EntryPage, NextButton, StepCard, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { AmountCard } from "./amount-card";
import { DetailsCard, SaveBlock } from "./details-card";
import { type DepositStep, DepositEntryProvider, useDepositEntry, useDepositEntryState } from "./state";

// /transaction/deposit: cash put into a bank account, laid out like a receipt: one card at a time with Back and Next,
// and a summary that goes back to any card. 1 the amount (never more than the cash held) and the account it goes into;
// 2 the slip's reference and the remarks, the day (today, or before for one forgotten) and Save. A save goes to the
// deposit's own page. Discarding to open a menu starts the form again
export function DepositForm({ isAdmin }: { isAdmin: boolean }) {
  const [round, setRound] = useState(0);
  return (
    <DepositProvider>
      <DepositEntry key={round} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />
    </DepositProvider>
  );
}

function DepositEntry({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const state = useDepositEntryState({ isAdmin, onDiscard });
  return (
    <DepositEntryProvider value={state}>
      <DepositEntryView />
    </DepositEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function DepositEntryView() {
  const { t, tc, tpf, loading, loadFailed, retryLoad, value, tried, complete, steps, current, index, reachable, summaryOpen, setSummaryOpen, stepName, missingOf, summary, leaveDialog, show, next } =
    useDepositEntry();

  // the bank accounts and balances first, so the account list shows what each holds from the start
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
    <SummaryLines<DepositStep>
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
        missing={tried && !complete[current] ? missingOf() : null}
        end={current === "details" ? <SaveBlock /> : <NextButton onClick={next} />}
      >
        {current === "amount" ? <AmountCard /> : <DetailsCard />}
      </StepCard>
    </EntryPage>
  );
}
