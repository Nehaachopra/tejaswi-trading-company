"use client";

import { useState } from "react";

import { SalaryProvider } from "~/providers/salary";

import {
  EntryNote,
  EntryPage,
  NextButton,
  StepCard,
  SummaryBar,
  SummaryCard,
  SummaryLines,
} from "../shared/entry-frame";
import { DetailsCard, SaveBlock } from "./details-card";
import { AmountCard, ForCard, PayCard } from "./pay-card";
import {
  type SalaryStart,
  type SalaryStep,
  SalaryEntryProvider,
  useSalaryEntry,
  useSalaryEntryState,
} from "./state";

// /transaction/salary, the admin's: paying an employee, laid out like a receipt: one card at a time with Back and Next,
// and a summary that goes back to any card. 1 the employee, a month's salary (one still owed) or an advance, the amount
// and where it's paid from (cash or one bank account); 2 the reference and the remarks, the day and Save. A save goes to
// its own page. Months are posted by the app on each pay day. Discarding to open a menu starts the form again
export function SalaryForm({ start }: { start?: SalaryStart }) {
  const [round, setRound] = useState(0);
  return (
    <SalaryProvider>
      {/* a form started again (after discarding) starts empty */}
      <SalaryEntry
        key={round}
        start={round === 0 ? start : undefined}
        onDiscard={() => setRound((r) => r + 1)}
      />
    </SalaryProvider>
  );
}

function SalaryEntry({ start, onDiscard }: { start?: SalaryStart; onDiscard: () => void }) {
  const state = useSalaryEntryState({ start, onDiscard });
  return (
    <SalaryEntryProvider value={state}>
      <SalaryEntryView />
    </SalaryEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function SalaryEntryView() {
  const {
    t,
    tc,
    tpf,
    loading,
    loadFailed,
    retryLoad,
    value,
    tried,
    complete,
    steps,
    current,
    index,
    reachable,
    summaryOpen,
    setSummaryOpen,
    stepName,
    missingOf,
    summary,
    leaveDialog,
    show,
    next,
  } = useSalaryEntry();

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
    <SummaryLines<SalaryStep>
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
        <SummaryBar
          label={tpf("summary")}
          total={value}
          open={summaryOpen}
          onToggle={() => setSummaryOpen((o) => !o)}
        >
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
        // Paid for is chips only: a tap moves on, so no Next
        end={
          current === "details" ? (
            <SaveBlock />
          ) : current === "for" ? null : (
            <NextButton onClick={next} />
          )
        }
      >
        {current === "for" ? (
          <ForCard />
        ) : current === "pay" ? (
          <PayCard />
        ) : current === "amount" ? (
          <AmountCard />
        ) : (
          <DetailsCard />
        )}
      </StepCard>
    </EntryPage>
  );
}
