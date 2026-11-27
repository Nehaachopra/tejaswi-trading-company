"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { rupees, titleCase } from "~/lib/format";
import { useReceiptForEdit, useSaveReceiptEdit } from "~/providers/receipt-edit";

import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../../../transaction/shared/entry-frame";
import { dateLine, placesLine, textLine } from "../../../transaction/shared/summary";
import { AmountStage } from "./amount-stage";
import { DetailsStage, SaveBlock } from "./details-stage";
import { type EditStep, ReceiptEditProvider, useReceiptEdit, useReceiptEditState } from "./state";

// /history/[id]/edit for a receipt, from Edit receipt on its page (the admin's): 1 Amount: how much came in, any TDS,
// and where it came into; 2 Details: the cash part's reference, the remarks, the day and Save. What it was received for
// and who it came from stay as saved (shown in the summary). Saved over it and back to it in History; discarding starts
// it again from the saved receipt
export function ReceiptEditForm({ id }: { id: string }) {
  const [round, setRound] = useState(0);
  return <EditLoader key={round} id={id} onDiscard={() => setRound((r) => r + 1)} />;
}

// waits for the receipt and cash and the banks, then opens the stages
function EditLoader({ id, onDiscard }: { id: string; onDiscard: () => void }) {
  const te = useTranslations("history.receipt.edit");
  const read = useReceiptForEdit(id);
  const { saveEdit, saving, saved } = useSaveReceiptEdit();
  if (read.loading)
    return (
      <EntryNote title={te("title")} loading>
        {te("loading")}
      </EntryNote>
    );
  if (read.loadFailed || !read.data || !read.sources)
    return (
      <EntryNote title={te("title")} failed onRetry={read.retry}>
        {te("loadFailed")}
      </EntryNote>
    );
  return <EditEntry receipt={read.data} sources={read.sources} saveEdit={saveEdit} saving={saving} saved={saved} onDiscard={onDiscard} />;
}

// the state, made once, for every stage
function EditEntry(props: Parameters<typeof useReceiptEditState>[0]) {
  const state = useReceiptEditState(props);
  return (
    <ReceiptEditProvider value={state}>
      <EditView />
    </ReceiptEditProvider>
  );
}

// the page: the stage on its own with Back and Next, and the summary
function EditView() {
  const { t, te, tk, tr, tc, locale, receipt: r, amount, places, day, remarks, current, index, steps, reachable, summaryOpen, setSummaryOpen, show, next, tried, complete, missingOf, leaveDialog } = useReceiptEdit();
  const title = te("title");

  // the summary: what it was for and who from (as saved), the amount and where it came into, the day and remarks
  const summary: SummaryItem<EditStep>[] = [
    textLine<EditStep>("kind", "amount", tr("steps.kind"), r.scrap ? t("kinds.scrap") : tk(r.receivedFor)),
    textLine<EditStep>("from", "amount", tr("steps.from"), titleCase(r.receivedFromName)),
    textLine<EditStep>("amount", "amount", tr("steps.amount"), amount > 0 ? rupees(amount) : null),
    placesLine<EditStep>("amount", tr("steps.into"), places.filter((p) => p.amount > 0), tc("cash")),
    dateLine<EditStep>("date", "details", tc("q.date"), day, locale, index > 0),
    textLine<EditStep>("remarks", "details", tc("q.remarks"), remarks.trim() || null),
  ];
  const linesView = (
    <SummaryLines<EditStep>
      type={title}
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
      summaryLabel={te("summary")}
      showBar
      bar={
        <SummaryBar label={te("summary")} total={amount} open={summaryOpen} onToggle={() => setSummaryOpen((o) => !o)}>
          {linesView}
        </SummaryBar>
      }
      summary={
        <SummaryCard label={te("summary")} total={amount}>
          {linesView}
        </SummaryCard>
      }
    >
      {leaveDialog}
      <StepCard
        key={current}
        id={current}
        name={current === "amount" ? tr("steps.amount") : tr("steps.details")}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        end={current === "details" ? <SaveBlock /> : <NextButton onClick={next} />}
      >
        {current === "amount" ? <AmountStage /> : <DetailsStage />}
      </StepCard>
    </EntryPage>
  );
}
