"use client";

import { useState } from "react";

import { type ContraKind, ContraProvider } from "~/providers/contra";

import { EntryNote, EntryPage, NextButton, StepCard, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { AmountCard } from "./amount-card";
import { DetailsCard, SaveBlock } from "./details-card";
import { type ContraStep, ContraEntryProvider, useContraEntry, useContraEntryState } from "./state";

// /transaction/deposit, /withdrawal and /transfer: cash put into a bank account, taken out of one, or money moved from
// one account to another, laid out like a receipt: one card at a time with Back and Next, and a summary that goes back to any card. 1 the amount (never more
// than the cash held for a deposit, or the account it leaves) and the account (a transfer's two); 2 the reference and the remarks,
// the day (today, or before for one forgotten) and Save. A save goes to its own page. Discarding to open a menu starts
// the form again
export function ContraForm({ kind, isAdmin }: { kind: ContraKind; isAdmin: boolean }) {
  const [round, setRound] = useState(0);
  return (
    <ContraProvider kind={kind}>
      <ContraEntry key={round} kind={kind} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />
    </ContraProvider>
  );
}

function ContraEntry({ kind, isAdmin, onDiscard }: { kind: ContraKind; isAdmin: boolean; onDiscard: () => void }) {
  const state = useContraEntryState({ kind, isAdmin, onDiscard });
  return (
    <ContraEntryProvider value={state}>
      <ContraEntryView />
    </ContraEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function ContraEntryView() {
  const { t, tc, tpf, loading, loadFailed, retryLoad, value, tried, complete, steps, current, index, reachable, summaryOpen, setSummaryOpen, stepName, missingOf, summary, leaveDialog, show, next } =
    useContraEntry();

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
    <SummaryLines<ContraStep>
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
