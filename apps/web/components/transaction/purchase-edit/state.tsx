"use client";

import type { BankMode, RouterInputs } from "@repo/trpc/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { parseAmount, unitsIn } from "~/lib/price";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import type { PurchaseForEdit } from "~/providers/purchase-edit";
import type { useReturnSources } from "~/providers/sale-return";

import { indiaDay } from "../../account/balance";
import type { Pack, ProductGroup } from "../../product/products/product-tile";
import { type OrderLine, settleLine } from "../order/new/state";
import { billNumberOk } from "../purchase/state";
import { refOkFor } from "../shared/bank-mode";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { GridPlace } from "../shared/split-grid";

// the stages, in order, as an edited sale's: the cart (prices only), cash or credit and the payment (only when money
// moves: the bill went up, or it's now below what was paid), the supplier's bill, then the details
export type EditStep = "cart" | "money" | "payment" | "bill" | "details";

const round2 = (n: number) => Math.round(n * 100) / 100;

// one item's cost as typed: per unit with GST, the pack before GST, or the pack with GST (each fills the others)
export type CostLine = Omit<OrderLine, "quantity">;

type EditPurchaseIn = RouterInputs["transactions"]["purchase"]["edit"];

// what the edit form reads before it opens: the purchase as saved, the products (to name and picture its items), cash
// and the bank accounts with what each holds, and the save
export type PurchaseEditInput = {
  purchase: PurchaseForEdit;
  products: ProductGroup[];
  money: ReturnType<typeof useReturnSources>["money"];
  saveEdit: (input: EditPurchaseIn) => Promise<{ transactionId: string }>;
  saving: boolean;
  saved: boolean;
  onDiscard: () => void;
};

// everything an edit holds and works out. Made once in the form; every stage reads it with usePurchaseEdit()
export function usePurchaseEditState({ purchase: p, products, money, saveEdit, saving: editSaving, saved, onDiscard }: PurchaseEditInput) {
  const t = useTranslations("transactions.purchase");
  const te = useTranslations("transactions.purchase.edit");
  const ts = useTranslations("transactions.sale");
  const tc = useTranslations("transactions.chat");
  const tpf = useTranslations("transactions.payment.form");
  const locale = useLocale();
  const router = useRouter();

  // each pack size with its product, to find an item's photo and pack chip
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const savedLine = (id: string) => p.lines.find((l) => l.productId === id)!;
  const sizeOf = (id: string) => {
    const pack = packOf(id)?.pack;
    return pack ? unitsIn(pack) : 1;
  };

  // the answers: each item's cost (starting at its saved rate), the bill, vehicle and remarks
  const startLines = (): CostLine[] =>
    p.lines.map((l) => settleLine({ productId: l.productId, unitGst: "", price: String(l.rateBeforeGst), priceGst: "", from: "price", quantity: "1" }, sizeOf(l.productId), l.gstRate));
  const [lines, setLines] = useState<CostLine[]>(startLines);
  const putLine = (line: CostLine) => setLines((all) => all.map((l) => (l.productId === line.productId ? line : l)));
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState(p.supplierInvoiceNumber);
  const [billDay, setBillDay] = useState(() => indiaDay(new Date(p.dateTime)));
  const [vehicle, setVehicle] = useState(p.vehicleNumber ?? "");
  // the supplier's bill's file (as attached, until changed), and whether one is uploading
  const [billUrl, setBillUrl] = useState<string | null>(p.invoiceUrl);
  const [billBusy, setBillBusy] = useState(false);
  const [remarks, setRemarks] = useState(p.remarks ?? "");

  // each item's rate before GST, in paise: a cost left as it was (or typed again as it was saved, before GST or with
  // it) keeps the saved rate to the paisa, so re-typing it never counts as a change
  const rateOf = (l: CostLine) => {
    const s = savedLine(l.productId);
    const typed = parseAmount(l.price);
    if (typed === null) return 0;
    const savedGst = round2(s.rateBeforeGst * (1 + s.gstRate / 100));
    const same = round2(typed) === round2(s.rateBeforeGst) || (l.from !== "price" && round2(parseAmount(l.priceGst) ?? -1) === savedGst);
    return same ? Math.round(s.rateBeforeGst * 100) : Math.round(typed * 100);
  };
  // the cart, worked out as the server does: each item's value (its saved discount off) and GST, the charges and cash
  // discount as saved, the total rounded to the rupee
  const figures = lines.map((l) => {
    const s = savedLine(l.productId);
    const rate = rateOf(l);
    const value = Math.max(0, rate * s.quantity - Math.round(s.discount * 100));
    const tax = Math.round((value * s.gstRate) / 100);
    return { rate, value, tax, total: value + tax };
  });
  const itemsPaise = figures.reduce((a, f) => a + f.total, 0);
  const chargesPaise = Math.round((p.freightCharges + p.packingCharges + p.loadingCharges + p.otherCharges) * 100);
  const figuredPaise = itemsPaise + chargesPaise - Math.round(p.discount * 100);
  const totalPaise = Math.round(figuredPaise / 100) * 100;
  const total = totalPaise / 100;
  const roundOff = (totalPaise - figuredPaise) / 100;
  const itemsTotal = itemsPaise / 100;
  const costsOk = figures.every((f) => f.rate > 0);
  const pricesChanged = lines.some((l) => rateOf(l) !== Math.round(savedLine(l.productId).rateBeforeGst * 100));

  // the money, asked whenever the total changed: cash or credit. The bill up: cash pays the rise now, credit owes it.
  // The bill down: cash, the supplier pays the cut back now (as a return's cash refund); credit, it comes off what we
  // owe (past it, an advance)
  const paid = p.paid;
  const rise = round2(total - p.total);
  const asksMoney = pricesChanged && rise !== 0;
  const [kind, setKind] = useState<"cash" | "credit" | null>(null);
  // cash, as a return's cash refund: the whole cut comes back now, or the whole rise is paid now
  const cashBack = asksMoney && kind === "cash" && rise < 0 ? -rise : 0;
  const cashPay = asksMoney && kind === "cash" && rise > 0 ? rise : 0;
  const takingBack = cashBack > 0;
  const paying = cashPay > 0;
  const moving = takingBack ? cashBack : cashPay;
  // the Due card: on credit only
  const credit = kind === "credit";
  // the credit period: asked only on credit
  const asksDays = kind === "credit";
  // what we'll owe them after: with cash taken back, that much more again (it came out of what was paid)
  const [creditDays, setCreditDays] = useState(() => (p.kind === "credit" && p.creditPeriodDays !== null ? String(p.creditPeriodDays) : p.kind === "credit" ? "" : "30"));
  // the supplier's account: what we owe them besides this bill, and after the edit (an advance when below nothing)
  const oldDue = Math.max(0, round2(p.supplierBalance - (p.total - paid)));
  const after = round2(p.supplierBalance + rise + cashBack - cashPay);
  const owedAfter = Math.max(0, after);
  const advanceAfter = Math.max(0, -after);

  // where the money moves: cash and every bank account. Paid out: never more than each holds today
  const [splitTexts, setSplitTexts] = useState<Record<string, string>>({});
  const [bankModes, setBankModes] = useState<Record<string, BankMode | null>>({});
  const [refs, setRefs] = useState<Record<string, { mode: BankMode; text: string }>>({});
  const [refLeft, setRefLeft] = useState<string[]>([]);
  const places: GridPlace[] = [{ id: "cash" }, ...(money?.banks ?? []).map((b) => ({ id: b.id }))].map((x) => {
    const b = money?.banks.find((y) => y.id === x.id);
    return {
      id: x.id,
      name: x.id === "cash" ? tc("cash") : b ? bankNameIn(b.bankName, locale) : "",
      sub: x.id === "cash" ? null : `••${b?.last4 ?? ""}`,
      held: x.id === "cash" ? (money?.cash ?? null) : (b?.available ?? null),
      text: splitTexts[x.id] ?? "",
      amount: Number(splitTexts[x.id]) || 0,
      mode: x.id === "cash" ? null : (bankModes[x.id] ?? null),
    };
  });
  const splitTotal = round2(places.reduce((a, x) => a + x.amount, 0));
  const banksUsed = places.filter((x) => x.id !== "cash" && x.amount > 0);
  const refOf = (id: string, m: BankMode | null) => (m && refs[id]?.mode === m ? refs[id]!.text : "");
  const overHeld = paying && places.some((x) => x.held !== null && x.amount > x.held);
  const splitOk = splitTotal === moving && !overHeld && banksUsed.every((x) => x.mode !== null && refOkFor(x.mode, refOf(x.id, x.mode)));
  // what moves changed: the cards start again
  const [splitFor, setSplitFor] = useState(moving);
  if (splitFor !== moving) {
    setSplitFor(moving);
    setSplitTexts({});
    setBankModes({});
    setRefs({});
    setRefLeft([]);
  }

  // when each stage is filled in; Next or Save tapped with something missing shows it in red
  const [tried, setTried] = useState(false);
  const today = indiaDay(new Date());
  const month = indiaDay(new Date(p.dateTime)).slice(0, 7);
  const monthEnd = indiaDay(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12)));
  const dayMin = `${month}-01`;
  const dayMax = monthEnd < today ? monthEnd : today;
  const complete: Record<EditStep, boolean> = {
    cart: costsOk && total > 0,
    money: kind !== null,
    payment: credit ? !asksDays || creditDays === "" || Number(creditDays) <= 365 : moving === 0 || splitOk,
    bill: billNumberOk(billNumber) && billDay !== "" && !billBusy,
    details: true,
  };
  const missingOf = (s: EditStep) =>
    s === "cart"
      ? te("missingCost")
      : s === "money"
        ? ts("missing.kind")
        : s === "payment"
          ? credit
            ? t("missing.creditDays")
            : splitTotal < moving
              ? t("missing.left", { amount: rupees(round2(moving - splitTotal)) })
              : t("missing.into")
          : s === "bill"
            ? !billNumberOk(billNumber)
              ? t("missing.billNumber")
              : billBusy
                ? t("missing.billUpload")
                : t("missing.billDate")
            : "";

  // moving between stages: the phone's Back goes to the stage before
  const STEPS: EditStep[] = ["cart", ...(asksMoney ? (["money", "payment"] as const) : []), "bill", "details"];
  const [at, setAt] = useState<EditStep>("cart");
  const current = STEPS.includes(at) ? at : "cart";
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: EditStep) => STEPS.includes(s) && STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const remember = useCardHistory<EditStep>("cart", (card) => {
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
  // cash or credit picked: moves straight on (a chip-only stage)
  function pickKind(k: "cash" | "credit") {
    setKind(k);
    show("payment");
  }

  // leaving with a change made asks first (not after the save, which goes on to its success card)
  const changed =
    pricesChanged ||
    billNumber !== p.supplierInvoiceNumber ||
    billDay !== indiaDay(new Date(p.dateTime)) ||
    vehicle !== (p.vehicleNumber ?? "") ||
    remarks.trim() !== (p.remarks ?? "") ||
    billUrl !== p.invoiceUrl;
  const { dialog: leaveDialog } = useLeaveGuard(!saved && changed, onDiscard);

  // the save: the new prices, the bill, vehicle and remarks, and what moves now
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // the server's own words only where they say what to fix; anything else a plain message
  function saveErrorOf(err: unknown) {
    const e = err as { data?: { code?: string }; message?: string };
    const code = e?.data?.code;
    return code === undefined
      ? ts("errors.network")
      : code === "TOO_MANY_REQUESTS"
        ? ts("errors.busy")
        : (code === "BAD_REQUEST" || code === "CONFLICT" || code === "PRECONDITION_FAILED") && e.message
          ? e.message
          : code === "NOT_FOUND"
            ? t("errors.gone")
            : t("errors.failed");
  }
  async function save() {
    // nothing changed: nothing saved, no edit recorded; straight back to the purchase
    if (!changed) {
      router.replace(`/history/${p.transactionId}`);
      return;
    }
    if (!ready) {
      setAt(STEPS[firstOpen]!);
      return guide();
    }
    setSaving(true);
    setSaveError(null);
    // money asked: the kind picked; otherwise as saved
    const k = asksMoney ? kind! : p.kind;
    try {
      const done = await saveEdit({
        transactionId: p.transactionId,
        saveKey,
        dateTime: momentOf(billDay),
        supplierInvoiceNumber: billNumber.trim(),
        lines: lines.map((l) => ({ productId: l.productId, rateBeforeGst: rateOf(l) / 100 })),
        kind: k,
        creditPeriodDays: k === "credit" ? (asksMoney ? (creditDays === "" ? null : Number(creditDays)) : p.creditPeriodDays) : null,
        cashAmount: moving > 0 ? (places[0]?.amount ?? 0) : 0,
        bankParts: moving > 0 ? banksUsed.map((x) => ({ bankDetailsId: x.id, amount: x.amount, mode: x.mode!, referenceNumber: refOf(x.id, x.mode).trim() || null })) : [],
        vehicleNumber: vehicle.trim() || null,
        remarks: remarks.trim() || null,
        invoiceUrl: billUrl,
      });
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
    ts,
    tc,
    tpf,
    locale,
    purchase: p,
    packOf,
    savedLine,
    sizeOf,
    lines,
    putLine,
    figures,
    cardFor,
    setCardFor,
    itemsTotal,
    roundOff,
    total,
    paid,
    kind,
    credit,
    pickKind,
    creditDays,
    asksDays,
    setCreditDays,
    takingBack,
    paying,
    moving,
    oldDue,
    owedAfter,
    advanceAfter,
    places,
    setSplitText: (id: string, text: string) => setSplitTexts((all) => ({ ...all, [id]: text })),
    setBankMode: (id: string, mode: BankMode | null) => setBankModes((all) => ({ ...all, [id]: mode })),
    splitTotal,
    refs,
    setRefs,
    refLeft,
    setRefLeft,
    billNumber,
    setBillNumber,
    billDay,
    setBillDay,
    billUrl,
    setBillUrl,
    setBillBusy,
    dayMin,
    dayMax,
    vehicle,
    setVehicle,
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

export type PurchaseEditState = ReturnType<typeof usePurchaseEditState>;

const PurchaseEditContext = createContext<PurchaseEditState | null>(null);
export const PurchaseEditProvider = PurchaseEditContext.Provider;

export function usePurchaseEdit() {
  const value = useContext(PurchaseEditContext);
  if (!value) throw new Error("usePurchaseEdit is used outside PurchaseEditProvider");
  return value;
}
