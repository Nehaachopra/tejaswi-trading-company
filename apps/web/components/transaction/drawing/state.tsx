"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { packLabel, rupees } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { useDrawing } from "~/providers/drawing";

import { indiaDay } from "../../account/balance";
import type { Pack, ProductGroup } from "../../product/products/product-tile";
import { productTitle } from "../../product/products/product-tile";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { type SummaryItem } from "../shared/entry-frame";
import { momentOf } from "../shared/form-basics";
import type { GodownHold } from "../sale/state";

// the cards, in order: money or goods; then the amount with where it's taken from (money) or the products (goods);
// then the remarks, the day and Save
export type DrawingStep = "kind" | "amount" | "products" | "details";
export type DrawingKind = "money" | "goods";

// one pack size the owner takes: how many, and how many leave each godown
export type DrawingLine = { productId: string; quantity: string; godowns: Record<string, string> };

// a line's figures, in paise: a pack's cost (weighted average, before GST), the cost of all of them, the input GST
// reversed on that, and the two together (what the drawing comes to), as the server works them out
export function lineFigures(pack: Pick<Pack, "weightedAverageCost" | "gstPercent">, quantity: number) {
  const unit = Math.round((pack.weightedAverageCost ?? 0) * 100);
  const cost = unit * quantity;
  const itc = Math.round((cost * (pack.gstPercent ?? 0)) / 100);
  return { unit, cost, itc, total: cost + itc };
}

// the godowns' parts of a line, as numbers
export const placedOf = (line: Pick<DrawingLine, "godowns">) =>
  Object.values(line.godowns).reduce((a, v) => a + (Number(v) || 0), 0);

// everything the drawing form holds and works out. Made once in DrawingEntry; every card reads it with useDrawingEntry()
export function useDrawingEntryState({ onDiscard }: { onDiscard: () => void }) {
  const t = useTranslations("transactions.drawing");
  const ts = useTranslations("transactions.sale");
  const tc = useTranslations("transactions.chat");
  const tpf = useTranslations("transactions.payment.form");
  const locale = useLocale();
  const router = useRouter();
  const { products, categories, stock, banks, sources, loading, loadFailed, retryLoad, saveDrawing, saving: creating, saved } = useDrawing();

  // the answers: money or goods; money's amount and where it's taken from ("cash" or a bank account's id); goods' cart;
  // then the day and the remarks
  const [kind, setKind] = useState<DrawingKind | null>(null);
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [capped, setCapped] = useState<number | null>(null);
  const [lines, setLines] = useState<DrawingLine[]>([]);
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [remarks, setRemarks] = useState("");
  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saveError, setSaveError] = useState<string | null>(null);
  // Next or Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);
  useEffect(() => setTried(false), [kind, amount, from, lines]);

  // money: what cash and each bank account hold today (the most that can be taken from each)
  const value = Number(amount) || 0;
  const heldIn = (id: string | null) =>
    id === null ? null : id === "cash" ? (sources?.cash ?? null) : (sources?.banks.find((b) => b.id === id)?.available ?? null);
  const most = heldIn(from);
  // the place picked after the amount, holding less: the amount is cut to what it holds, with the warning
  useEffect(() => {
    if (most === null || value <= most) return;
    setAmount(String(most));
    setCapped(most);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the place (and so the most) changes
  }, [from, most]);
  const fromName = (id: string | null) => {
    if (id === "cash") return tc("cash");
    const b = banks?.find((x) => x.id === id);
    return b ? `${bankNameIn(b.bankName, locale)} ••${b.last4}` : null;
  };

  // goods: each pack size with its product, to find a line's name, photo, cost and GST %
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products ?? []) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const nameOf = (id: string) => {
    const p = packOf(id);
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode, p.pack.packCount)}` : "";
  };
  // the godowns holding each pack size, from what each godown holds
  const holds = new Map<string, GodownHold[]>();
  for (const g of stock ?? [])
    for (const product of g.products)
      for (const p of product.packs)
        if (p.quantity > 0)
          holds.set(p.productId, [...(holds.get(p.productId) ?? []), { godownId: g.godownId, name: g.godownName, held: p.quantity, counting: g.beingCounted }]);
  const godownsOf = (productId: string) => holds.get(productId) ?? [];
  // a pack size can be taken once it has free stock, a cost and a GST % (the server values it at cost)
  const freeOf = (p: Pack) => p.unreservedQuantity;
  const takeable = (p: Pack) => freeOf(p) > 0 && p.weightedAverageCost != null && p.gstPercent != null;
  // the cart, worked out
  const figures = lines.map((l) => {
    const p = packOf(l.productId)?.pack;
    return p ? lineFigures(p, Number(l.quantity) || 0) : { unit: 0, cost: 0, itc: 0, total: 0 };
  });
  const goodsTotal = figures.reduce((a, f) => a + f.total, 0) / 100;
  // the line card open over the page: the pack size being added or changed
  const [cardFor, setCardFor] = useState<string | null>(null);
  const putLine = (line: DrawingLine) =>
    setLines((all) => (all.some((l) => l.productId === line.productId) ? all.map((l) => (l.productId === line.productId ? line : l)) : [...all, line]));
  const removeLine = (productId: string) => setLines((all) => all.filter((l) => l.productId !== productId));

  // what it comes to: money's amount, or the goods' cost and GST reversed
  const total = kind === "goods" ? goodsTotal : value;

  // the cards for the kind picked
  const steps: DrawingStep[] = ["kind", kind === "goods" ? "products" : "amount", "details"];
  const linesOk = lines.length > 0 && lines.every((l) => (Number(l.quantity) || 0) >= 1 && placedOf(l) === Number(l.quantity));
  const complete: Record<DrawingStep, boolean> = {
    kind: kind !== null,
    amount: value > 0 && from !== null && (most === null || value <= most),
    products: linesOk,
    details: day !== "",
  };
  const [at, setAt] = useState<DrawingStep>("kind");
  const current = steps.includes(at) ? at : "kind";
  const index = steps.indexOf(current);
  const firstOpen = steps.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: DrawingStep) => steps.indexOf(s) <= (ready ? steps.length - 1 : firstOpen);
  // phones: the summary folded into a bar above the card
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the Amount card opens with its field ready to type in
  useEffect(() => {
    if (current === "amount") document.getElementById("amount-field")?.focus({ preventScroll: true });
  }, [current]);

  // the phone's Back goes to the card before
  const remember = useCardHistory<DrawingStep>("kind", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: DrawingStep) {
    moveCard(
      () => {
        setTried(false);
        setAt(step);
      },
      steps.indexOf(step) < index,
    );
    remember(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // a kind picked: on to its next card by itself (a chip-only card)
  function pickKind(k: DrawingKind) {
    setKind(k);
    moveCard(() => {
      setTried(false);
      setAt(k === "goods" ? "products" : "amount");
    });
    remember(k === "goods" ? "products" : "amount");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // something missing: show it in red and put the cursor on its first field
  function guide() {
    setTried(true);
    setTimeout(() => document.querySelector<HTMLElement>('main section [aria-invalid="true"]')?.focus(), 50);
  }
  function next() {
    if (!complete[current]) return guide();
    show(steps[index + 1]!);
  }

  const stepName = (s: DrawingStep) => t(`steps.${s}`);
  const missingOf = () =>
    current === "kind"
      ? t("missing.kind")
      : current === "amount"
        ? t(value === 0 ? "missing.amount" : "missing.from")
        : current === "products"
          ? t("missing.products")
          : tc("q.date");

  // what's answered so far, a line each, for the summary
  const summary: SummaryItem<DrawingStep>[] = [
    { key: "kind", step: "kind", heading: stepName("kind"), value: kind ? t(`kinds.${kind}`) : null },
    ...(kind === "goods"
      ? [
          {
            key: "products",
            step: "products" as const,
            heading: stepName("products"),
            // each item: its name with ×quantity beside it (muted), its cost and GST reversed at the end
            value: lines.flatMap((l, i) =>
              packOf(l.productId)
                ? [{ name: nameOf(l.productId), middle: `×${(Number(l.quantity) || 0).toLocaleString("en-IN")}`, amount: rupees(figures[i]!.total / 100) }]
                : [],
            ),
          },
        ]
      : [
          {
            key: "amount",
            step: "amount" as const,
            heading: t("takenFrom"),
            value: ((n: string | null) => (n && value > 0 ? { name: n, amount: rupees(value) } : null))(fromName(from)),
          },
        ]),
    { key: "details", step: "details", heading: stepName("details"), value: remarks.trim() || null },
  ];

  // leaving with something entered asks first (not after a save, which goes on to its own page)
  const { dialog: leaveDialog } = useLeaveGuard(!saved && (kind !== null || value > 0 || lines.length > 0 || remarks !== ""), onDiscard);

  // Save tapped and still working: the button says so and can't be tapped again
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!ready) {
      setAt(steps[firstOpen]!);
      return guide();
    }
    setSaving(true);
    setSaveError(null);
    try {
      const common = { saveKey, dateTime: momentOf(day), remarks };
      const d = await saveDrawing(
        kind === "goods"
          ? {
              ...common,
              kind: "goods",
              lines: lines.map((l) => ({
                productId: l.productId,
                godowns: Object.entries(l.godowns)
                  .filter(([, v]) => (Number(v) || 0) > 0)
                  .map(([godownId, v]) => ({ godownId, quantity: Number(v) })),
              })),
            }
          : { ...common, kind: "money", amount: value, bankDetailsId: from === "cash" ? null : from },
      );
      // on to its own page; replace, so going back doesn't land on the filled form
      router.replace(`/transaction/drawing/${d.transactionId}`);
    } catch (err) {
      setSaving(false);
      const code = (err as { data?: { code?: string } })?.data?.code;
      setSaveError(
        code === undefined
          ? tc("saveErrors.network")
          : code === "TOO_MANY_REQUESTS"
            ? tc("saveErrors.busy")
            : code === "PRECONDITION_FAILED"
              ? kind === "money"
                ? t("errors.cash")
                : ((err as { message?: string }).message ?? t("errors.failed"))
              : code === "BAD_REQUEST"
                ? tc("saveErrors.check")
                : t("errors.failed"),
      );
    }
  }

  return {
    t,
    ts,
    tc,
    tpf,
    locale,
    loading,
    loadFailed,
    retryLoad,
    products: products ?? [],
    categories: categories ?? [],
    banks,
    sources,
    creating,
    kind,
    pickKind,
    amount,
    setAmount,
    from,
    setFrom,
    capped,
    setCapped,
    capText: capped === null ? null : t("capOnly", { amount: rupees(capped) }),
    value,
    most,
    heldIn,
    lines,
    figures,
    goodsTotal,
    putLine,
    removeLine,
    cardFor,
    setCardFor,
    packOf,
    godownsOf,
    freeOf,
    takeable,
    day,
    setDay,
    remarks,
    setRemarks,
    saveError,
    tried,
    total,
    complete,
    steps,
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

export type DrawingEntryState = ReturnType<typeof useDrawingEntryState>;

const DrawingEntryContext = createContext<DrawingEntryState | null>(null);
export const DrawingEntryProvider = DrawingEntryContext.Provider;

export function useDrawingEntry() {
  const value = useContext(DrawingEntryContext);
  if (!value) throw new Error("useDrawingEntry is used outside DrawingEntryProvider");
  return value;
}
