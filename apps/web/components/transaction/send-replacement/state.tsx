"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useState } from "react";

import { packLabel } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { type useReturnSources, useSendReplacement } from "~/providers/sale-return";

import { indiaDay } from "../../account/balance";
import { type Pack, type ProductGroup, productTitle } from "../../product/products/product-tile";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { GodownSpot } from "../shared/product-details-card";

type Pending = RouterOutputs["transactions"]["saleReturn"]["pending"];

// the stages: the cart (how many of each go, and the godowns they leave from), then vehicle, date, remarks and Save
export type SendStep = "cart" | "details";

// one item going out: how many, and how many leave each godown (as typed)
export type GoLine = { quantity: string; from: Record<string, string> };

export const placedOf = (from: Record<string, string>) => Object.values(from).reduce((a, v) => a + (Number(v) || 0), 0);

// length follows sales.vehicle_number
export const VEHICLE_MAX = 15;

// what the form reads before it opens: the return's items still to go, the products (their pictures) and stock
export type SendInput = {
  pending: Pending;
  products: ProductGroup[];
  stock: ReturnType<typeof useReturnSources>["stock"];
  onDiscard: () => void;
};

// everything the Send replacement form holds and works out. Made once in the form; every stage reads it with
// useSendReplacementEntry()
export function useSendState({ pending, products, stock, onDiscard }: SendInput) {
  const t = useTranslations("transactions.saleReturn.send");
  const ts = useTranslations("transactions.sale");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const router = useRouter();
  const { send, saving: sending } = useSendReplacement();

  // each pack size with its product (a photo and pack chip)
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const pendingLine = (id: string) => pending.lines.find((l) => l.productId === id)!;
  const nameOf = (id: string) => {
    const p = packOf(id);
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode, p.pack.packCount)}` : pendingLine(id).name;
  };
  // the godowns a pack can leave from: those holding it now
  const spotsOf = (productId: string): GodownSpot[] =>
    stock
      .map((g) => ({
        godownId: g.godownId,
        name: g.godownName,
        held: g.products.flatMap((p) => p.packs).find((p) => p.productId === productId)?.quantity ?? 0,
        counting: g.beingCounted,
      }))
      .filter((g) => g.held > 0);

  // the answers: each item going (nothing filled in), the vehicle, the day, remarks
  const [lines, setLines] = useState<Record<string, GoLine>>({});
  const lineOf = (id: string): GoLine => lines[id] ?? { quantity: "", from: {} };
  const putLine = (id: string, line: GoLine) =>
    setLines((all) => {
      const rest = Object.fromEntries(Object.entries(all).filter(([k]) => k !== id));
      return (Number(line.quantity) || 0) > 0 ? { ...rest, [id]: line } : rest;
    });
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState("");
  const today = indiaDay(new Date());
  const [day, setDay] = useState(today);
  const [remarks, setRemarks] = useState("");

  // the figures, at the rate each first sold at: each line's value and GST, in paise, and the bill rounded to the rupee
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
  const linesOk = chosen > 0 && Object.values(lines).every((l) => placedOf(l.from) === (Number(l.quantity) || 0));
  const complete: Record<SendStep, boolean> = { cart: linesOk, details: day !== "" };
  const missingOf = (s: SendStep) => (s === "cart" ? (chosen === 0 ? t("missingQuantity") : t("missing")) : t("missingDate"));

  // moving between stages: the phone's Back goes to the stage before
  const STEPS: SendStep[] = ["cart", "details"];
  const [current, setAt] = useState<SendStep>("cart");
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: SendStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const remember = useCardHistory<SendStep>("cart", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: SendStep) {
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
  const { dialog: leaveDialog } = useLeaveGuard(!saved && (chosen > 0 || vehicle !== ""), onDiscard);

  // the save: a sale to the customer; then its success card
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
      const r = await send({
        returnTransactionId: pending.transactionId,
        saveKey,
        dateTime: momentOf(day),
        vehicleNumber: vehicle.trim() || null,
        remarks: remarks.trim() || null,
        lines: Object.entries(lines).map(([productId, l]) => ({
          productId,
          quantity: Number(l.quantity),
          from: Object.entries(l.from)
            .filter(([, v]) => (Number(v) || 0) > 0)
            .map(([godownId, v]) => ({ godownId, quantity: Number(v) })),
        })),
      });
      setSaved(true);
      // on to the sale's success card; replace, so going back doesn't land on the form
      router.replace(`/transaction/sale/${r.transactionId}`);
    } catch (err) {
      setSaving(false);
      setSaveError(saveErrorOf(err));
    }
  }

  return {
    t,
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
    vehicle,
    setVehicle,
    day,
    setDay,
    today,
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
    saving: saving || sending,
    saveError,
  };
}

export type SendState = ReturnType<typeof useSendState>;

const SendContext = createContext<SendState | null>(null);
export const SendProvider = SendContext.Provider;

export function useSendEntry() {
  const value = useContext(SendContext);
  if (!value) throw new Error("useSendEntry is used outside SendProvider");
  return value;
}
