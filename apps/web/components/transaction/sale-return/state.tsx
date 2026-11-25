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
import { draftInput as partyInput, draftOk as partyOk, emptyDraft as emptyParty, type PartyDraft } from "../../account/party/party-fields";
import type { Pack, ProductGroup } from "../../product/products/product-tile";
import type { LedgerChoice, Pickable } from "../pickers/ledger-picker";
import { usePhoneMatches } from "../pickers/party-finder";
import { productTitle } from "../../product/products/product-tile";
import { refOkFor } from "../shared/bank-mode";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { GodownSpot } from "../shared/product-details-card";
import type { GridPlace } from "../shared/split-grid";

// the stages, in order, as a sale's: the cart (how many of each come back, each replaced or refunded), then with any
// refunded: Refund or Buy something else, a customer's refund in cash or on credit, the payment (paid back, or what's
// left on their account); then the reason, remarks, day and Save (Buy something else: on to its new sale)
export type ReturnStep = "cart" | "settle" | "money" | "customer" | "payment" | "details";

export const REASONS = ["damaged", "shortage", "wrong_item", "other"] as const;
export type Reason = (typeof REASONS)[number];
// length follows sale_returns.reason
export const REASON_MAX = 500;

const round2 = (n: number) => Math.round(n * 100) / 100;

// one item of the sale on the return: how many come back and how many go into each godown, then whether it's replaced
// (as many go out again, from the godowns in `out`) or refunded
export type Settle = "replace" | "refund";
export type ReturnLine = { quantity: string; godowns: Record<string, string>; settle: Settle | null; out: Record<string, string> };
export const emptyLine = (): ReturnLine => ({ quantity: "", godowns: {}, settle: null, out: {} });
// a godowns' map as the server takes it: only the ones with some in them
const partsOf = (m: Record<string, string>) =>
  Object.entries(m)
    .filter(([, v]) => (Number(v) || 0) > 0)
    .map(([godownId, v]) => ({ godownId, quantity: Number(v) }));
export const placedOf = (l: ReturnLine) => Object.values(l.godowns).reduce((a, v) => a + (Number(v) || 0), 0);

// what Buy something else hands the sale form: the return as it will be saved, its total, who it's for (the customer,
// or a walk-in's name and phone), and the items replaced (they go on the new sale, fixed, at the rate they first sold
// at, in paise); the packs coming back are counted as stock the new sale can take
export type ExchangeHandoff = {
  saleReturn: {
    saleTransactionId: string;
    dateTime: Date;
    lines: {
      productId: string;
      quantity: number;
      godowns: { godownId: string; quantity: number }[];
      replaceFrom: { godownId: string; quantity: number }[] | null;
    }[];
    reasonKind: Reason;
    reason: string | null;
    remarks: string | null;
  };
  total: number;
  saleAssignedId: string;
  customer: { ledgerId: string; partyId: string } | null;
  buyer: { name: string; phone: string } | null;
  replaced: { productId: string; quantity: number; rate: number; gstRate: number; godowns: Record<string, string> }[];
};

// a replacement's new sale in paise, as the server works it out: each godown's part at the rate it first sold at with
// its GST, rounded to the rupee, never more than the return (a cash discount takes the rest off)
export function replacementTotal(sale: SaleForReturn, lines: Record<string, ReturnLine>, returnTotal: number) {
  let gross = 0;
  for (const [id, l] of Object.entries(lines)) {
    if (l.settle !== "replace") continue;
    const s = sale.lines.find((x) => x.productId === id);
    if (!s) continue;
    for (const p of partsOf(l.out)) {
      const value = Math.round(s.rate * 100) * p.quantity;
      gross += value + Math.round((value * s.gstRate) / 100);
    }
  }
  return gross === 0 ? 0 : Math.min(Math.round(gross / 100) * 100, returnTotal);
}

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
  const itemsTotal = items.reduce((a, x) => a + x.value + x.gst, 0);
  const gross = itemsTotal + charges;
  const off = Math.min(p(sale.discount), gross);
  const total = Math.round((gross - off) / 100) * 100;
  return { itemsTotal, off, total, roundOff: total - (gross - off) };
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
  return {
    items,
    itemsTotal: items.reduce((a, i) => a + i.total, 0),
    // the cash discount that no longer fits the smaller bill, and the round off's change
    discount: before.off - after.off,
    roundOff: before.roundOff - after.roundOff,
    after,
    total: before.total - after.total,
  };
}

// what a customer picked owes and holds now, in rupees
const accountOf = (l: Pickable) => {
  const b = l.balance?.today;
  return { owed: b?.side === "debit" ? b.amount : 0, held: b?.side === "credit" ? b.amount : 0 };
};

// a walk-in's refund on credit, as a new customer: the sale's name and phone (the rest typed; the short name left to
// type)
export const buyerParty = (sale: SaleForReturn): PartyDraft => ({ ...emptyParty(), name: sale.buyer?.name ?? "", phone: sale.buyer?.phone ?? "" });

// everything the return form holds and works out. Made once in ReturnEntry; every stage reads it with useReturnEntry()
export function useReturnEntryState({ sale, onExchange }: { sale: SaleForReturn; onExchange: (h: ExchangeHandoff) => void }) {
  const t = useTranslations("transactions.saleReturn");
  const ts = useTranslations("transactions.sale");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const router = useRouter();
  const { products, stock, money, loading, loadFailed, retry } = useReturnSources();
  const { saveRefund, saving: savingNow, saved } = useSaveReturn();

  // the answers: each item's quantity and godowns, Exchange or Refund, a customer's refund in cash or on credit, the
  // money split, the day, the reason and remarks
  const [lines, setLines] = useState<Record<string, ReturnLine>>({});
  // with any refunded: Refund, or Buy something else (the refund goes on a new sale)
  const [mode, setMode] = useState<"exchange" | "refund" | null>(null);
  const [refundIn, setRefundIn] = useState<"cash" | "credit" | null>(null);
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
  // the product details card over the page: the item being changed
  const [cardFor, setCardFor] = useState<string | null>(null);

  // each pack size with its product (a name, photo and pack chip)
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const nameOf = (id: string) => {
    const p = packOf(id);
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode, p.pack.packCount)}` : (sale.lines.find((l) => l.productId === id)?.name ?? "");
  };
  const saleLine = (id: string) => sale.lines.find((l) => l.productId === id)!;
  // the main godown: returned items go into it unless changed
  const mainId = stock.find((g) => g.isMain && !g.beingCounted)?.godownId ?? null;
  // the godowns a replacement can leave from: those holding that pack now
  const outOf = (productId: string): GodownSpot[] =>
    stock
      .map((g) => ({
        godownId: g.godownId,
        name: g.godownName,
        held: g.products.flatMap((p) => p.packs).find((p) => p.productId === productId)?.quantity ?? 0,
        counting: g.beingCounted,
      }))
      .filter((g) => g.held > 0);
  // the godowns a pack can go back into: every godown, with what it holds of that pack now (the ones it left first)
  const godownsOf = (productId: string): GodownSpot[] => {
    const left = saleLine(productId).godowns.map((g) => g.godownId);
    const all = stock.map((g) => ({
      godownId: g.godownId,
      name: g.godownName,
      held: g.products.flatMap((p) => p.packs).find((p) => p.productId === productId)?.quantity ?? 0,
      counting: g.beingCounted,
    }));
    return [...all.filter((g) => left.includes(g.godownId)), ...all.filter((g) => !left.includes(g.godownId))];
  };
  const lineOf = (id: string): ReturnLine => lines[id] ?? emptyLine();
  // a line saved from the product details card (none coming back: off the return)
  const putLine = (id: string, line: ReturnLine) =>
    setLines((all) => {
      const rest = Object.fromEntries(Object.entries(all).filter(([k]) => k !== id));
      return (Number(line.quantity) || 0) > 0 ? { ...rest, [id]: line } : rest;
    });

  // the figures
  const quantities = Object.fromEntries(Object.entries(lines).map(([id, l]) => [id, Number(l.quantity) || 0]));
  const f = figureReturn(sale, quantities);
  const total = f.total / 100;
  const chosen = f.items.length;
  // the replaced items' new sale, and what's left of the return to refund
  const hasReplace = Object.values(lines).some((l) => l.settle === "replace");
  const hasRefund = Object.values(lines).some((l) => l.settle === "refund");
  const replaced = replacementTotal(sale, lines, f.total) / 100;
  const refund = round2(total - replaced);

  // a refund in cash pays it all back now; on credit it stays on the customer's account (off what they owe, the rest an
  // advance). A walk-in's on credit goes to a customer picked or added now (the sale's name and phone filled in)
  const customer = sale.customer;
  const walkIn = !customer;
  // with an item replaced, a walk-in's refund is paid back (no Cash or credit); with none refunded, what rounding leaves
  // over stays on a customer's account, or a walk-in gets it back in cash
  const askRefundIn = !(walkIn && hasReplace);
  const refundsNow = hasRefund ? mode === "refund" : refund > 0;
  const refundWay: "cash" | "credit" | null = !refundsNow ? null : !hasRefund ? (walkIn ? "cash" : "credit") : askRefundIn ? refundIn : "cash";
  const cashRefund = refundWay === "cash";
  const payBack = cashRefund ? refund : 0;
  // a leftover with none refunded is paid back from cash, with no stage of its own
  const autoCash = !hasRefund && cashRefund;
  const needsCustomer = walkIn && refundWay === "credit";
  const [pickedChoice, setPickedChoice] = useState<LedgerChoice>(null);
  const [newParty, setNewParty] = useState<PartyDraft>(() => buyerParty(sale));
  const [editingCustomer, setEditingCustomer] = useState(false);
  const picked = pickedChoice?.kind === "ledger" ? pickedChoice.ledger : null;
  const matches = usePhoneMatches(needsCustomer && pickedChoice?.kind === "party" ? newParty.phone : "", "customer");
  const matched = matches[0] ?? null;
  // credit: what they owe and hold now (the sale's customer, or the one picked; someone new: nothing), then once the
  // return is taken off
  const account = customer ?? (picked ? accountOf(picked) : { owed: 0, held: 0 });
  const owedAfter = Math.max(0, round2(account.owed - refund));
  const advanceAfter = round2(account.held + Math.max(0, round2(refund - account.owed)));

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
  const banksUsed = places.filter((p) => p.id !== "cash" && p.amount > 0);
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

  // when each stage is filled in
  const linesOk =
    chosen > 0 &&
    Object.entries(lines).every(([id, l]) => {
      const q = Number(l.quantity) || 0;
      const out = Object.values(l.out).reduce((a, v) => a + (Number(v) || 0), 0);
      return q <= saleLine(id).canReturn && placedOf(l) === q && l.settle !== null && (l.settle === "refund" || out === q);
    });
  const reasonOk = reasonKind !== null && (reasonKind !== "other" || reason.trim() !== "");
  const complete: Record<ReturnStep, boolean> = {
    cart: linesOk && total > 0,
    settle: mode !== null,
    money: refundIn !== null,
    customer: !needsCustomer || pickedChoice?.kind === "ledger" || (pickedChoice?.kind === "party" && !matched && partyOk(newParty, true)),
    payment: payBack === 0 || autoCash || ((payCap === null || payBack <= payCap) && splitOk),
    details: day !== "" && reasonOk,
  };
  // with any refunded: Refund or Buy something else. A refund asks cash or credit (not a walk-in's with an item replaced;
  // a walk-in's on credit: then who it goes to), then shows the payment or the due; Buy something else, and a return
  // all replaced, go straight to Details
  const STEPS: ReturnStep[] = [
    "cart",
    ...(hasRefund ? (["settle"] as ReturnStep[]) : []),
    ...(hasRefund && mode === "refund"
      ? ([...(askRefundIn ? ["money"] : []), ...(needsCustomer ? ["customer"] : []), "payment"] as ReturnStep[])
      : []),
    "details",
  ];
  const [at, setAt] = useState<ReturnStep>("cart");
  const current = STEPS.includes(at) ? at : "details";
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: ReturnStep) => STEPS.includes(s) && STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the phone's Back goes to the stage before
  const remember = useCardHistory<ReturnStep>("cart", (card) => {
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
  // Exchange or Refund picked: moves straight on (a chip-only stage)
  function pickMode(m: "exchange" | "refund") {
    setMode(m);
    show(m === "exchange" ? "details" : askRefundIn ? "money" : "payment");
  }
  // a refund in cash or on credit: moves straight on (a walk-in's on credit: to who it goes to)
  function pickRefundIn(k: "cash" | "credit") {
    setRefundIn(k);
    show(walkIn && k === "credit" ? "customer" : "payment");
  }

  // what each stage still needs, once Next or Save was tapped
  const missingOf = (s: ReturnStep) =>
    s === "cart"
      ? chosen === 0
        ? t("missing.items")
        : t("missing.godowns")
      : s === "settle"
        ? t("missing.mode")
        : s === "money"
          ? t("missing.refundIn")
          : s === "customer"
            ? ts("missing.customer")
          : s === "payment"
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
        godowns: partsOf(l.godowns),
        replaceFrom: l.settle === "replace" ? partsOf(l.out) : null,
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
    // Buy something else goes on to its new sale, which saves both
    if (hasRefund && mode === "exchange") {
      onExchange({
        saleReturn: returnInput(),
        total,
        saleAssignedId: sale.assignedId,
        customer: customer ? { ledgerId: customer.ledgerId, partyId: customer.partyId } : null,
        buyer: customer ? null : { name: sale.buyer?.name ?? "", phone: sale.buyer?.phone ?? "" },
        replaced: Object.entries(lines)
          .filter(([, l]) => l.settle === "replace")
          .map(([productId, l]) => {
            const s = saleLine(productId);
            return { productId, quantity: Number(l.quantity), rate: Math.round(s.rate * 100), gstRate: s.gstRate, godowns: l.out };
          }),
      });
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const r = await saveRefund({
        saveKey,
        ...returnInput(),
        refundIn: cashRefund ? "cash" : "credit",
        // a walk-in's on credit: the customer picked, or added now
        customerLedgerId: needsCustomer && pickedChoice?.kind === "ledger" ? pickedChoice.ledger.id : null,
        newCustomer: needsCustomer && pickedChoice?.kind === "party" ? partyInput(newParty) : null,
        // (a leftover with none refunded: all from cash)
        cashAmount: autoCash ? payBack : payBack > 0 ? (places[0]?.amount ?? 0) : 0,
        bankParts:
          payBack > 0 && !autoCash
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
    saleLine,
    godownsOf,
    outOf,
    mainId,
    hasReplace,
    hasRefund,
    replaced,
    refund,
    askRefundIn,
    refundWay,
    lines,
    lineOf,
    putLine,
    cardFor,
    setCardFor,
    figures: f,
    total,
    chosen,
    mode,
    pickMode,
    refundIn,
    pickRefundIn,
    customer,
    walkIn,
    pickedChoice,
    setPickedChoice,
    newParty,
    setNewParty,
    editingCustomer,
    setEditingCustomer,
    matched,
    setTried,
    cashRefund,
    oldDue: account.owed,
    owedAfter,
    advanceAfter,
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
