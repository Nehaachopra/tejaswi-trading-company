"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { type ContraKind, useContra } from "~/providers/contra";

import { indiaDay } from "../../account/balance";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { type SummaryItem } from "../shared/entry-frame";
import { momentOf } from "../shared/form-basics";

// the cards, in order: the amount with the account it goes into or comes out of, then the reference, the remarks and
// Save
export type ContraStep = "amount" | "details";
const STEPS: ContraStep[] = ["amount", "details"];

// everything the deposit, withdrawal or transfer form holds and works out: what's typed, what the server says, and the
// moves between cards. Made once in ContraEntry; every card reads it with useContraEntry()
export function useContraEntryState({ kind, isAdmin, onDiscard }: { kind: ContraKind; isAdmin: boolean; onDiscard: () => void }) {
  // its own words: a deposit's, a withdrawal's or a transfer's
  const t = useTranslations(`transactions.${kind}` as "transactions.deposit");
  const tr = useTranslations("transactions.receipt");
  const tpf = useTranslations("transactions.payment.form");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const router = useRouter();
  const { banks, sources, loading, loadFailed, retryLoad, saveContra, saving: creating, saved } = useContra();

  // the answers
  const [amount, setAmount] = useState("");
  // the account it goes into (a deposit) or comes out of (a withdrawal, a transfer)
  const [bankId, setBankId] = useState<string | null>(null);
  // a transfer: the account it goes into (never the one it leaves)
  const [toBankId, setToBankId] = useState<string | null>(null);
  useEffect(() => {
    if (toBankId !== null && toBankId === bankId) setToBankId(null);
  }, [bankId, toBankId]);
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());
  // the accounts' list opens by itself once the amount is in (back to 0 once one is picked)
  const [accountsOpen, setAccountsOpen] = useState(0);
  // the amount was cut at what it comes out of holds: the warning under it
  const [capped, setCapped] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Next or Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);
  useEffect(() => setTried(false), [amount, bankId, toBankId]);

  // what's typed, worked out: the cash held today and what each account holds (null for staff), and the account picked
  const value = Number(amount) || 0;
  const cashHeld = sources?.cash ?? null;
  const bank = banks?.find((b) => b.id === bankId);
  const toBank = banks?.find((b) => b.id === toBankId);
  const transfer = kind === "transfer";
  const bankHeld = (id: string) => sources?.banks.find((b) => b.id === id)?.available ?? null;
  // the most it can be: the cash for a deposit; for a withdrawal or transfer what the account it leaves holds (none
  // until it's picked)
  const most = kind === "deposit" ? cashHeld : bankId ? bankHeld(bankId) : null;
  // the account it leaves picked after the amount, holding less: the amount is cut to what it holds, with the warning
  useEffect(() => {
    if (kind === "deposit" || most === null || value <= most) return;
    setAmount(String(most));
    setCapped(most);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the account (and so the most) changes
  }, [bankId, most]);
  const accountName = (id: string | null) => {
    const b = banks?.find((x) => x.id === id);
    return b ? `${bankNameIn(b.bankName, locale)} ••${b.last4}` : null;
  };
  // the day it was made: today to start with; an earlier one for one forgotten (staff a few days back at most)
  const [day, setDay] = useState(() => indiaDay(new Date()));

  // when each card is filled in
  const complete: Record<ContraStep, boolean> = {
    amount: value > 0 && !!bank && (!transfer || !!toBank) && (most === null || value <= most),
    details: day !== "",
  };
  const [at, setAt] = useState<ContraStep>("amount");
  const current = at;
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: ContraStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  // phones: the summary folded into a bar above the card
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the Amount card opens with its field ready to type in
  useEffect(() => {
    if (current === "amount") document.getElementById("amount-field")?.focus({ preventScroll: true });
  }, [current]);

  // the phone's Back goes to the card before
  const remember = useCardHistory<ContraStep>("amount", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: ContraStep) {
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

  const stepName = (s: ContraStep) => t(`steps.${s}`);
  const missingOf = () =>
    t(value === 0 ? "missing.amount" : !bank ? "missing.account" : transfer && !toBank ? ("missing.to" as "missing.account") : "missing.amount");

  // what's answered so far, a line each, for the summary
  const summary: SummaryItem<ContraStep>[] = [
    { key: "amount", step: "amount", heading: t("into"), value: ((n) => (n ? { name: n, amount: rupees(value) } : null))(accountName(bankId)) },
    // a transfer: the account it went into
    ...(transfer ? [{ key: "to", step: "amount" as const, heading: t("toAccount" as "into"), value: ((n: string | null) => (n ? { name: n, amount: rupees(value) } : null))(accountName(toBankId)) }] : []),
    {
      key: "details",
      step: "details",
      heading: stepName("details"),
      value: ((lines) => (lines.length > 0 ? lines : null))([reference.trim(), remarks.trim()].filter((v) => v !== "")),
    },
  ];

  // leaving with something entered asks first (not after a save, which goes on to its own page)
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
      const common = { saveKey, dateTime: momentOf(day), amount: value, referenceNumber: reference.trim() || null, remarks };
      const d = await saveContra(
        transfer ? { ...common, fromBankDetailsId: bankId!, toBankDetailsId: toBankId! } : { ...common, bankDetailsId: bankId! },
      );
      // on to its own page; replace, so going back doesn't land on the filled form
      router.replace(`/transaction/${kind}/${d.transactionId}`);
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
    kind,
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
    toBankId,
    setToBankId,
    toBank,
    transfer,
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
    most,
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

export type ContraEntryState = ReturnType<typeof useContraEntryState>;

const ContraEntryContext = createContext<ContraEntryState | null>(null);
export const ContraEntryProvider = ContraEntryContext.Provider;

export function useContraEntry() {
  const value = useContext(ContraEntryContext);
  if (!value) throw new Error("useContraEntry is used outside ContraEntryProvider");
  return value;
}
