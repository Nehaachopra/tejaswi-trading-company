"use client";

import { useTranslations } from "next-intl";
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
} from "../../shared/entry-frame";
import { DetailsCard, SaveBlock } from "./details-card";
import { AmountCard, ForCard, PayCard } from "./pay-card";
import {
  type SalaryStart,
  type SalaryStep,
  SalaryEntryProvider,
  useSalaryEntry,
  useSalaryEntryState,
} from "./state";

// the salary flow, the admin's, opened from Payment's Paid for on the payment page: paying an employee, laid out like a receipt: one card at a time with Back and Next,
// and a summary that goes back to any card. 1 the employee, a month's salary (one still owed) or an advance, the amount
// and where it's paid from (cash or one bank account); 2 the reference and the remarks, the day and Save. A save goes to
// its own page. Months are posted by the app on each pay day. Discarding to open a menu starts the form again
// (opened from a payment's Paid for: `onBackToPayment` takes it back there, in place of its own For card; discarding
// goes back there too)
export function SalaryForm({ start, onBackToPayment }: { start?: SalaryStart; onBackToPayment?: () => void }) {
  const [round, setRound] = useState(0);
  return (
    <SalaryProvider>
      {/* a form started again (after discarding) starts empty */}
      <SalaryEntry
        key={round}
        start={round === 0 ? start : undefined}
        onDiscard={onBackToPayment ?? (() => setRound((r) => r + 1))}
        onBackToPayment={onBackToPayment}
      />
    </SalaryProvider>
  );
}

function SalaryEntry({ start, onDiscard, onBackToPayment }: { start?: SalaryStart; onDiscard: () => void; onBackToPayment?: () => void }) {
  const state = useSalaryEntryState({ start, onDiscard, onBackToPayment });
  return (
    <SalaryEntryProvider value={state}>
      <SalaryEntryView />
    </SalaryEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary (an edit, from History, under
// its own title)
export function SalaryEntryView({ title }: { title?: string }) {
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
    kind,
    summary,
    leaveDialog,
    show,
    next,
    saved,
  } = useSalaryEntry();
  // a salary is paid from Payment: its title and type are Payment's
  const tpay = useTranslations("transactions.payment.chat");
  const heading = title ?? tpay("title");

  // saved: only Saving… while its page opens (the employees asked again would otherwise redraw the form under it)
  if (saved)
    return (
      <EntryNote title={heading} loading>
        {t("saving")}
      </EntryNote>
    );

  if (loading)
    return (
      <EntryNote title={heading} loading>
        {tc("looking")}
      </EntryNote>
    );
  if (loadFailed)
    return (
      <EntryNote title={heading} failed onRetry={retryLoad}>
        {t("loadFailed")}
      </EntryNote>
    );

  const lines = (
    <SummaryLines<SalaryStep>
      // it's a payment: Payment, as the payment form's (its Paid for line says Salary or Advance to employee)
      type={tpay("title")}
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
      title={heading}
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
        hideName={current === "amount" && kind === "salary"}
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
