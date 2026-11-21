"use client";

import type { BankMode } from "@repo/trpc/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { packLabel, rupees } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { type SaleForReturn, useReturnSources, useSaveReturn } from "~/providers/sale-return";

import { indiaDay } from "../../account/balance";
import type { Pack, ProductGroup } from "../../product/products/product-tile";
import { productTitle } from "../../product/products/product-tile";
import { refOkFor } from "../shared/bank-mode";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { GridPlace } from "../shared/split-grid";

// the cards, in order: the items coming back, the amount, Exchange or Refund, the refund (who gets what back, and from
// where), then the day, reason, remarks and Save (an exchange: Next, to its new sale)
export type ReturnStep = "items" | "amount" | "settle" | "refund" | "details";
const ALL_STEPS: ReturnStep[] = ["items", "amount", "settle", "refund", "details"];

export const REASONS = ["damaged", "shortage", "wrong_item", "other"] as const;
export type Reason = (typeof REASONS)[number];
// length follows sale_returns.reason
export const REASON_MAX = 500;

const round2 = (n: number) => Math.round(n * 100) / 100;

// one item of the sale on the return: how many come back, and how many go into each godown
export type ReturnLine = { quantity: string; godowns: Record<string, string> };
export const placedOf = (l: ReturnLine) => Object.values(l.godowns).reduce((a, v) => a + (Number(v) || 0), 0);

// a godown the packs can go back into: its name, what it holds of that pack now, whether it's being counted (locked)
export type GodownSpot = { godownId: string; name: string; held: number; counting: boolean };

// what an exchange hands the sale form: the return as it will be saved, its total, and who it's for (the customer, or
// a walk-in's name and phone); the packs coming back are counted as stock the new sale can take
export type ExchangeHandoff = {
  saleReturn: {
    saleTransactionId: string;
    dateTime: Date;
    lines: { productId: string; quantity: number; godowns: { godownId: string; quantity: number }[] }[];
    reasonKind: Reason;
    reason: string | null;
    remarks: string | null;
  };
  total: number;
  saleAssignedId: string;
  customer: { ledgerId: string; partyId: string } | null;
  buyer: { name: string; phone: string } | null;
};

// the bill as if only `left` of each item had been sold, in paise, as the server works it out (and a sale's is): each
// item at the rate it sold at with its GST, the charges as they were (their GST taken out at the highest rate among the
// items still on it), the cash discount as it was (never more than the bill), rounded to the rupee
function billOf(sale: SaleForReturn, left: (l: SaleForReturn["lines"][number]) => number) {
  const p = (r: number) => Math.round(r * 100);
  const items = sale.lines.map((l) => {
    const value = p(l.rate) * left(l);
    return { l, value, gst: Math.round((value * l.gstRate) / 100) };
  });
  const charges = p(sale.transportCharges) + p(sale.packingCharges) + p(sale.loadingCharges);
  const rate = Math.max(0, ...items.filter((x) => left(x.l) > 0).map((x) => x.l.gstRate));
  const chargeTaxable = Math.round((charges * 100) / (100 + rate));
  const itemsTotal = items.reduce((a, x) => a + x.value + x.gst, 0);
  const gross = itemsTotal + charges;
  const off = Math.min(p(sale.discount), gross);
  const total = Math.round((gross - off) / 100) * 100;
  return { itemsTotal, chargeTaxable, off, total, roundOff: total - (gross - off) };
}

// a return's figures in paise: the bill as it stands less the bill as if these packs had never been sold (the
// charges and the cash discount as they were), and each item's own line (its value and GST) for the cart and summary
export function figureReturn(sale: SaleForReturn, quantities: Record<string, number>) {
  const before = billOf(sale, (l) => l.sold - l.returned);
  const after = billOf(sale, (l) => l.sold - l.returned - (quantities[l.productId] ?? 0));
  const items = sale.lines
    .filter((l) => (quantities[l.productId] ?? 0) > 0)
    .map((l) => {
      const value = Math.round(l.rate * 100) * quantities[l.productId]!;
      return { productId: l.productId, quantity: quantities[l.productId]!, total: value + Math.round((value * l.gstRate) / 100) };
    });
  return { items, itemsTotal: items.reduce((a, i) => a + i.total, 0), after, total: before.total - after.total };
}

// everything the return form holds and works out. Made once in ReturnEntry; every card reads it with useReturnEntry()
export function useReturnEntryState({ sale, onExchange }: { sale: SaleForReturn; onExchange: (h: ExchangeHandoff) => void }) {
  const t = useTranslations("transactions.saleReturn");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const router = useRouter();
  const { products, stock, money, loading, loadFailed, retry } = useReturnSources();
  const { saveRefund, saving: savingNow, saved } = useSaveReturn();

  // the answers: each item's quantity and godowns, Exchange or Refund, a customer's "pay it back now", the money split,
  // the day, the reason and remarks
  const [lines, setLines] = useState<Record<string, ReturnLine>>({});
  const [mode, setMode] = useState<"exchange" | "refund" | null>(null);
  const [splitTexts, setSplitTexts] = useState<Record<string, string>>({});
  const [bankModes, setBankModes] = useState<Record<string, BankMode | null>>({});
  const [refs, setRefs] = useState<Record<string, { mode: BankMode; text: string }>>({});
  const [refLeft, setRefLeft] = useState<string[]>([]);
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [reasonKind, setReasonKind] = useState<Reason | null>(null);
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  // the line card over the page: the item being changed
  const [cardFor, setCardFor] = useState<string | null>(null);

  // each pack size with its product (a name, photo and pack chip); a pack size since deleted shows by the sale's name
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const nameOf = (id: string) => {
    const p = packOf(id);
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode, p.pack.packCount)}` : (sale.lines.find((l) => l.productId === id)?.name ?? "");
  };
  // the godowns a pack can go back into: every godown, with what it holds of that pack now (the ones it left first)
  const godownsOf = (productId: string): GodownSpot[] => {
    const left = sale.lines.find((l) => l.productId === productId)?.godowns.map((g) => g.godownId) ?? [];
    const all = stock.map((g) => ({
      godownId: g.godownId,
      name: g.godownName,
      held: g.products.flatMap((p) => p.packs).find((p) => p.productId === productId)?.quantity ?? 0,
      counting: g.beingCounted,
    }));
    return [...all.filter((g) => left.includes(g.godownId)), ...all.filter((g) => !left.includes(g.godownId))];
  };
  const lineOf = (id: string): ReturnLine => lines[id] ?? { quantity: "", godowns: {} };
  const putLine = (id: string, line: ReturnLine) => setLines((all) => ({ ...all, [id]: line }));
  const removeLine = (id: string) => setLines((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== id)));

  // the figures
  const quantities = Object.fromEntries(Object.entries(lines).map(([id, l]) => [id, Number(l.quantity) || 0]));
  const f = figureReturn(sale, quantities);
  const total = f.total / 100;
  const chosen = f.items.length;

  // the bill as if what comes back had never been sold, less what was paid towards it: below nothing, that much is paid
  // back now on a refund (a walk-in, all of the return; a customer, what's over what they still owed on this bill);
  // otherwise the return only takes it off what's owed
  const customer = sale.customer;
  const billAfter = f.after.total / 100;
  const balance = round2(billAfter - sale.paid);
  const refundDue = Math.max(0, -balance);
  const payBack = mode === "refund" ? refundDue : 0;

  // the places it's paid back from: cash and every bank account, each never past what it holds (staff never get here)
  const placeList = [{ id: "cash", held: money?.cash ?? null }, ...(money?.banks ?? []).map((b) => ({ id: b.id, held: b.available }))];
  const places: GridPlace[] = placeList.map((p) => {
    const b = money?.banks.find((x) => x.id === p.id);
    return {
      id: p.id,
      name: p.id === "cash" ? tc("cash") : b ? bankNameIn(b.bankName, locale) : "",
      sub: p.id === "cash" ? null : `••${b?.last4 ?? ""}`,
      held: p.held,
      text: splitTexts[p.id] ?? "",
      amount: Number(splitTexts[p.id]) || 0,
      mode: p.id === "cash" ? null : (bankModes[p.id] ?? null),
    };
  });
  const splitTotal = round2(places.reduce((a, p) => a + p.amount, 0));
  const used = places.filter((p) => p.amount > 0);
  const banksUsed = used.filter((p) => p.id !== "cash");
  const refOf = (id: string, m: BankMode | null) => (m && refs[id]?.mode === m ? refs[id]!.text : "");
  // what cash and the banks hold together: never more can be paid back
  const payCap = places.every((p) => p.held !== null) ? round2(places.reduce((a, p) => a + Math.max(0, p.held!), 0)) : null;
  const splitOk =
    splitTotal === payBack &&
    places.every((p) => p.held === null || p.amount <= p.held) &&
    banksUsed.every((p) => p.mode !== null && refOkFor(p.mode, refOf(p.id, p.mode)));
  // what's paid back changed: the cards start again
  const [splitFor, setSplitFor] = useState(payBack);
  if (splitFor !== payBack) {
    setSplitFor(payBack);
    setSplitTexts({});
    setBankModes({});
  }

  // when each card is filled in
  const linesOk =
    chosen > 0 &&
    Object.entries(lines).every(([id, l]) => {
      const q = Number(l.quantity) || 0;
      const can = sale.lines.find((x) => x.productId === id)?.canReturn ?? 0;
      return q === 0 || (q <= can && placedOf(l) === q);
    });
  const reasonOk = reasonKind !== null && (reasonKind !== "other" || reason.trim() !== "");
  const complete: Record<ReturnStep, boolean> = {
    items: linesOk,
    amount: total > 0,
    settle: mode !== null,
    refund: payBack === 0 || ((payCap === null || payBack <= payCap) && splitOk),
    details: day !== "" && reasonOk,
  };
  // a refund with money to pay back asks where it's paid from; an exchange goes straight to Details
  const STEPS = ALL_STEPS.filter((s) => s !== "refund" || (mode === "refund" && refundDue > 0));
  const [at, setAt] = useState<ReturnStep>("items");
  const current = STEPS.includes(at) ? at : "details";
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: ReturnStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the phone's Back goes to the card before
  const remember = useCardHistory<ReturnStep>("items", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: ReturnStep) {
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
  // Exchange or Refund picked: moves straight on (a chip-only card)
  function pickMode(m: "exchange" | "refund") {
    setMode(m);
    show(m === "refund" && refundDue > 0 ? "refund" : "details");
  }

  // what each card still needs, once Next or Save was tapped
  const missingOf = (s: ReturnStep) =>
    s === "items"
      ? chosen === 0
        ? t("missing.items")
        : t("missing.godowns")
      : s === "settle"
        ? t("missing.mode")
        : s === "refund"
          ? payCap !== null && payBack > payCap
            ? t("missing.cap", { amount: rupees(payCap) })
            : splitTotal < payBack
              ? t("missing.left", { amount: rupees(round2(payBack - splitTotal)) })
              : t("missing.into")
          : !reasonOk
            ? t("missing.reason")
            : t("missing.date");

  // leaving with something entered asks first (not after a save)
  const { dialog: leaveDialog } = useLeaveGuard(!saved && chosen > 0, () => setLines({}));

  // the return as the server takes it
  const returnInput = () => ({
    saleTransactionId: sale.transactionId,
    dateTime: momentOf(day),
    lines: Object.entries(lines)
      .filter(([, l]) => (Number(l.quantity) || 0) > 0)
      .map(([productId, l]) => ({
        productId,
        quantity: Number(l.quantity),
        godowns: Object.entries(l.godowns)
          .filter(([, v]) => (Number(v) || 0) > 0)
          .map(([godownId, v]) => ({ godownId, quantity: Number(v) })),
      })),
    reasonKind: reasonKind!,
    reason: reasonKind === "other" ? reason.trim() : null,
    remarks: remarks.trim() || null,
  });

  // a failed save: the server's own words where they say what to fix, otherwise a plain message
  function saveErrorOf(err: unknown) {
    const e = err as { data?: { code?: string }; message?: string };
    const code = e?.data?.code;
    return code === undefined
      ? t("errors.network")
      : code === "TOO_MANY_REQUESTS"
        ? t("errors.busy")
        : (code === "BAD_REQUEST" || code === "CONFLICT" || code === "PRECONDITION_FAILED") && e.message
          ? e.message
          : t("errors.failed");
  }
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!ready) {
      setAt(STEPS[firstOpen]!);
      return guide();
    }
    // an exchange goes on to its new sale, which saves both
    if (mode === "exchange") {
      onExchange({
        saleReturn: returnInput(),
        total,
        saleAssignedId: sale.assignedId,
        customer: customer ? { ledgerId: customer.ledgerId, partyId: customer.partyId } : null,
        buyer: customer ? null : { name: sale.buyer?.name ?? "", phone: sale.buyer?.phone ?? "" },
      });
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const r = await saveRefund({
        saveKey,
        ...returnInput(),
        cashAmount: payBack > 0 ? (places[0]?.amount ?? 0) : 0,
        bankParts:
          payBack > 0
            ? banksUsed.map((p) => ({ bankDetailsId: p.id, amount: p.amount, mode: p.mode!, referenceNumber: refOf(p.id, p.mode).trim() || null }))
            : [],
      });
      router.replace(`/transaction/sale-return/${r.transactionId}`);
    } catch (err) {
      setSaving(false);
      setSaveError(saveErrorOf(err));
    }
  }

  return {
    t,
    tc,
    locale,
    sale,
    loading,
    loadFailed,
    retry,
    packOf,
    nameOf,
    godownsOf,
    lines,
    lineOf,
    putLine,
    removeLine,
    cardFor,
    setCardFor,
    figures: f,
    total,
    chosen,
    mode,
    pickMode,
    customer,
    billAfter,
    balance,
    payBack,
    payCap,
    places,
    setSplitText: (id: string, text: string) => setSplitTexts((all) => ({ ...all, [id]: text })),
    setBankMode: (id: string, m: BankMode | null) => setBankModes((all) => ({ ...all, [id]: m })),
    splitTotal,
    refs,
    setRefs,
    refLeft,
    setRefLeft,
    day,
    setDay,
    reasonKind,
    setReasonKind,
    reason,
    setReason,
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
    leaveDialog,
    show,
    next,
    save,
    saving: saving || savingNow,
    saveError,
  };
}

export type ReturnEntryState = ReturnType<typeof useReturnEntryState>;

const ReturnEntryContext = createContext<ReturnEntryState | null>(null);
export const ReturnEntryProvider = ReturnEntryContext.Provider;

export function useReturnEntry() {
  const value = useContext(ReturnEntryContext);
  if (!value) throw new Error("useReturnEntry is used outside ReturnEntryProvider");
  return value;
}
