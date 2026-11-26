"use client";

import type { BankMode } from "@repo/trpc/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { packLabel, rupees } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { type PurchaseForReturn, useSavePurchaseReturn } from "~/providers/purchase-return";
import { useReturnSources } from "~/providers/sale-return";

import { indiaDay } from "../../account/balance";
import type { Pack, ProductGroup } from "../../product/products/product-tile";
import { productTitle } from "../../product/products/product-tile";
import type { Pickable } from "../pickers/ledger-picker";
import { refOkFor } from "../shared/bank-mode";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { GodownSpot } from "../shared/product-details-card";
import type { GridPlace } from "../shared/split-grid";

// the stages, in order, as a sale return's: the cart (how many of each go back, each replaced or refunded), then with any
// refunded: the refund in cash or on credit, the supplier (only editable), what they pay back (or what's left owed);
// then the reason, remarks, the supplier's credit note, the day and Save
export type ReturnStep = "cart" | "money" | "supplier" | "payment" | "details";

export const REASONS = ["damaged", "shortage", "wrong_item", "other"] as const;
export type Reason = (typeof REASONS)[number];
// lengths follow purchase_returns.reason and supplier_credit_note_number
export const REASON_MAX = 500;
export const NOTE_NUMBER_MAX = 16;

const round2 = (n: number) => Math.round(n * 100) / 100;

// one item of the purchase on the return: how many go back and how many leave each godown, then whether it's refunded
// or swapped (the supplier sends the same packs again: now, into the godowns in `into`, or later)
export type Settle = "replace" | "refund";
export type When = "now" | "later";
export type ReturnLine = { quantity: string; godowns: Record<string, string>; settle: Settle | null; when: When | null; into: Record<string, string> };
export const emptyLine = (): ReturnLine => ({ quantity: "", godowns: {}, settle: null, when: null, into: {} });
// a godowns' map as the server takes it: only the ones with some in them
const partsOf = (m: Record<string, string>) =>
  Object.entries(m)
    .filter(([, v]) => (Number(v) || 0) > 0)
    .map(([godownId, v]) => ({ godownId, quantity: Number(v) }));
export const placedOf = (m: Record<string, string>) => Object.values(m).reduce((a, v) => a + (Number(v) || 0), 0);

// the bill as if only `left` of each item had been bought, in paise, as the server works it out: each item at the
// rate it was bought at with its GST, the charges as they were (their GST taken out at the highest rate among the items
// still on it), the cash discount as it was (never more than the bill), rounded to the rupee
function billOf(purchase: PurchaseForReturn, left: (l: PurchaseForReturn["lines"][number]) => number) {
  const p = (r: number) => Math.round(r * 100);
  const items = purchase.lines.map((l) => {
    const value = p(l.rate) * left(l);
    return { l, value, gst: Math.round((value * l.gstRate) / 100) };
  });
  const charges = p(purchase.freightCharges) + p(purchase.packingCharges) + p(purchase.loadingCharges) + p(purchase.otherCharges);
  const rate = Math.max(0, ...items.filter((x) => left(x.l) > 0).map((x) => x.l.gstRate));
  const chargeTaxable = Math.round((charges * 100) / (100 + rate));
  const value = items.reduce((a, x) => a + x.value, 0);
  const gst = items.reduce((a, x) => a + x.gst, 0) + charges - chargeTaxable;
  const gross = value + chargeTaxable + gst;
  const off = Math.min(p(purchase.discount), gross);
  const total = Math.round((gross - off) / 100) * 100;
  return { off, total, roundOff: total - (gross - off) };
}

// a return's figures in paise (the refunded items): the bill as it stands less the bill as if these packs had never
// been bought, and each item's own line (its value and GST) for the cart
function figureReturn(purchase: PurchaseForReturn, quantities: Record<string, number>) {
  const before = billOf(purchase, (l) => l.bought - l.returned);
  const after = billOf(purchase, (l) => l.bought - l.returned - (quantities[l.productId] ?? 0));
  const items = purchase.lines
    .filter((l) => (quantities[l.productId] ?? 0) > 0)
    .map((l) => {
      const value = Math.round(l.rate * 100) * quantities[l.productId]!;
      return { productId: l.productId, quantity: quantities[l.productId]!, total: value + Math.round((value * l.gstRate) / 100) };
    });
  return {
    items,
    itemsTotal: items.reduce((a, i) => a + i.total, 0),
    discount: before.off - after.off,
    roundOff: before.roundOff - after.roundOff,
    total: before.total - after.total,
  };
}

// everything the return form holds and works out. Made once in ReturnEntry; every stage reads it with useReturnEntry()
export function useReturnEntryState({ purchase, ledger }: { purchase: PurchaseForReturn; ledger: Pickable | null }) {
  const t = useTranslations("transactions.purchaseReturn");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const router = useRouter();
  const { products, stock, money, loading, loadFailed, retry } = useReturnSources();
  const { save: saveReturn, saving: savingNow, saved } = useSavePurchaseReturn();

  // the answers: each item's quantity and godowns, Replace or Refund, the refund in cash or on credit, the money split,
  // the day, the reason, remarks and the supplier's credit note
  const [lines, setLines] = useState<Record<string, ReturnLine>>({});
  const [refundIn, setRefundIn] = useState<"cash" | "credit" | null>(null);
  const [splitTexts, setSplitTexts] = useState<Record<string, string>>({});
  const [bankModes, setBankModes] = useState<Record<string, BankMode | null>>({});
  const [refs, setRefs] = useState<Record<string, { mode: BankMode; text: string }>>({});
  const [refLeft, setRefLeft] = useState<string[]>([]);
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [reasonKind, setReasonKind] = useState<Reason | null>(null);
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [noteNumber, setNoteNumber] = useState("");
  const [noteDate, setNoteDate] = useState("");
  // items replaced now: the supplier's invoice they came on
  const [replacementBill, setReplacementBill] = useState("");
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  // the product details card over the page: the item being changed
  const [cardFor, setCardFor] = useState<string | null>(null);
  // the supplier, as the Supplier card shows them (Edit changes their details)
  const [supplierLedger, setSupplierLedger] = useState<Pickable | null>(ledger);
  const [editingSupplier, setEditingSupplier] = useState(false);

  // each pack size with its product (a name, photo and pack chip)
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const nameOf = (id: string) => {
    const p = packOf(id);
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode, p.pack.packCount)}` : (purchase.lines.find((l) => l.productId === id)?.name ?? "");
  };
  const purchaseLine = (id: string) => purchase.lines.find((l) => l.productId === id)!;
  // what each godown holds of a pack now
  const spotsOf = (productId: string): GodownSpot[] =>
    stock.map((g) => ({
      godownId: g.godownId,
      name: g.godownName,
      held: g.products.flatMap((p) => p.packs).find((p) => p.productId === productId)?.quantity ?? 0,
      counting: g.beingCounted,
    }));
  // the godowns a pack can leave from (those holding it)
  const godownsOf = (productId: string) => spotsOf(productId).filter((g) => g.held > 0);
  const lineOf = (id: string): ReturnLine => lines[id] ?? emptyLine();
  // a line saved from the product details card (none going back: off the return)
  const putLine = (id: string, line: ReturnLine) =>
    setLines((all) => {
      const rest = Object.fromEntries(Object.entries(all).filter(([k]) => k !== id));
      return (Number(line.quantity) || 0) > 0 ? { ...rest, [id]: line } : rest;
    });

  // the figures: every item is on the debit note; the refunded items' part on its own (what can be paid back now). The
  // replaced items' part always stays on the supplier's account (their new invoice adds it back)
  const quantities = Object.fromEntries(Object.entries(lines).map(([id, l]) => [id, Number(l.quantity) || 0]));
  const f = figureReturn(purchase, quantities);
  const total = f.total / 100;
  const chosen = Object.keys(lines).length;
  const hasReplace = Object.values(lines).some((l) => l.settle === "replace");
  const hasRefund = Object.values(lines).some((l) => l.settle === "refund");
  const replaceNow = Object.values(lines).some((l) => l.settle === "replace" && l.when === "now");
  const refund = figureReturn(purchase, Object.fromEntries(Object.entries(lines).map(([id, l]) => [id, l.settle === "refund" ? Number(l.quantity) || 0 : 0]))).total / 100;

  // a refund in cash: the supplier pays the refunded part back now; on credit it comes off what we owe them (the rest an
  // advance with them)
  const refundWay: "cash" | "credit" | null = hasRefund ? refundIn : null;
  const cashRefund = refundWay === "cash";
  const payBack = cashRefund ? refund : 0;
  const supplier = purchase.supplier;
  // what stays on their account: the whole return less what they pay back now
  const onAccount = round2(total - payBack);
  const owedAfter = Math.max(0, round2(supplier.owed - onAccount));
  const advanceAfter = round2(supplier.held + Math.max(0, round2(onAccount - supplier.owed)));

  // the places it comes back into: cash and every bank account (money coming in: no cap)
  const placeList = [{ id: "cash" }, ...(money?.banks ?? []).map((b) => ({ id: b.id }))];
  const places: GridPlace[] = placeList.map((p) => {
    const b = money?.banks.find((x) => x.id === p.id);
    return {
      id: p.id,
      name: p.id === "cash" ? tc("cash") : b ? bankNameIn(b.bankName, locale) : "",
      sub: p.id === "cash" ? null : `••${b?.last4 ?? ""}`,
      held: p.id === "cash" ? (money?.cash ?? null) : (b?.available ?? null),
      text: splitTexts[p.id] ?? "",
      amount: Number(splitTexts[p.id]) || 0,
      mode: p.id === "cash" ? null : (bankModes[p.id] ?? null),
    };
  });
  const splitTotal = round2(places.reduce((a, p) => a + p.amount, 0));
  const banksUsed = places.filter((p) => p.id !== "cash" && p.amount > 0);
  const refOf = (id: string, m: BankMode | null) => (m && refs[id]?.mode === m ? refs[id]!.text : "");
  const splitOk = splitTotal === payBack && banksUsed.every((p) => p.mode !== null && refOkFor(p.mode, refOf(p.id, p.mode)));
  // what comes back changed: the cards start again
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
      const swapOk = l.when === "later" || (l.when === "now" && placedOf(l.into) === q);
      return q <= purchaseLine(id).canReturn && placedOf(l.godowns) === q && l.settle !== null && (l.settle === "refund" || swapOk);
    });
  const reasonOk = reasonKind !== null && (reasonKind !== "other" || reason.trim() !== "");
  const complete: Record<ReturnStep, boolean> = {
    cart: linesOk,
    money: refundIn !== null,
    supplier: true,
    payment: payBack === 0 || splitOk,
    details: day !== "" && reasonOk && (!replaceNow || replacementBill.trim() !== ""),
  };
  // with any refunded: cash or credit, the supplier, then what comes back (or what's left owed); a return all replaced
  // goes straight to Details
  const STEPS: ReturnStep[] = ["cart", ...(hasRefund ? (["money", "supplier", "payment"] as ReturnStep[]) : []), "details"];
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
  // cash or credit picked: moves straight on to the supplier
  function pickRefundIn(k: "cash" | "credit") {
    setRefundIn(k);
    show("supplier");
  }

  // what each stage still needs, once Next or Save was tapped
  const missingOf = (s: ReturnStep) =>
    s === "cart"
      ? chosen === 0
        ? t("missing.items")
        : t("missing.godowns")
      : s === "money"
        ? t("missing.refundIn")
        : s === "payment"
          ? splitTotal < payBack
            ? t("missing.left", { amount: rupees(round2(payBack - splitTotal)) })
            : t("missing.into")
          : !reasonOk
            ? t("missing.reason")
            : replaceNow && replacementBill.trim() === ""
              ? t("missing.replacementBill")
              : t("missing.date");

  // leaving with something entered asks first (not after a save)
  const { dialog: leaveDialog } = useLeaveGuard(!saved && chosen > 0, () => setLines({}));

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
    setSaving(true);
    setSaveError(null);
    try {
      const r = await saveReturn({
        saveKey,
        purchaseTransactionId: purchase.transactionId,
        dateTime: momentOf(day),
        lines: Object.entries(lines)
          .filter(([, l]) => (Number(l.quantity) || 0) > 0)
          .map(([productId, l]) => ({
            productId,
            quantity: Number(l.quantity),
            godowns: partsOf(l.godowns),
            replace: l.settle === "replace" ? l.when : null,
            replaceInto: l.settle === "replace" && l.when === "now" ? partsOf(l.into) : null,
          })),
        reasonKind: reasonKind!,
        reason: reasonKind === "other" ? reason.trim() : null,
        remarks: remarks.trim() || null,
        supplierCreditNoteNumber: noteNumber.trim() || null,
        supplierCreditNoteDate: noteDate || null,
        replacementBillNumber: replaceNow ? replacementBill.trim() : null,
        refundIn: cashRefund ? "cash" : "credit",
        cashAmount: payBack > 0 ? (places[0]?.amount ?? 0) : 0,
        bankParts: payBack > 0 ? banksUsed.map((p) => ({ bankDetailsId: p.id, amount: p.amount, mode: p.mode!, referenceNumber: refOf(p.id, p.mode).trim() || null })) : [],
      });
      router.replace(`/transaction/purchase-return/${r.transactionId}`);
    } catch (err) {
      setSaving(false);
      setSaveError(saveErrorOf(err));
    }
  }

  return {
    t,
    tc,
    locale,
    purchase,
    loading,
    loadFailed,
    retry,
    packOf,
    nameOf,
    purchaseLine,
    spotsOf,
    godownsOf,
    hasReplace,
    hasRefund,
    refund,
    lines,
    lineOf,
    putLine,
    cardFor,
    setCardFor,
    figures: f,
    total,
    chosen,
    refundIn,
    pickRefundIn,
    supplierLedger,
    setSupplierLedger,
    editingSupplier,
    setEditingSupplier,
    cashRefund,
    oldDue: supplier.owed,
    owedAfter,
    advanceAfter,
    payBack,
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
    replaceNow,
    replacementBill,
    setReplacementBill,
    noteNumber,
    setNoteNumber,
    noteDate,
    setNoteDate,
    tried,
    setTried,
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
