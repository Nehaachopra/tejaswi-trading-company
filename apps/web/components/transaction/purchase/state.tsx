"use client";

import { appOfUpi, type BankMode, upiFormatOk } from "@repo/trpc/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { packLabel } from "~/lib/format";
import { parseAmount, unitsIn } from "~/lib/price";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { usePurchaseData } from "~/providers/purchase";

import { indiaDay } from "../../account/balance";
import { draftInput as partyInput, draftOk as partyOk, emptyDraft as emptyParty, type PartyDraft } from "../../account/party/party-fields";
import { useSameNameConfirm } from "../../account/party/same-name";
import type { Pack, ProductGroup } from "../../product/products/product-tile";
import { productTitle } from "../../product/products/product-tile";
import type { LedgerChoice } from "../pickers/ledger-picker";
import { usePhoneMatches } from "../pickers/party-finder";
import { lineFigures, type OrderLine } from "../order/new/state";
import { refOkFor } from "../shared/bank-mode";
import { type QrItem } from "../shared/qr-spot";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";

// the cards, in order: the cart, the amount (charges, a cash discount), cash or credit, who it's from, what's paid now
// (cash) or the credit period (credit), the supplier's bill, then the vehicle, remarks and Save
export type PurchaseStep = "products" | "amount" | "money" | "supplier" | "paid" | "bill" | "details";
const STEPS: PurchaseStep[] = ["products", "amount", "money", "supplier", "paid", "bill", "details"];

const round2 = (n: number) => Math.round(n * 100) / 100;

// the supplier's own bill number: up to 16 letters, digits, / and -, as GST allows (as the server checks it)
export const BILL_NUMBER_MAX = 16;
export const billNumberOk = (v: string) => /^[A-Z0-9/-]{1,16}$/.test(v);

// one pack size in the cart, as a purchase order's line: the cost per unit with GST, the cost before GST and with GST
// (each fills the others; `from` is the one typed last), how many, and how many go into each godown
export type CartLine = OrderLine & { godowns: Record<string, string> };

// a godown and how many of a pack size it holds now, and whether it's being counted (locked)
export type GodownSpot = { godownId: string; name: string; held: number; counting: boolean };

// the godowns' parts of a line, as numbers
export const placedOf = (line: Pick<CartLine, "godowns">) => Object.values(line.godowns).reduce((a, v) => a + (Number(v) || 0), 0);

// everything the purchase form holds and works out. Made once in PurchaseEntry; every card reads it with
// usePurchaseEntry()
export function usePurchaseEntryState({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const t = useTranslations("transactions.purchase");
  const ts = useTranslations("transactions.sale");
  const tc = useTranslations("transactions.chat");
  const tpf = useTranslations("transactions.payment.form");
  const locale = useLocale();
  const router = useRouter();
  const sameName = useSameNameConfirm();
  const { products, categories, godowns, stock, sources, loading, loadFailed, retryLoad, savePurchase, saving: creating, saved } = usePurchaseData();

  // the answers
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [freight, setFreight] = useState("");
  const [packing, setPacking] = useState("");
  const [loadingCharges, setLoadingCharges] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [kind, setKind] = useState<"cash" | "credit" | null>(null);
  // the supplier, searched and picked, or someone new (their details typed on the card); a picked one's details
  // changed here (the admin's)
  const [supplier, setSupplier] = useState<LedgerChoice>(null);
  const [newSupplier, setNewSupplier] = useState<PartyDraft>(() => emptyParty());
  const [editingSupplier, setEditingSupplier] = useState(false);
  // cash: what's paid now (any part of the bill), whether an advance with them is set off, and each place's part
  const [paidText, setPaidText] = useState("");
  // an advance they hold is set off against what's owed unless switched off
  const [setOffOn, setSetOffOn] = useState(true);
  const [typedSplit, setTypedSplit] = useState<Record<string, string> | null>({});
  const [bankModes, setBankModes] = useState<Record<string, BankMode | null>>({});
  const [bankRefs, setBankRefs] = useState<Record<string, string>>({});
  const [refLeft, setRefLeft] = useState<string[]>([]);
  // credit: days until it's due (none: no set period)
  const [creditDays, setCreditDays] = useState("");
  // the supplier's bill: its number, its day (which dates the purchase) and its photo or PDF, when attached now
  const [billNumber, setBillNumber] = useState("");
  const [billDay, setBillDay] = useState("");
  const [billUrl, setBillUrl] = useState<string | null>(null);
  const [billBusy, setBillBusy] = useState(false);
  // the vehicle the goods came in and remarks
  const [vehicle, setVehicle] = useState("");
  const [remarks, setRemarks] = useState("");
  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saveError, setSaveError] = useState<string | null>(null);
  // Next or Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);

  // each pack size with its product, to find a line's name, photo and GST %
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products ?? []) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const nameOf = (id: string) => {
    const p = packOf(id);
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode, p.pack.packCount)}` : "";
  };
  // a pack size can be bought once it has a GST %
  const buyable = (p: Pack) => p.gstPercent != null;
  // every active godown, with how many of a pack size it holds now
  const spotsOf = (productId: string): GodownSpot[] =>
    (godowns ?? []).map((g) => {
      const held = stock?.find((s) => s.godownId === g.id)?.products.flatMap((p) => p.packs).find((p) => p.productId === productId)?.quantity ?? 0;
      return { godownId: g.id, name: g.godownName, held, counting: g.beingCounted };
    });

  // the cart, worked out
  const figures = lines.map((l) => {
    const p = packOf(l.productId)?.pack;
    return lineFigures(l, p ? unitsIn(p) : 1, p?.gstPercent ?? null);
  });
  const itemsPaise = figures.reduce((a, f) => a + f.total, 0);
  const itemsTotal = itemsPaise / 100;
  const paise = (v: string) => Math.round((parseAmount(v) ?? 0) * 100);
  // the charges, each typed with GST in it (taken out at the highest GST rate among the items, as the server does)
  const chargesPaise = paise(freight) + paise(packing) + paise(loadingCharges) + paise(otherCharges);
  // the bill before the cash discount, the discount (never more than the bill), then the total rounded to the rupee
  // (the difference is Round off)
  const grossPaise = itemsPaise + chargesPaise;
  const offPaise = Math.min(paise(discount), grossPaise);
  const figuredPaise = grossPaise - offPaise;
  const totalPaise = Math.round(figuredPaise / 100) * 100;
  const roundOff = (totalPaise - figuredPaise) / 100;
  const total = totalPaise / 100;

  // change the cart: put one in (or change it, from the product card), or take it out
  const putLine = (line: CartLine) =>
    setLines((all) => (all.some((l) => l.productId === line.productId) ? all.map((l) => (l.productId === line.productId ? line : l)) : [...all, line]));
  const removeLine = (productId: string) => setLines((all) => all.filter((l) => l.productId !== productId));
  // the product card over the page: the pack size being added or changed
  const [cardFor, setCardFor] = useState<string | null>(null);

  // the supplier picked: their ledger, what we owe them from before (their account in credit) and an advance already
  // with them (in debit: we paid before the goods came). Staff see no balances, so neither is worked out for them
  const picked = supplier?.kind === "ledger" ? supplier.ledger : null;
  const pickedId = picked?.id ?? null;
  const oldDue = picked?.balance?.today.side === "credit" ? picked.balance.today.amount : 0;
  const heldAdvance = picked?.balance?.today.side === "debit" ? picked.balance.today.amount : 0;
  const setOff = kind === "cash" && setOffOn ? Math.min(heldAdvance, total) : 0;
  // what's left of this bill after the advance, and all that's due with the older dues
  const billLeft = round2(total - setOff);
  const dueNow = round2(oldDue + billLeft);
  // what's paid now: any part of what's due or more. It goes to the older dues first, then this bill; anything past
  // both is an advance with them, when their balance is known: a new supplier's is (nothing owed yet), staff don't see
  // one of ours
  const paid = parseAmount(paidText) ?? 0;
  const towardsOld = Math.min(paid, oldDue);
  const towardsBill = Math.min(round2(paid - towardsOld), billLeft);
  const balanceKnown = supplier?.kind === "party" || !!picked?.balance;
  const advance = balanceKnown && paid > dueNow ? round2(paid - dueNow) : 0;
  const dueLeft = Math.max(0, round2(dueNow - paid));
  // an advance in it: asked once before going on ("Did you pay ₹X as advance?"); asked again if the advance changes
  const [advanceOk, setAdvanceOk] = useState<number | null>(null);
  const [askingAdvance, setAskingAdvance] = useState<((go: boolean) => void) | null>(null);
  function confirmAdvance() {
    if (kind !== "cash" || advance <= 0 || advanceOk === advance) return Promise.resolve(true);
    return new Promise<boolean>((answer) =>
      setAskingAdvance(() => (go: boolean) => {
        setAskingAdvance(null);
        if (go) setAdvanceOk(advance);
        answer(go);
      }),
    );
  }
  // someone else picked: what's paid starts again
  useEffect(() => {
    setPaidText("");
    setSetOffOn(true);
    setTypedSplit({});
  }, [pickedId]);

  // credit: a new supplier's phone that someone already has shows them instead
  const matches = usePhoneMatches(newSupplier.phone, "customer");
  const matched = supplier?.kind === "party" && matches.length > 0 ? matches[0]! : null;

  // cash: a card each for cash and every bank account, each never more than it holds (staff don't see it, so it isn't
  // checked here; the server does)
  const cashHeld = sources?.cash ?? null;
  const placeList = [
    { id: "cash", held: cashHeld },
    ...(sources?.banks ?? []).map((b) => ({ id: b.id, held: b.available })),
  ];
  const autoSplit = (() => {
    let need = paid;
    return Object.fromEntries(
      placeList.map((p) => {
        const take = round2(Math.max(0, Math.min(p.held ?? Infinity, need)));
        need = round2(need - take);
        return [p.id, take > 0 ? String(take) : ""];
      }),
    );
  })();
  const split = typedSplit ?? autoSplit;
  const places = placeList.map((p) => {
    const b = sources?.banks.find((x) => x.id === p.id);
    return {
      id: p.id,
      name: p.id === "cash" ? tc("cash") : b ? bankNameIn(b.bankName, locale) : "",
      sub: p.id === "cash" ? null : `••${b?.last4 ?? ""}`,
      held: p.held,
      text: split[p.id] ?? "",
      amount: Number(split[p.id]) || 0,
      mode: p.id === "cash" ? null : (bankModes[p.id] ?? null),
    };
  });
  const splitTotal = round2(places.reduce((sum, p) => sum + p.amount, 0));
  // the most that can be paid now: what cash and every bank account hold together (unknown to staff: the server checks)
  const payCap = places.every((p) => p.held !== null) ? round2(places.reduce((sum, p) => sum + Math.max(0, p.held!), 0)) : null;
  const placesUsed = places.filter((p) => p.amount > 0);
  const bankIdsUsed = placesUsed.filter((p) => p.id !== "cash").map((p) => p.id);
  // the cards add up to what's paid, none past what it holds, and every account says how it paid
  const splitOk =
    splitTotal === paid &&
    places.every((p) => p.held === null || p.amount <= p.held) &&
    bankIdsUsed.every((id) => !!bankModes[id] && refOkFor(bankModes[id]!, bankRefs[id] ?? ""));
  function setSplit(id: string, text: string) {
    setTypedSplit((was) => ({ ...(was ?? autoSplit), [id]: text }));
  }

  // an account paying by UPI, as in a payment: the supplier's UPI ID (the one saved on them, or typed for a new one)
  // fills the box; with none, it's asked in the card (it may be left empty), and a new one is kept on them with the
  // purchase. Once there's one, each card paying by UPI shows the supplier's QR, the ID above it with a pen
  const savedUpis = (picked ? (picked.party?.upiIds ?? []) : newSupplier.upiIds.map((u) => u.upiId.trim())).map((u) => u.toLowerCase()).filter((u) => upiFormatOk(u));
  const [typedUpi, setTypedUpi] = useState("");
  const [upiLeft, setUpiLeft] = useState(false);
  const [upiEditing, setUpiEditing] = useState(false);
  const typedUpiShapeOk = upiFormatOk(typedUpi.trim());
  // one saved on them is taken as it is; a typed one must have a handle a UPI app gives out
  const typedUpiOk = typedUpiShapeOk && (appOfUpi(typedUpi) !== null || savedUpis.includes(typedUpi.trim().toLowerCase()));
  const asksUpi = kind === "cash" && !!supplier && bankIdsUsed.some((id) => bankModes[id] === "upi");
  // kept: saved on them, or typed and Saved; the box then goes, and the ID shows above the QR with its pen
  const upiKept = !upiEditing && typedUpiOk && (upiLeft || savedUpis.includes(typedUpi.trim().toLowerCase()));
  // another supplier, or their saved UPI IDs changed: the box starts with their saved one, or empty
  const savedUpiKey = `${pickedId ?? supplier?.kind ?? ""}|${savedUpis.join()}`;
  useEffect(() => {
    setTypedUpi(savedUpis[0] ?? "");
    setUpiLeft(false);
    setUpiEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the supplier or their saved UPI IDs change
  }, [savedUpiKey]);
  // a QR in each card paying by UPI, for the supplier's UPI ID
  const supplierName = picked ? (picked.party?.name ?? picked.name) : newSupplier.name.trim();
  const qrItems: QrItem[] =
    !asksUpi || !typedUpiOk
      ? []
      : placesUsed
          .filter((p) => p.mode === "upi")
          .map((p) => ({ key: p.id, title: `${p.name} ${p.sub ?? ""}`.trim(), upiIds: [typedUpi.trim().toLowerCase()], payee: supplierName, amount: p.amount }));
  // Auto switched off by hand empties every card, as a payment's
  const setSplitAuto = (on: boolean) => setTypedSplit(on ? null : {});
  // what's paid changed: the cards start again
  function typePaid(text: string) {
    setPaidText(text);
    setTypedSplit((was) => (was === null ? null : {}));
  }

  // when each card is filled in
  const linesOk =
    lines.length > 0 &&
    lines.every((l) => {
      const q = Number(l.quantity) || 0;
      return (parseAmount(l[l.from]) ?? 0) > 0 && q >= 1 && placedOf(l) === q;
    });
  const complete: Record<PurchaseStep, boolean> = {
    products: linesOk,
    amount: total > 0,
    money: kind !== null,
    supplier:
      (supplier?.kind === "ledger" && !!supplier.ledger.party?.city) ||
      (supplier?.kind === "party" && !matched && partyOk(newSupplier, true)),
    // cash: something paid (or the advance set off), placed in full; credit: a period or none
    paid: kind === "credit" ? creditDays === "" || Number(creditDays) <= 365 : (paid > 0 || setOff > 0) && (payCap === null || paid <= payCap) && (paid === 0 || splitOk),
    bill: billNumberOk(billNumber) && billDay !== "" && !billBusy,
    details: true,
  };
  const [at, setAt] = useState<PurchaseStep>("products");
  const current = at;
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: PurchaseStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  // phones: the summary folded into a bar above the card
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the phone's Back goes to the card before
  const remember = useCardHistory<PurchaseStep>("products", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: PurchaseStep) {
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
  async function next() {
    if (!complete[current]) return guide();
    // what's paid leaves an advance: they say it's one before going on
    if (current === "paid" && !(await confirmAdvance())) return;
    show(STEPS[index + 1]!);
  }
  // cash or credit picked: either moves straight on to the supplier (a chip-only card)
  function pickKind(next: "cash" | "credit") {
    if (next !== kind) {
      setKind(next);
      setPaidText("");
      setTypedSplit({});
      setSetOffOn(true);
    }
    show("supplier");
  }

  // what the card still needs, once Next or Save was tapped
  const missingOf = (s: PurchaseStep) =>
    s === "products"
      ? lines.length === 0
        ? ts("missing.products")
        : ts("missing.lines")
      : s === "amount"
        ? ts("missing.amount")
        : s === "money"
          ? ts("missing.kind")
          : s === "supplier"
            ? supplier?.kind === "ledger"
              ? t("noAddress")
              : t("missing.supplier")
            : s === "paid"
              ? kind === "credit"
                ? t("missing.creditDays")
                : paid === 0 && setOff === 0
                  ? t("missing.paid")
                  : splitTotal < paid
                      ? t("missing.left", { amount: round2(paid - splitTotal).toLocaleString("en-IN") })
                      : t("missing.into")
              : s === "bill"
                ? !billNumberOk(billNumber)
                  ? t("missing.billNumber")
                  : billDay === ""
                    ? t("missing.billDate")
                    : t("missing.billUpload")
                : "";

  // leaving with something entered asks first (not after a save, which goes on to its own page)
  const { dialog: leaveDialog } = useLeaveGuard(!saved && lines.length > 0, onDiscard);

  // Save tapped and still working: the button says so and can't be tapped again
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!ready) {
      setAt(STEPS[firstOpen]!);
      return guide();
    }
    // someone new with the same name in the same town as one already added: asked first
    if (supplier?.kind === "party" && !(await sameName.confirm(newSupplier))) return;
    // an advance not yet said to be one (the amount changed after Next): asked here too
    if (!(await confirmAdvance())) return;
    setSaving(true);
    setSaveError(null);
    try {
      const purchase = await savePurchase({
        saveKey,
        dateTime: momentOf(billDay),
        supplierLedgerId: supplier?.kind === "ledger" ? supplier.ledger.id : null,
        newSupplier: supplier?.kind === "party" ? partyInput(newSupplier) : null,
        supplierInvoiceNumber: billNumber,
        lines: lines.map((l, i) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          rateBeforeGst: figures[i]!.rate / 100,
          godowns: Object.entries(l.godowns)
            .filter(([, v]) => (Number(v) || 0) > 0)
            .map(([godownId, v]) => ({ godownId, quantity: Number(v) })),
        })),
        freightCharges: paise(freight) / 100,
        packingCharges: paise(packing) / 100,
        loadingCharges: paise(loadingCharges) / 100,
        otherCharges: paise(otherCharges) / 100,
        discount: offPaise / 100,
        kind: kind!,
        ...(kind === "cash"
          ? {
              cashAmount: places[0]!.amount,
              advanceSetOff: setOff > 0,
              bankParts: placesUsed
                .filter((p) => p.id !== "cash")
                .map((p) => ({ bankDetailsId: p.id, amount: p.amount, mode: bankModes[p.id]!, referenceNumber: (bankRefs[p.id] ?? "").trim() || null })),
              supplierUpiId: asksUpi && typedUpiOk && !savedUpis.includes(typedUpi.trim().toLowerCase()) ? typedUpi.trim().toLowerCase() : null,
            }
          : { creditPeriodDays: creditDays === "" ? null : Number(creditDays) }),
        vehicleNumber: vehicle || null,
        remarks: remarks.trim() || null,
        invoiceUrl: billUrl,
      });
      // on to its success page; replace, so going back doesn't land on the filled form
      router.replace(`/transaction/purchase/${purchase.transactionId}`);
    } catch (err) {
      setSaving(false);
      const e = err as { data?: { code?: string }; message?: string };
      const code = e?.data?.code;
      setSaveError(
        code === undefined
          ? ts("errors.network")
          : code === "TOO_MANY_REQUESTS"
            ? ts("errors.busy")
            : // the server's own words where they say what to fix (more than cash holds, a godown being counted ...)
              (code === "BAD_REQUEST" || code === "CONFLICT" || code === "PRECONDITION_FAILED") && e.message
              ? e.message
              : code === "NOT_FOUND"
                ? t("errors.gone")
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
    isAdmin,
    loading,
    loadFailed,
    retryLoad,
    products: products ?? [],
    categories: categories ?? [],
    packOf,
    nameOf,
    buyable,
    spotsOf,
    lines,
    figures,
    putLine,
    removeLine,
    cardFor,
    setCardFor,
    itemsTotal,
    discount,
    setDiscount,
    freight,
    setFreight,
    packing,
    setPacking,
    loadingCharges,
    setLoadingCharges,
    otherCharges,
    setOtherCharges,
    grossTotal: grossPaise / 100,
    roundOff,
    total,
    kind,
    pickKind,
    supplier,
    setSupplier,
    newSupplier,
    setNewSupplier,
    editingSupplier,
    setEditingSupplier,
    matched,
    oldDue,
    dueNow,
    towardsOld,
    towardsBill,
    advance,
    askingAdvance,
    heldAdvance,
    setOffOn,
    setSetOffOn,
    setOff,
    billLeft,
    paid,
    paidText,
    typePaid,
    dueLeft,
    places,
    splitTotal,
    payCap,
    setSplit,
    splitAuto: typedSplit === null,
    setSplitAuto,
    bankModes,
    setBankModes,
    bankRefs,
    setBankRefs,
    asksUpi,
    upiKept,
    qrItems,
    upiId: { typed: typedUpi, setTyped: setTypedUpi, shapeOk: typedUpiShapeOk, ok: typedUpiOk, left: upiLeft, setLeft: setUpiLeft, editing: upiEditing, setEditing: setUpiEditing, tried },
    refLeft,
    setRefLeft,
    creditDays,
    setCreditDays,
    billNumber,
    setBillNumber,
    billDay,
    setBillDay,
    billUrl,
    setBillUrl,
    billBusy,
    setBillBusy,
    vehicle,
    setVehicle,
    remarks,
    setRemarks,
    sameNameDialog: sameName.dialog,
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
    saveError,
    saving: saving || creating,
    save,
    today: indiaDay(new Date()),
  };
}

export type PurchaseEntryState = ReturnType<typeof usePurchaseEntryState>;

const PurchaseEntryContext = createContext<PurchaseEntryState | null>(null);
export const PurchaseEntryProvider = PurchaseEntryContext.Provider;

export function usePurchaseEntry() {
  const value = useContext(PurchaseEntryContext);
  if (!value) throw new Error("usePurchaseEntry is used outside PurchaseEntryProvider");
  return value;
}
