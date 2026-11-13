"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useContext, useState } from "react";

import { packLabel } from "~/lib/format";
import { asField, parseAmount } from "~/lib/price";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { usePurchaseOrderData } from "~/providers/purchase-order";

import { indiaDay } from "../../../account/balance";
import { draftInput, draftOk, emptyDraft, type PartyDraft } from "../../../account/party/party-fields";
import { useSameNameConfirm } from "../../../account/party/same-name";
import type { LedgerChoice } from "../../pickers/ledger-picker";
import { usePhoneMatches } from "../../pickers/party-finder";
import type { Pack, ProductGroup } from "../../../product/products/product-tile";
import { productTitle } from "../../../product/products/product-tile";
import { moveCard, useCardHistory } from "../../shared/card-steps";

// the cards, in order: Purchase or Sale, the products on the order, the totals, the supplier, then the dates, remarks
// and Save
export type OrderStep = "type" | "products" | "totals" | "supplier" | "details";
const STEPS: OrderStep[] = ["type", "products", "totals", "supplier", "details"];

// one item on the order, as typed: the price with GST per kg (or l, box, piece), the pack's price before GST and its
// price with GST fill each other in; `from` is the one typed last, which the figures follow
export type PriceField = "unitGst" | "price" | "priceGst";
export type OrderLine = { productId: string; unitGst: string; price: string; priceGst: string; from: PriceField; quantity: string };

// a pack size not on the order yet: nothing typed, quantity 1
export const emptyLine = (productId: string): OrderLine => ({ productId, unitGst: "", price: "", priceGst: "", from: "priceGst", quantity: "1" });

const round2 = (v: number) => Math.round(v * 100) / 100;

// an item's figures, in paise: the pack's rate before GST (from what was typed last), its value, GST and total
export function lineFigures(line: OrderLine, packSize: number, gstPercent: number | null) {
  const qty = Number(line.quantity) || 0;
  const gst = gstPercent ?? 0;
  const typed = Number(line[line.from]) || 0;
  const rate =
    line.from === "unitGst"
      ? Math.round((typed * packSize * 100 * 100) / (100 + gst))
      : line.from === "price"
        ? Math.round(typed * 100)
        : Math.round((typed * 100 * 100) / (100 + gst));
  const value = rate * qty;
  const tax = Math.round((value * gst) / 100);
  return { rate, value, tax, total: value + tax };
}

// after one of the three changes, work out the other two from it
export function settleLine(line: OrderLine, packSize: number, gstPercent: number | null): OrderLine {
  const gst = gstPercent ?? 0;
  const typed = parseAmount(line[line.from]);
  if (typed == null) return { ...line, unitGst: line.from === "unitGst" ? line.unitGst : "", price: line.from === "price" ? line.price : "", priceGst: line.from === "priceGst" ? line.priceGst : "" };
  // the pack's price before GST, from whichever was typed
  const price =
    line.from === "unitGst" ? (typed * packSize) / (1 + gst / 100) : line.from === "price" ? typed : typed / (1 + gst / 100);
  return {
    ...line,
    unitGst: line.from === "unitGst" ? line.unitGst : asField(round2((price * (1 + gst / 100)) / packSize)),
    price: line.from === "price" ? line.price : asField(round2(price)),
    priceGst: line.from === "priceGst" ? line.priceGst : asField(round2(price * (1 + gst / 100))),
  };
}

// everything the new-order form holds and works out. Made once in OrderEntry; every card reads it with useOrderEntry()
export function useOrderEntryState({ onDiscard }: { onDiscard: () => void }) {
  const t = useTranslations("orders");
  const router = useRouter();
  const { products, categories, suppliers, loading, loadFailed, retryLoad, saveOrder, saving: creating, saved } = usePurchaseOrderData();

  // the answers
  const [kind, setKind] = useState<"purchase" | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  // the supplier, as a payment picks one: found in the search, or new (its details typed on the card)
  const [supplierPick, setSupplierPick] = useState<LedgerChoice>(null);
  const [newSupplier, setNewSupplier] = useState<PartyDraft>(() => emptyDraft());
  // the order is dated the day it's made; the server sets it, this only shows it
  const [orderDate] = useState(() => indiaDay(new Date()));
  const [expected, setExpected] = useState("");
  const [remarks, setRemarks] = useState("");
  // one discount on the whole order, in rupees, off the total after GST
  const [discount, setDiscount] = useState("");
  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saveError, setSaveError] = useState<string | null>(null);
  // Next or Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);

  // each pack size with its product, to find an item's name, photo and GST %
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products ?? []) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const nameOf = (id: string) => {
    const p = packOf(id);
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode)}` : "";
  };

  // the items, worked out
  const figures = lines.map((l) => {
    const p = packOf(l.productId)?.pack;
    return lineFigures(l, p?.packSize ?? 1, p?.gstPercent ?? null);
  });
  // the items' value before GST and the GST on it; then the discount comes off that total (never more than the value
  // before GST), as the server works it out
  const subtotal = figures.reduce((a, f) => a + f.value, 0);
  const tax = figures.reduce((a, f) => a + f.tax, 0);
  const off = Math.min(Math.round((parseAmount(discount) ?? 0) * 100), subtotal);
  const itemsValue = subtotal / 100;
  const gstValue = tax / 100;
  // before the discount
  const withGst = (subtotal + tax) / 100;
  const discountValue = off / 100;
  // what the order comes to
  const total = (subtotal + tax - off) / 100;
  // the table's total: the items with GST, before the discount
  const linesTotal = figures.reduce((a, f) => a + f.total, 0) / 100;
  const lineOk = (l: OrderLine) => (Number(l[l.from]) || 0) > 0 && (Number(l.quantity) || 0) >= 1;
  // an item whose product has no GST % yet can't be ordered (the server takes it from there)
  const noGst = lines.find((l) => packOf(l.productId)?.pack.gstPercent == null);
  // the supplier picked (its party), or a new one: a phone already someone's shows them instead
  const supplierId = supplierPick?.kind === "ledger" ? supplierPick.ledger.referenceId : null;
  const supplier = supplierPick?.kind === "ledger" ? supplierPick.ledger : null;
  const phoneMatches = usePhoneMatches(newSupplier.phone, "customer");
  const supplierMatch = supplierPick?.kind === "party" && phoneMatches.length > 0 ? phoneMatches[0]! : null;
  // a party with the same name in the same town asks before it's added again
  const sameName = useSameNameConfirm();

  // change the items: put one on (or change it, from the line card), or take it off
  const putLine = (line: OrderLine) =>
    setLines((all) => (all.some((l) => l.productId === line.productId) ? all.map((l) => (l.productId === line.productId ? line : l)) : [...all, line]));
  const removeLine = (productId: string) => setLines((all) => all.filter((l) => l.productId !== productId));

  // when each card is filled in
  const complete: Record<OrderStep, boolean> = {
    type: kind === "purchase",
    products: lines.length > 0 && lines.every(lineOk) && !noGst,
    totals: true,
    supplier: supplierId !== null || (supplierPick?.kind === "party" && !supplierMatch && draftOk(newSupplier, true, true)),
    details: orderDate !== "" && (expected === "" || expected >= orderDate),
  };
  const [at, setAt] = useState<OrderStep>("type");
  const current = at;
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: OrderStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  // the line card over the page: the pack size being added or changed
  const [cardFor, setCardFor] = useState<string | null>(null);
  // phones: the summary folded into a bar above the card
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the phone's Back goes to the card before
  const remember = useCardHistory<OrderStep>("type", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: OrderStep) {
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

  const stepName = (s: OrderStep) => t(`steps.${s}`);
  // what the card still needs, once Next or Save was tapped
  const missingOf = (s: OrderStep) =>
    s === "products"
      ? lines.length === 0
        ? t("missing.products")
        : noGst
          ? t("missing.noGst", { name: nameOf(noGst.productId) })
          : t("missing.lines")
      : s === "supplier"
        ? t("missing.supplier")
        : s === "details"
          ? orderDate === ""
            ? t("missing.date")
            : t("missing.expected")
          : null;

  // leaving with something entered asks first (not after a save, which goes on to its own page)
  const { dialog: leaveDialog } = useLeaveGuard(!saved && (lines.length > 0 || supplierPick !== null || remarks !== ""), onDiscard);

  // Save tapped and still working: the button says so and can't be tapped again
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!ready) {
      setAt(STEPS[firstOpen]!);
      return guide();
    }
    // a new supplier with the same name in the same town: asked first
    if (supplierPick?.kind === "party" && !(await sameName.confirm(newSupplier))) return;
    setSaving(true);
    setSaveError(null);
    try {
      const order = await saveOrder({
        saveKey,
        partyId: supplierId,
        newSupplier: supplierPick?.kind === "party" ? draftInput(newSupplier) : null,
        expectedDeliveryDate: expected || null,
        lines: lines.map((l, i) => ({ productId: l.productId, quantity: Number(l.quantity), rateBeforeGst: figures[i]!.rate / 100, discount: 0 })),
        orderDiscount: discountValue,
        remarks: remarks.trim() || null,
      });
      // on to its own page; replace, so going back doesn't land on the filled form
      router.replace(`/transaction/order/${order.id}`);
    } catch (err) {
      setSaving(false);
      const code = (err as { data?: { code?: string } })?.data?.code;
      setSaveError(
        t(
          code === undefined
            ? "errors.network"
            : code === "TOO_MANY_REQUESTS"
              ? "errors.busy"
              : code === "BAD_REQUEST"
                ? "errors.check"
                : code === "NOT_FOUND" || code === "PRECONDITION_FAILED"
                  ? "errors.gone"
                  : "errors.failed",
        ),
      );
    }
  }

  return {
    t,
    loading,
    loadFailed,
    retryLoad,
    products: products ?? [],
    categories: categories ?? [],
    suppliers: suppliers ?? [],
    creating,
    kind,
    setKind,
    lines,
    figures,
    putLine,
    cardFor,
    setCardFor,
    removeLine,
    packOf,
    nameOf,
    itemsValue,
    discount,
    setDiscount,
    discountValue,
    gstValue,
    withGst,
    total,
    linesTotal,
    supplierPick,
    setSupplierPick,
    newSupplier,
    setNewSupplier,
    supplierMatch,
    supplier,
    sameNameDialog: sameName.dialog,
    setTried,
    orderDate,
    expected,
    setExpected,
    remarks,
    setRemarks,
    saveError,
    tried,
    complete,
    steps: STEPS,
    current,
    index,
    reachable,
    summaryOpen,
    setSummaryOpen,
    stepName,
    missingOf,
    leaveDialog,
    show,
    next,
    saving: saving || creating,
    save,
  };
}

export type OrderEntryState = ReturnType<typeof useOrderEntryState>;

const OrderEntryContext = createContext<OrderEntryState | null>(null);
export const OrderEntryProvider = OrderEntryContext.Provider;

export function useOrderEntry() {
  const value = useContext(OrderEntryContext);
  if (!value) throw new Error("useOrderEntry is used outside OrderEntryProvider");
  return value;
}
