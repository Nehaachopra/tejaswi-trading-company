"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { useDeposit } from "~/providers/deposit";

import { indiaDay } from "../../account/balance";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { type SummaryItem } from "../shared/entry-frame";
import { momentOf } from "../shared/form-basics";

// the cards, in order: the amount with the account it goes into, then the slip's reference, the remarks and Save
export type DepositStep = "amount" | "details";
const STEPS: DepositStep[] = ["amount", "details"];

// everything the deposit form holds and works out: what's typed, what the server says, and the moves between cards.
// Made once in DepositEntry; every card reads it with useDepositEntry()
export function useDepositEntryState({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const t = useTranslations("transactions.deposit");
  const tr = useTranslations("transactions.receipt");
  const tpf = useTranslations("transactions.payment.form");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const router = useRouter();
  const { banks, sources, loading, loadFailed, retryLoad, saveDeposit, saving: creating, saved } = useDeposit();

  // the answers
  const [amount, setAmount] = useState("");
  const [bankId, setBankId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());
  // the accounts' list opens by itself once the amount is in (back to 0 once one is picked)
  const [accountsOpen, setAccountsOpen] = useState(0);
  // the amount was cut at the cash held: the warning under it
  const [capped, setCapped] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Next or Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);
  useEffect(() => setTried(false), [amount, bankId]);

  // what's typed, worked out: the cash held today (null for staff) and the account picked
  const value = Number(amount) || 0;
  const cashHeld = sources?.cash ?? null;
  const bank = banks?.find((b) => b.id === bankId);
  const bankHeld = (id: string) => sources?.banks.find((b) => b.id === id)?.available ?? null;
  const accountName = (id: string | null) => {
    const b = banks?.find((x) => x.id === id);
    return b ? `${bankNameIn(b.bankName, locale)} ••${b.last4}` : null;
  };
  // the day it was made: today to start with; an earlier one for a deposit forgotten (staff a few days back at most)
  const [day, setDay] = useState(() => indiaDay(new Date()));

  // when each card is filled in
  const complete: Record<DepositStep, boolean> = {
    amount: value > 0 && !!bank && (cashHeld === null || value <= cashHeld),
    details: day !== "",
  };
  const [at, setAt] = useState<DepositStep>("amount");
  const current = at;
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: DepositStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  // phones: the summary folded into a bar above the card
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the Amount card opens with its field ready to type in
  useEffect(() => {
    if (current === "amount") document.getElementById("amount-field")?.focus({ preventScroll: true });
  }, [current]);

  // the phone's Back goes to the card before
  const remember = useCardHistory<DepositStep>("amount", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: DepositStep) {
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

  const stepName = (s: DepositStep) => t(`steps.${s}`);
  const missingOf = () => t(value === 0 ? "missing.amount" : !bank ? "missing.account" : "missing.amount");

  // what's answered so far, a line each, for the summary
  const summary: SummaryItem<DepositStep>[] = [
    { key: "amount", step: "amount", heading: t("into"), value: accountName(bankId) },
    {
      key: "details",
      step: "details",
      heading: stepName("details"),
      value: ((lines) => (lines.length > 0 ? lines : null))([reference.trim(), remarks.trim()].filter((v) => v !== "")),
    },
  ];

  // leaving with something entered asks first (not after a save, which goes on to the deposit's page)
  const { dialog: leaveDialog } = useLeaveGuard(!saved && (value > 0 || bankId !== null || remarks !== ""), onDiscard);

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
      const d = await saveDeposit({
        saveKey,
        dateTime: momentOf(day),
        bankDetailsId: bankId!,
        amount: value,
        referenceNumber: reference.trim() || null,
        remarks,
      });
      // on to the deposit's own page; replace, so going back doesn't land on the filled form
      router.replace(`/transaction/deposit/${d.transactionId}`);
    } catch (err) {
      setSaving(false);
      const code = (err as { data?: { code?: string } })?.data?.code;
      setSaveError(
        code === undefined
          ? tc("saveErrors.network")
          : code === "TOO_MANY_REQUESTS"
            ? tc("saveErrors.busy")
            : code === "PRECONDITION_FAILED"
              ? t("errors.cash")
              : code === "BAD_REQUEST"
                ? tc("saveErrors.check")
                : t("errors.failed"),
      );
    }
  }

  return {
    isAdmin,
    t,
    tr,
    tpf,
    tc,
    locale,
    loading,
    loadFailed,
    retryLoad,
    banks,
    creating,
    amount,
    setAmount,
    bankId,
    setBankId,
    reference,
    setReference,
    remarks,
    setRemarks,
    accountsOpen,
    setAccountsOpen,
    capped,
    setCapped,
    capText: capped === null ? null : t("capOnly", { amount: rupees(capped) }),
    saveError,
    tried,
    value,
    cashHeld,
    bank,
    bankHeld,
    day,
    setDay,
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

export type DepositEntryState = ReturnType<typeof useDepositEntryState>;

const DepositEntryContext = createContext<DepositEntryState | null>(null);
export const DepositEntryProvider = DepositEntryContext.Provider;

export function useDepositEntry() {
  const value = useContext(DepositEntryContext);
  if (!value) throw new Error("useDepositEntry is used outside DepositEntryProvider");
  return value;
}
