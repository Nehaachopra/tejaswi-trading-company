"use client";

import { useState } from "react";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { DateInput } from "~/components/ui/date-input";
import { rupees } from "~/lib/format";
import { PaymentProvider } from "~/providers/payment";
import {
  draftUntouched as untouched,
  emptyDraft as emptyParty,
} from "../../account/party/party-fields";
import { LoanTerms } from "../loans/loan-terms";
import { OldLoanTerms } from "../loans/old-loan-form";
import {
  EntryNote,
  EntryPage,
  NextButton,
  StepCard,
  type SummaryItem,
  SummaryBar,
  SummaryCard,
  SummaryLines,
} from "../shared/entry-frame";
import { type Step, KINDS, input, chip } from "./shared";
import { fieldRow } from "../shared/form-basics";
import { cn } from "~/lib/utils";
import { PaymentEntryProvider, usePaymentEntry, usePaymentEntryState } from "./state";
import { AmountCard } from "./amount-card";
import { SalaryHeads } from "./salary-heads";
import { SaveBlock, DetailsCard } from "./details-card";
import { GstCard } from "./gst-card";
import { LoanCards, ToPicker, PayeePicker } from "./paid-to";

// /transaction/payment: money paid out, as cards that appear one by one: each shows once the one above it is filled
// in, and every card stays open to change. 1 Paid from: cash or a bank account (only those holding money, for the
// admin who sees balances) and the amount, never more than it holds; 2 Paid for; 3 Paid to (a party found or added,
// the open loan, an expense head or tax, on its own card); 4 TDS (a supplier); 5 a loan given's terms; 6 each bank
// account's reference and the remarks, then the day and Save last. A save goes to the payment's own page. Discarding to open a menu starts the form again
export function PaymentForm({ isAdmin }: { isAdmin: boolean }) {
  const [round, setRound] = useState(0);
  return (
    <PaymentProvider>
      <PaymentEntry key={round} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />
    </PaymentProvider>
  );
}

function PaymentEntry({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const state = usePaymentEntryState({ isAdmin, onDiscard });
  return (
    <PaymentEntryProvider value={state}>
      <PaymentEntryView />
    </PaymentEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary. An edit (History) shows it
// under its own title
export function PaymentEntryView({ title }: { title?: string }) {
  const {
    t,
    tc,
    tp,
    tk,
    sameName,
    banks,
    sources,
    loading,
    loadFailed,
    retryLoad,
    into,
    setAmount,
    kind,
    setKind,
    to,
    setTo,
    newParty,
    setNewParty,
    setNewHeadTds,
    payee,
    setPayee,
    newPayee,
    setNewPayee,
    setPayeeSkipped,
    setLandlordId,
    setGstMode,
    setLoan,
    terms,
    setTerms,
    dueOn,
    setDueOn,
    day,
    tried,
    value,
    canCash,
    canBank,
    loanOf,
    addingOldLoan,
    oldLoan,
    setAddingOldLoan,
    setLoanSearch,
    total,
    setTotalGoal,
    filledFor,
    complete,
    steps,
    current,
    index,
    reachable,
    summaryOpen,
    setSummaryOpen,
    stepName,
    changeOf,
    summary,
    leaveDialog,
    show,
    next,
    advance,
    askingAdvance,
    gridShort,
    showPan,
    editing,
  } = usePaymentEntry();
  const heading = title ?? tp("title");
  // the balances first, so cash and bank show what they hold from the start
  if (loading)
    return (
      <EntryNote title={heading} loading>
        {tc("looking")}
      </EntryNote>
    );
  // cash and the banks couldn't be had, even after the retries: say so, and Try again
  if (loadFailed)
    return (
      <EntryNote title={heading} failed onRetry={retryLoad}>
        {t("loadFailed")}
      </EntryNote>
    );
  // nothing to pay from (the admin sees cash and every bank at ₹0)
  if (sources && banks && !canCash && !canBank)
    return <EntryNote title={heading}>{t("nothingToPay")}</EntryNote>;

  // a line for each card answered; Paid from goes back to the Amount card it's in
  const items: SummaryItem<Step>[] = summary
    // (an edit's Paid for, and who was paid, stay as saved: shown, not gone back to)
    .filter((l) => l.step === "source" || steps.includes(l.step) || (editing && (l.step === "kind" || l.step === "payee")))
    .map((l) => ({
      key: l.heading ?? l.step,
      step: l.step === "source" ? "amount" : l.step,
      heading: l.heading ?? stepName(l.step),
      value: l.value,
    }));
  const lines = (
    <SummaryLines
      type={heading}
      items={items}
      current={current}
      reachable={reachable}
      onPick={(s) => {
        setSummaryOpen(false);
        show(s);
      }}
    />
  );
  // the card on its own, with Back and Next; beside it on a wide screen the summary of what's filled in, and above it
  // on a phone the same summary folded into a bar
  return (
    <EntryPage
      title={heading}
      summaryLabel={t("summary")}
      showBar={kind !== null}
      bar={
        <SummaryBar
          label={t("summary")}
          total={total}
          open={summaryOpen}
          onToggle={() => setSummaryOpen((o) => !o)}
        >
          {lines}
        </SummaryBar>
      }
      summary={
        <SummaryCard label={t("summary")} total={total}>
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
        // the Amount card with a PAN to give names its own parts: PAN on top, then Amount
        hideName={current === "amount" && showPan}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={changeOf(current)}
        // the amount card names only what's missing: the amount, where it's paid from, or else what's red
        missing={
          tried && !complete[current]
            ? current === "amount"
              ? value === 0
                ? t("missing.amountEmpty")
                : into === null
                  ? t("missing.source")
                  : // the accounts come to less than the amount: how much is still to be put on them
                    gridShort > 0
                    ? t("missing.short", { amount: rupees(gridShort) })
                    : t("missing.details")
              : t(`missing.${current}`)
            : null
        }
        // the last card saves. Paid for moves on by itself when a chip is picked (an expense or a tax asks its head on
        // the next card), and an old loan being added has its own Add instead
        end={
          current === "details" ? (
            <SaveBlock />
          ) : current === "kind" ? null : (
            <NextButton onClick={() => void next()} />
          )
        }
      >
        {body(current)}
      </StepCard>
    </EntryPage>
  );

  // what a card holds
  function body(s: Step) {
    switch (s) {
      // how much: the amount within this payment's limit, the buttons that fill it in, and where it's paid from
      case "amount":
        return <AmountCard />;

      // what it was paid for; a change asks who it went to (and what follows) again
      case "kind":
        return (
          <>
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
                    // the same one again: on to the next card with everything kept, except a new party, new
                    // ledger or old loan left empty, which goes back to the search (an old loan's form only
                    // lives while its card is open, so it's empty by now)
                    if (k === kind) {
                      if (to?.kind === "party" && untouched(newParty)) setTo(null);
                      if (to?.kind === "new" && to.name.trim() === "") setTo(null);
                      if (payee?.kind === "party" && untouched(newPayee)) setPayee(null);
                      if (payee?.kind === "new" && payee.name.trim() === "") setPayee(null);
                      setAddingOldLoan(false);
                      return show("to");
                    }
                    setGstMode("none");
                    setPayeeSkipped(false);
                    setKind(k);
                    setAddingOldLoan(false);
                    setLoanSearch("");
                    // another kind starts with no amount (a pick fills it in again)
                    setTotalGoal(null);
                    setAmount("");
                    filledFor.current = null;
                    setTo(null);
                    setLoan(null);
                    setNewParty(emptyParty());
                    setNewHeadTds(null);
                    setPayee(null);
                    setLandlordId(null);
                    setNewPayee(emptyParty());
                    show("to");
                  }}
                  className={chip(kind === k)}
                >
                  {tk(k)}
                </button>
              ))}
              {/* salary and an employee's advance: handed over to the salary form */}
              <SalaryHeads />
            </div>
          </>
        );

      // who it went to: the open loan, or a party or ledger found (or added)
      case "to":
        return <>{loanOf ? <LoanCards /> : <ToPicker />}</>;

      // an expense to a head with TDS: who was paid, a party found or added
      case "payee":
        return <PayeePicker />;

      // whether the bill carries GST
      case "gst":
        return <GstCard />;

      // a loan given: its interest, how often it's paid, and when it's due back (if ever)
      case "terms":
        // an old loan being added: its amount, date and terms
        if (loanOf && addingOldLoan) return <OldLoanTerms loan={oldLoan} tried={tried} />;
        return (
          <>
            <LoanTerms
              draft={terms}
              onChange={(patch) => setTerms((d) => ({ ...d, ...patch }))}
              tried={tried}
            />
            {/* when it's due back, a row in the left column as the rate's */}
            <div className="mt-4 grid gap-x-6 sm:grid-cols-2">
              <label className={fieldRow}>
                <span>{tc("q.dueOn")}</span>
                <DateInput
                  value={dueOn}
                  min={day}
                  onChange={setDueOn}
                  calendarLabel={tc("q.dueOn")}
                  aria-invalid={(dueOn !== "" && dueOn < day) || undefined}
                  placeholder="—"
                  className={cn(input(dueOn !== "" && dueOn < day), "text-sm font-medium")}
                />
              </label>
            </div>
          </>
        );

      // each bank account's reference and the remarks
      case "details":
        return <DetailsCard />;
    }
  }
}
