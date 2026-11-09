"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";

import { titleCase } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { useOther } from "~/providers/other";

import { indiaDay } from "../../account/balance";
import { useLedgerName } from "../../account/ledger-name";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { type SummaryItem } from "../shared/entry-frame";
import { momentOf } from "../shared/form-basics";

// a ledger made with the entry: the name typed, and the head picked for it (none yet until a chip is tapped)
export type NewLedger = { name: string; head: "asset" | "liability" | "income" | "expense" | "profit" | "loss" | null };

// the cards, in order: the amount with the ledger debited and the one credited, then why, the day and Save
export type OtherStep = "entry" | "details";
const STEPS: OtherStep[] = ["entry", "details"];

// everything the Others form holds and works out: what's typed, what the server says, and the moves between cards.
// Made once in OtherEntry; every card reads it with useOtherEntry()
export function useOtherEntryState({ onDiscard }: { onDiscard: () => void }) {
  const t = useTranslations("transactions.other");
  const tc = useTranslations("transactions.chat");
  const tpf = useTranslations("transactions.payment.form");
  const nameOf = useLedgerName();
  const router = useRouter();
  const { ledgers, loading, loadFailed, retryLoad, saveOther, saving: creating, saved } = useOther();

  // the answers
  const [amount, setAmount] = useState("");
  // each side: a ledger picked, or a new one typed in the search (with its head)
  const [debitId, setDebitId] = useState<string | null>(null);
  const [creditId, setCreditId] = useState<string | null>(null);
  const [newDebit, setNewDebit] = useState<NewLedger | null>(null);
  const [newCredit, setNewCredit] = useState<NewLedger | null>(null);
  const [remarks, setRemarks] = useState("");
  // the day it's for: today to start with (the admin may go back as far as needed)
  const [day, setDay] = useState(() => indiaDay(new Date()));
  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saveError, setSaveError] = useState<string | null>(null);
  // Next or Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);
  useEffect(() => setTried(false), [amount, debitId, creditId, newDebit, newCredit]);
  // the debit picked as the credit: the credit starts again (never the same ledger on both sides)
  useEffect(() => {
    if (creditId !== null && creditId === debitId) setCreditId(null);
  }, [debitId, creditId]);

  // what's typed, worked out
  const value = Number(amount) || 0;
  const debit = ledgers?.find((l) => l.id === debitId);
  const credit = ledgers?.find((l) => l.id === creditId);
  // a side is done with a ledger picked, or a new one with its head
  const debitDone = !!debit || (!!newDebit?.head && newDebit.name.trim() !== "");
  const creditDone = !!credit || (!!newCredit?.head && newCredit.name.trim() !== "");
  // what a side reads as in the summary
  const sideName = (picked: typeof debit, made: NewLedger | null) => (picked ? nameOf(picked) : made?.name.trim() ? titleCase(made.name.trim()) : null);

  // when each card is filled in
  const complete: Record<OtherStep, boolean> = {
    entry: value > 0 && debitDone && creditDone,
    details: remarks.trim() !== "" && day !== "",
  };
  const [at, setAt] = useState<OtherStep>("entry");
  const current = at;
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: OtherStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  // phones: the summary folded into a bar above the card
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the Entry card opens with its amount ready to type in
  useEffect(() => {
    if (current === "entry") document.getElementById("amount-field")?.focus({ preventScroll: true });
  }, [current]);

  // the phone's Back goes to the card before
  const remember = useCardHistory<OtherStep>("entry", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: OtherStep) {
    moveCard(
      () => {
        setTried(false);
        setAt(step);
      },
      STEPS.indexOf(step) < index,
    );
    remember(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // something missing: show it in red and put the cursor on its first field
  function guide() {
    setTried(true);
    setTimeout(() => document.querySelector<HTMLElement>('main section [aria-invalid="true"]')?.focus(), 50);
  }
  function next() {
    if (!complete[current]) return guide();
    show(STEPS[index + 1]!);
  }

  const stepName = (s: OtherStep) => t(`steps.${s}`);
  const missingOf = (s: OtherStep) =>
    s === "details"
      ? t("missing.remarks")
      : t(
          value === 0
            ? "missing.amount"
            : !debitDone
              ? newDebit
                ? newDebit.name.trim() === "" ? "missing.name" : "missing.head"
                : "missing.debit"
              : newCredit && !creditDone
                ? newCredit.name.trim() === "" ? "missing.name" : "missing.head"
                : "missing.credit",
        );

  // what's answered so far, a line each, for the summary
  const summary: SummaryItem<OtherStep>[] = [
    { key: "debit", step: "entry", heading: t("debit"), value: sideName(debit, newDebit) },
    { key: "credit", step: "entry", heading: t("credit"), value: sideName(credit, newCredit) },
    { key: "details", step: "details", heading: stepName("details"), value: remarks.trim() || null },
  ];

  // leaving with something entered asks first (not after a save, which goes on to its own page)
  const { dialog: leaveDialog } = useLeaveGuard(!saved && (value > 0 || debitId !== null || newDebit !== null || remarks !== ""), onDiscard);

  // Save tapped and still working: the button says so and can't be tapped again
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!ready) {
      setAt(STEPS[firstOpen]!);
      return guide();
    }
    setSaving(true);
    setSaveError(null);
    try {
      const o = await saveOther({
        saveKey,
        dateTime: momentOf(day),
        debitLedgerId: newDebit ? null : debitId,
        newDebitLedger: newDebit ? { name: newDebit.name.trim(), head: newDebit.head! } : null,
        creditLedgerId: newCredit ? null : creditId,
        newCreditLedger: newCredit ? { name: newCredit.name.trim(), head: newCredit.head! } : null,
        amount: value,
        remarks,
      });
      // on to its own page; replace, so going back doesn't land on the filled form
      router.replace(`/transaction/other/${o.transactionId}`);
    } catch (err) {
      setSaving(false);
      const code = (err as { data?: { code?: string } })?.data?.code;
      setSaveError(
        code === undefined
          ? tc("saveErrors.network")
          : code === "TOO_MANY_REQUESTS"
            ? tc("saveErrors.busy")
            : code === "CONFLICT"
              ? t("errors.taken")
              : code === "BAD_REQUEST" || code === "PRECONDITION_FAILED"
                ? tc("saveErrors.check")
              : t("errors.failed"),
      );
    }
  }

  return {
    t,
    tc,
    tpf,
    nameOf,
    loading,
    loadFailed,
    retryLoad,
    ledgers,
    creating,
    amount,
    setAmount,
    debitId,
    setDebitId,
    creditId,
    setCreditId,
    newDebit,
    setNewDebit,
    newCredit,
    setNewCredit,
    remarks,
    setRemarks,
    day,
    setDay,
    saveError,
    tried,
    value,
    debit,
    credit,
    debitDone,
    complete,
    steps: STEPS,
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
    saving,
    save,
  };
}

export type OtherEntryState = ReturnType<typeof useOtherEntryState>;

const OtherEntryContext = createContext<OtherEntryState | null>(null);
export const OtherEntryProvider = OtherEntryContext.Provider;

export function useOtherEntry() {
  const value = useContext(OtherEntryContext);
  if (!value) throw new Error("useOtherEntry is used outside OtherEntryProvider");
  return value;
}
