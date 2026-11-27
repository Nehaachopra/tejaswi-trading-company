"use client";

import type { BankMode, RouterInputs } from "@repo/trpc/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { parseAmount } from "~/lib/price";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import type { MoneySources, ReceiptForEdit } from "~/providers/receipt-edit";

import { indiaDay } from "../../../account/balance";
import { refOkFor } from "../../../transaction/shared/bank-mode";
import { moveCard, useCardHistory } from "../../../transaction/shared/card-steps";
import { momentOf } from "../../../transaction/shared/form-basics";
import type { Refs } from "../../../transaction/shared/account-cards/types";
import type { GridPlace } from "../../../transaction/shared/split-grid";
import { tdsOn } from "../../../transaction/receipt/shared";

// the stages, in order: the amount with any TDS and where it came into; then the day, the cash part's reference, the
// remarks and Save
export type EditStep = "amount" | "details";
const STEPS: EditStep[] = ["amount", "details"];

const round2 = (n: number) => Math.round(n * 100) / 100;

type EditReceiptIn = RouterInputs["transactions"]["receipt"]["edit"];

// what the edit form reads before it opens: the receipt as saved, cash and the bank accounts, and the save
export type ReceiptEditInput = {
  receipt: ReceiptForEdit;
  sources: MoneySources;
  saveEdit: (input: EditReceiptIn) => Promise<{ transactionId: string }>;
  saving: boolean;
  saved: boolean;
  onDiscard: () => void;
};

// everything an edit holds and works out. Made once in the form; every stage reads it with useReceiptEdit()
export function useReceiptEditState({ receipt: r, sources, saveEdit, saving: editSaving, saved, onDiscard }: ReceiptEditInput) {
  const t = useTranslations("history.receipt");
  const te = useTranslations("history.receipt.edit");
  const tk = useTranslations("transactions.receipt.kinds");
  const tr = useTranslations("transactions.receipt.form");
  const tc = useTranslations("transactions.chat");
  const tpf = useTranslations("transactions.payment.form");
  const locale = useLocale();
  const router = useRouter();

  // the amount, as saved until typed
  const [amountText, setAmountText] = useState(String(r.amount));
  const amount = parseAmount(amountText) ?? 0;
  const tooLow = r.minAmount !== null && amount > 0 && amount < r.minAmount;
  const tooHigh = r.maxAmount !== null && amount > r.maxAmount;
  // TDS they deducted, at the law's rate (only where it can be)
  const [tdsOnIt, setTdsOnIt] = useState(r.tdsDeducted);
  const tds = r.tdsRate !== null && tdsOnIt && amount > 0 ? tdsOn(amount, r.tdsRate) : 0;

  // where it came into: a card for cash (not a bank's loan) and each bank account, filled from the receipt as saved
  const savedParts: { id: string; amount: number; mode: BankMode | null; ref: string | null }[] = [
    ...(r.cashAmount > 0 ? [{ id: "cash", amount: r.cashAmount, mode: null, ref: null }] : []),
    ...(r.bankDetailsId ? [{ id: r.bankDetailsId, amount: r.bankAmount, mode: r.bankMode, ref: r.referenceNumber }] : []),
    ...r.moreBankParts.map((m) => ({ id: m.bankDetailsId, amount: m.amount, mode: m.mode, ref: m.referenceNumber })),
  ];
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(savedParts.map((p) => [p.id, String(p.amount)])));
  const [modes, setModes] = useState<Record<string, BankMode | null>>(() => Object.fromEntries(savedParts.filter((p) => p.mode).map((p) => [p.id, p.mode])));
  const [refs, setRefs] = useState<Refs>(() => Object.fromEntries(savedParts.filter((p) => p.mode && p.ref).map((p) => [p.id, { mode: p.mode!, text: p.ref! }])));
  const [refLeft, setRefLeft] = useState<string[]>([]);
  const ids = [...(r.bankOnly ? [] : ["cash"]), ...sources.banks.map((b) => b.id)];
  const places: GridPlace[] = ids.map((id) => {
    const b = sources.banks.find((x) => x.id === id);
    return {
      id,
      name: id === "cash" ? tc("cash") : b ? bankNameIn(b.bankName, locale) : "",
      sub: id === "cash" ? null : `••${b?.last4 ?? ""}`,
      held: null,
      text: texts[id] ?? "",
      amount: parseAmount(texts[id] ?? "") ?? 0,
      mode: id === "cash" ? null : (modes[id] ?? null),
    };
  });
  const placed = round2(places.reduce((a, p) => a + p.amount, 0));
  const cashPart = places.find((p) => p.id === "cash")?.amount ?? 0;
  const banksUsed = places.filter((p) => p.id !== "cash" && p.amount > 0);
  const refOf = (id: string, m: BankMode | null) => (m && refs[id]?.mode === m ? refs[id]!.text : "");
  // the amount typed: one place holding the whole of it keeps holding the whole (as a single place does on a new
  // receipt); split over several, the cards stay as typed and Left to receive says what's off
  function typeAmount(text: string) {
    const used = places.filter((p) => p.amount > 0);
    if (used.length === 1 && used[0]!.amount === amount) setTexts({ [used[0]!.id]: text });
    setAmountText(text);
  }

  // money already spent: a place the receipt came into that's short without it keeps at least that much
  const floorOf = (id: string) => {
    const without = id === "cash" ? (r.cashAmount > 0 ? r.heldWithout.cash : 0) : (r.heldWithout.banks.find((b) => b.bankDetailsId === id)?.amount ?? 0);
    return without < 0 ? -without : 0;
  };
  const short = places.filter((p) => p.amount < floorOf(p.id)).map((p) => ({ place: p, least: floorOf(p.id) }));

  // the cash part's bill or voucher number, the day (within its month, never after today) and the remarks
  const [cashRef, setCashRef] = useState(r.cashReferenceNumber ?? "");
  const savedDay = indiaDay(new Date(r.dateTime));
  const [day, setDay] = useState(savedDay);
  const [remarks, setRemarks] = useState(r.remarks ?? "");
  const today = indiaDay(new Date());
  const month = savedDay.slice(0, 7);
  const monthEnd = indiaDay(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12)));
  const dayMin = `${month}-01`;
  const dayMax = monthEnd < today ? monthEnd : today;

  // when each stage is filled in; Next or Save tapped with something missing shows it in red
  const [tried, setTried] = useState(false);
  const intoOk = placed === amount && banksUsed.every((p) => p.mode !== null && refOkFor(p.mode, refOf(p.id, p.mode))) && short.length === 0;
  const complete: Record<EditStep, boolean> = {
    amount: amount > 0 && !tooLow && !tooHigh && intoOk,
    details: day !== "",
  };
  const missingOf = (s: EditStep) =>
    s === "amount"
      ? amount === 0
        ? te("missing.amount")
        : tooLow || tooHigh
          ? te("missing.limit")
          : placed !== amount
            ? te("missing.left", { amount: rupees(Math.abs(round2(amount - placed))) })
            : short.length > 0
              ? te("missing.spent")
              : te("missing.into")
      : te("missing.date");

  // moving between stages: the phone's Back goes to the stage before
  const [at, setAt] = useState<EditStep>("amount");
  const current = at;
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: EditStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const remember = useCardHistory<EditStep>("amount", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: EditStep) {
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

  // what's saved: cash, the first account and the others, each with how it came in and its reference
  const settledIn = cashPart > 0 && banksUsed.length > 0 ? "cashAndBank" : banksUsed.length > 0 ? "bank" : "cash";
  const [first, ...more] = banksUsed;
  const input = {
    transactionId: r.transactionId,
    dateTime: momentOf(day),
    amount,
    settledIn,
    cashAmount: settledIn === "cashAndBank" ? cashPart : null,
    bankDetailsId: first?.id ?? null,
    bankMode: first?.mode ?? null,
    referenceNumber: first ? refOf(first.id, first.mode).trim() || null : null,
    cashReferenceNumber: settledIn === "bank" ? null : cashRef.trim() || null,
    moreBankParts: more.map((p) => ({ bankDetailsId: p.id, amount: p.amount, mode: p.mode!, referenceNumber: refOf(p.id, p.mode).trim() || null })),
    tdsDeducted: tds > 0,
    remarks: remarks.trim() || null,
  } satisfies Omit<EditReceiptIn, "saveKey">;

  // leaving with a change made asks first (not after the save, which goes on to its success card)
  const savedInput = {
    amount: r.amount,
    parts: savedParts.map((p) => [p.id, p.amount, p.mode, p.ref ?? ""]),
    tds: r.tdsDeducted,
    cashRef: r.cashReferenceNumber ?? "",
    day: savedDay,
    remarks: r.remarks ?? "",
  };
  const nowInput = {
    amount,
    parts: places.filter((p) => p.amount > 0).map((p) => [p.id, p.amount, p.mode, refOf(p.id, p.mode)]),
    tds: tds > 0,
    cashRef: settledIn === "bank" ? (r.cashReferenceNumber ?? "") : cashRef.trim(),
    day,
    remarks: remarks.trim(),
  };
  const changed = JSON.stringify(savedInput) !== JSON.stringify(nowInput);
  const { dialog: leaveDialog } = useLeaveGuard(!saved && changed, onDiscard);

  const [saveKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // the server's own words only where they say what to fix; anything else a plain message
  function saveErrorOf(err: unknown) {
    const e = err as { data?: { code?: string }; message?: string };
    const code = e?.data?.code;
    return code === undefined
      ? te("errors.network")
      : code === "TOO_MANY_REQUESTS"
        ? te("errors.busy")
        : (code === "BAD_REQUEST" || code === "CONFLICT" || code === "PRECONDITION_FAILED") && e.message
          ? e.message
          : te("errors.failed");
  }
  async function save() {
    // nothing changed: nothing saved, no edit recorded; straight back to the receipt
    if (!changed) {
      router.replace(`/history/${r.transactionId}`);
      return;
    }
    if (!ready) {
      setAt(STEPS[firstOpen]!);
      return guide();
    }
    setSaving(true);
    setSaveError(null);
    try {
      const done = await saveEdit({ ...input, saveKey });
      // on to its success card; replace, so going back doesn't land on the form
      router.replace(`/history/${done.transactionId}/edit/done`);
    } catch (err) {
      setSaving(false);
      setSaveError(saveErrorOf(err));
    }
  }

  return {
    t,
    te,
    tk,
    tr,
    tc,
    tpf,
    locale,
    receipt: r,
    amountText,
    amount,
    typeAmount,
    tooLow,
    tooHigh,
    tdsOnIt,
    setTdsOnIt,
    tds,
    places,
    placed,
    setText: (id: string, text: string) => setTexts((all) => ({ ...all, [id]: text })),
    setMode: (id: string, mode: BankMode | null) => setModes((all) => ({ ...all, [id]: mode })),
    refs,
    setRefs,
    refLeft,
    setRefLeft,
    short,
    usesCash: cashPart > 0,
    cashRef,
    setCashRef,
    day,
    setDay,
    dayMin,
    dayMax,
    remarks,
    setRemarks,
    tried,
    complete,
    steps: STEPS,
    current,
    index,
    reachable,
    summaryOpen,
    setSummaryOpen,
    missingOf,
    show,
    next,
    leaveDialog,
    save,
    saving: saving || editSaving,
    saveError,
  };
}

export type ReceiptEditState = ReturnType<typeof useReceiptEditState>;

const ReceiptEditContext = createContext<ReceiptEditState | null>(null);
export const ReceiptEditProvider = ReceiptEditContext.Provider;

export function useReceiptEdit() {
  const value = useContext(ReceiptEditContext);
  if (!value) throw new Error("useReceiptEdit is used outside ReceiptEditProvider");
  return value;
}
