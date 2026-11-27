"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useState } from "react";

import { packLabel } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { useReceiveReplacement } from "~/providers/purchase-return";
import type { useReturnSources } from "~/providers/sale-return";

import { indiaDay } from "../../account/balance";
import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { billNumberOk } from "../purchase/state";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { GodownSpot } from "../shared/product-details-card";

type Pending = RouterOutputs["transactions"]["purchaseReturn"]["pending"];

// the stages: the items that came (how many of each, and their godowns), the supplier's bill, then the remarks and Save
export type ReplacementStep = "items" | "bill" | "details";

// one item that came: how many, and how many go into each godown (as typed)
export type CameLine = { quantity: string; into: Record<string, string> };

export const placedOf = (into: Record<string, string>) => Object.values(into).reduce((a, v) => a + (Number(v) || 0), 0);

// what the form reads before it opens: the return's items still to come, the products (their pictures) and stock
export type ReplacementInput = {
  pending: Pending;
  products: ProductGroup[];
  stock: ReturnType<typeof useReturnSources>["stock"];
  onDiscard: () => void;
};

// everything the Record replacement form holds and works out. Made once in the form; every stage reads it with
// useReplacement()
export function useReplacementState({ pending, products, stock, onDiscard }: ReplacementInput) {
  const t = useTranslations("transactions.purchaseReturn.receive");
  const tp = useTranslations("transactions.purchase");
  const ts = useTranslations("transactions.sale");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const router = useRouter();
  const { receive, saving: receiving } = useReceiveReplacement();

  // each pack size with its product (a photo and pack chip)
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const pendingLine = (id: string) => pending.lines.find((l) => l.productId === id)!;
  const nameOf = (id: string) => {
    const p = packOf(id);
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode, p.pack.packCount)}` : pendingLine(id).name;
  };
  // what each godown holds of a pack now
  const spotsOf = (productId: string): GodownSpot[] =>
    stock.map((g) => ({
      godownId: g.godownId,
      name: g.godownName,
      held: g.products.flatMap((p) => p.packs).find((p) => p.productId === productId)?.quantity ?? 0,
      counting: g.beingCounted,
    }));

  // the answers: each item that came (nothing filled in), the bill, the vehicle, remarks
  const [lines, setLines] = useState<Record<string, CameLine>>({});
  const lineOf = (id: string): CameLine => lines[id] ?? { quantity: "", into: {} };
  const putLine = (id: string, line: CameLine) =>
    setLines((all) => {
      const rest = Object.fromEntries(Object.entries(all).filter(([k]) => k !== id));
      return (Number(line.quantity) || 0) > 0 ? { ...rest, [id]: line } : rest;
    });
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState("");
  const [billDay, setBillDay] = useState(() => indiaDay(new Date()));
  const [billUrl, setBillUrl] = useState<string | null>(null);
  const [billBusy, setBillBusy] = useState(false);
  const [vehicle, setVehicle] = useState("");
  const [remarks, setRemarks] = useState("");
  const today = indiaDay(new Date());

  // the figures, at the rate each was bought at: each line's value and GST, in paise, and the bill rounded to the rupee
  const figureOf = (id: string, q: number) => {
    const l = pendingLine(id);
    const value = Math.round(l.rate * 100) * q;
    const tax = Math.round((value * l.gstRate) / 100);
    return { value, tax, total: value + tax };
  };
  const itemsPaise = Object.entries(lines).reduce((a, [id, l]) => a + figureOf(id, Number(l.quantity) || 0).total, 0);
  const totalPaise = Math.round(itemsPaise / 100) * 100;
  const total = totalPaise / 100;
  const itemsTotal = itemsPaise / 100;
  const roundOff = (totalPaise - itemsPaise) / 100;
  const chosen = Object.keys(lines).length;

  // when each stage is filled in; Next or Save tapped with something missing shows it in red
  const [tried, setTried] = useState(false);
  const linesOk = chosen > 0 && Object.entries(lines).every(([, l]) => placedOf(l.into) === (Number(l.quantity) || 0));
  const complete: Record<ReplacementStep, boolean> = {
    items: linesOk,
    bill: billNumberOk(billNumber) && billDay !== "" && !billBusy,
    details: true,
  };
  const missingOf = (s: ReplacementStep) =>
    s === "items"
      ? chosen === 0
        ? t("missingQuantity")
        : t("missing")
      : s === "bill"
        ? !billNumberOk(billNumber)
          ? t("missingBill")
          : billBusy
            ? tp("missing.billUpload")
            : tp("missing.billDate")
        : "";

  // moving between stages: the phone's Back goes to the stage before
  const STEPS: ReplacementStep[] = ["items", "bill", "details"];
  const [current, setAt] = useState<ReplacementStep>("items");
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: ReplacementStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const remember = useCardHistory<ReplacementStep>("items", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: ReplacementStep) {
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

  // leaving with something entered asks first (not after the save)
  const [saved, setSaved] = useState(false);
  const { dialog: leaveDialog } = useLeaveGuard(!saved && (chosen > 0 || billNumber !== "" || vehicle !== ""), onDiscard);

  // the save: a purchase on the supplier's bill; then its success card
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  function saveErrorOf(err: unknown) {
    const e = err as { data?: { code?: string }; message?: string };
    const code = e?.data?.code;
    return code === undefined
      ? ts("errors.network")
      : code === "TOO_MANY_REQUESTS"
        ? ts("errors.busy")
        : (code === "BAD_REQUEST" || code === "CONFLICT" || code === "PRECONDITION_FAILED") && e.message
          ? e.message
          : t("failed");
  }
  async function save() {
    if (!ready) {
      setAt(STEPS[firstOpen]!);
      return guide();
    }
    setSaving(true);
    setSaveError(null);
    try {
      const r = await receive({
        returnTransactionId: pending.transactionId,
        saveKey,
        supplierInvoiceNumber: billNumber.trim(),
        dateTime: momentOf(billDay),
        invoiceUrl: billUrl,
        vehicleNumber: vehicle.trim() || null,
        remarks: remarks.trim() || null,
        lines: Object.entries(lines).map(([productId, l]) => ({
          productId,
          quantity: Number(l.quantity),
          into: Object.entries(l.into)
            .filter(([, v]) => (Number(v) || 0) > 0)
            .map(([godownId, v]) => ({ godownId, quantity: Number(v) })),
        })),
      });
      setSaved(true);
      // on to the purchase's success card; replace, so going back doesn't land on the form
      router.replace(`/transaction/purchase/${r.transactionId}`);
    } catch (err) {
      setSaving(false);
      setSaveError(saveErrorOf(err));
    }
  }

  return {
    t,
    tp,
    ts,
    tc,
    locale,
    pending,
    packOf,
    pendingLine,
    nameOf,
    spotsOf,
    lines,
    lineOf,
    putLine,
    cardFor,
    setCardFor,
    figureOf,
    itemsTotal,
    roundOff,
    total,
    chosen,
    billNumber,
    setBillNumber,
    billDay,
    setBillDay,
    billUrl,
    setBillUrl,
    setBillBusy,
    today,
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
    saving: saving || receiving,
    saveError,
  };
}

export type ReplacementState = ReturnType<typeof useReplacementState>;

const ReplacementContext = createContext<ReplacementState | null>(null);
export const ReplacementProvider = ReplacementContext.Provider;

export function useReplacement() {
  const value = useContext(ReplacementContext);
  if (!value) throw new Error("useReplacement is used outside ReplacementProvider");
  return value;
}
