"use client";

import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { DateInput } from "~/components/ui/date-input";
import { rupees } from "~/lib/format";
import { ReceiptProvider } from "~/providers/receipt";

import { emptyDraft as emptyParty } from "../../account/party/party-fields";
import { emptyLender } from "../loans/lender-fields";
import { LoanTerms } from "../loans/loan-terms";
import {
  EntryNote,
  EntryPage,
  NextButton,
  StepCard,
  SummaryBar,
  SummaryCard,
  SummaryLines,
} from "../shared/entry-frame";
import { AmountCard } from "./amount-card";
import { DetailsCard, SaveBlock } from "./details-card";
import { FromPicker, LoanCards, LoanTakenFrom } from "./received-from";
import { chip, input, KINDS, type Step } from "./shared";
import { ReceiptEntryProvider, useReceiptEntry, useReceiptEntryState } from "./state";

// /transaction/receipt: money coming in, one card at a time with Back and Next (Next only once the card is filled in),
// and a summary of the answers that goes back to any card: 1 what it was received for; 2 who it came from (a party
// found or added, a lender, the open loan, a ledger); 3 a loan's terms; 4 the amount with any TDS they deducted, and
// where it came into (cash, a bank account or both, split over accounts, each with how it came in); 5 each reference
// and the remarks, then the day and Save last. A save goes to the receipt's own page. Discarding to open a menu starts
// the form again
export function ReceiptForm({ isAdmin }: { isAdmin: boolean }) {
  const [round, setRound] = useState(0);
  return (
    <ReceiptProvider>
      <ReceiptEntry key={round} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />
    </ReceiptProvider>
  );
}

function ReceiptEntry({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const state = useReceiptEntryState({ isAdmin, onDiscard });
  return (
    <ReceiptEntryProvider value={state}>
      <ReceiptEntryView />
    </ReceiptEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function ReceiptEntryView() {
  const {
    t,
    tr,
    tc,
    tpf,
    sameName,
    loading,
    loadFailed,
    retryLoad,
    kind,
    tried,
    total,
    complete,
    steps,
    current,
    index,
    reachable,
    summaryOpen,
    setSummaryOpen,
    stepName,
    missingOf,
    changeOf,
    summary,
    leaveDialog,
    show,
    next,
    addingOldLoan,
    advance,
    askingAdvance,
  } = useReceiptEntry();

  // the bank accounts and balances first, so where it came into shows what each holds from the start
  if (loading)
    return (
      <EntryNote title={tr("title")} loading>
        {tc("looking")}
      </EntryNote>
    );
  // they couldn't be had, even after the retries: say so, and Try again
  if (loadFailed)
    return (
      <EntryNote title={tr("title")} failed onRetry={retryLoad}>
        {t("loadFailed")}
      </EntryNote>
    );

  const lines = (
    <SummaryLines
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
      title={tr("title")}
      summaryLabel={tpf("summary")}
      showBar={kind !== null}
      bar={
        <SummaryBar
          label={tpf("summary")}
          total={total}
          open={summaryOpen}
          onToggle={() => setSummaryOpen((o) => !o)}
        >
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
      {sameName.dialog}
      {/* an advance in the amount: asked before going on */}
      <ConfirmDialog
        open={askingAdvance !== null}
        tone="plain"
        title={t("advanceAsk.title")}
        body={t("advanceAsk.body", { amount: rupees(advance) })}
        confirmLabel={t("advanceAsk.yes")}
        cancelLabel={t("advanceAsk.no")}
        busy={false}
        onConfirm={() => askingAdvance?.(true)}
        onCancel={() => askingAdvance?.(false)}
      />
      <StepCard
        key={current}
        id={current}
        name={stepName(current)}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={changeOf(current)}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // the last card saves; Received for moves on by itself when a chip is picked, and an old loan being added has
        // its own Add instead
        end={
          current === "details" ? (
            <SaveBlock />
          ) : current === "kind" || (current === "from" && addingOldLoan) ? null : (
            <NextButton onClick={() => void next()} />
          )
        }
      >
        <CardBody step={current} />
      </StepCard>
    </EntryPage>
  );
}

// what a card holds
function CardBody({ step }: { step: Step }) {
  const { loanOf, kind } = useReceiptEntry();
  switch (step) {
    case "kind":
      return <KindChips />;
    // who it came from: the open loan, a lender, or a party or ledger found (or added)
    case "from":
      return loanOf ? <LoanCards /> : kind === "loanTaken" ? <LoanTakenFrom /> : <FromPicker />;
    case "terms":
      return <TermsCard />;
    // how much, any TDS they deducted, and where it came into
    case "amount":
    case "into":
      return <AmountCard />;
    // each reference and the remarks
    case "details":
      return <DetailsCard />;
  }
}

// what it was received for; a change asks who it came from (and what follows) again
function KindChips() {
  const {
    t,
    tk,
    kind,
    setKind,
    setFrom,
    setNewParty,
    setLender,
    setBankLender,
    setLoan,
    setLoanSearch,
    setAddingOldLoan,
    setAmount,
    filledFor,
    autoFilled,
    show,
  } = useReceiptEntry();
  return (
    <div
      role="radiogroup"
      aria-label={t("steps.kind")}
      className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
    >
      {KINDS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={kind === k}
          onClick={() => {
            // the same one again: on to the next card with everything kept
            if (k === kind) return show("from");
            setKind(k);
            setFrom(null);
            setNewParty(emptyParty());
            setLender(null);
            setBankLender(emptyLender());
            setLoan(null);
            setLoanSearch("");
            setAddingOldLoan(false);
            // another kind starts with no amount (a pick fills it in again)
            setAmount("");
            filledFor.current = null;
            autoFilled.current = false;
            show("from");
          }}
          className={chip(kind === k)}
        >
          {tk(k)}
        </button>
      ))}
    </div>
  );
}

// a loan we took: its interest, how often it's paid, and when it's due back (if ever)
function TermsCard() {
  const { tc, terms, setTerms, dueOn, setDueOn, day, tried } = useReceiptEntry();
  return (
    <>
      <LoanTerms
        draft={terms}
        onChange={(patch) => setTerms((d) => ({ ...d, ...patch }))}
        tried={tried}
      />
      <label className="flex flex-col gap-2.5 text-xs font-semibold sm:w-72">
        {tc("q.dueOn")}
        <DateInput
          value={dueOn}
          min={day}
          onChange={setDueOn}
          calendarLabel={tc("q.dueOn")}
          className={input(dueOn !== "" && dueOn < day)}
        />
      </label>
    </>
  );
}
