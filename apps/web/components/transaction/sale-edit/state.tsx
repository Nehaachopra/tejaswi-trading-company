"use client";

import type { BankMode, RouterInputs } from "@repo/trpc/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { parseAmount } from "~/lib/price";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import type { useSaleData } from "~/providers/sale";
import type { SaleForEdit } from "~/providers/sale-edit";

import { indiaDay } from "../../account/balance";
import type { Pack, ProductGroup } from "../../product/products/product-tile";
import type { Pickable } from "../pickers/ledger-picker";
import { lineFigures } from "../sale/state";
import { refOkFor } from "../shared/bank-mode";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { QrItem } from "../shared/qr-spot";
import type { GridPlace } from "../shared/split-grid";

// the stages, in order: the cart (prices only), the payment (the breakup, and what's taken now or refunded), the date
export type EditStep = "cart" | "payment" | "details";
const STEPS: EditStep[] = ["cart", "payment", "details"];

const round2 = (n: number) => Math.round(n * 100) / 100;

// one item's price with GST, as typed (it starts at the price it sold at); quantity and godowns stay as saved
export type PriceLine = { productId: string; price: string; belowCostOk: boolean };

// what the edit form reads before it opens: the sale as saved, its customer's ledger (none for a walk-in), the
// products (to name and price its items), our bank accounts, and the save
export type SaleEditInput = {
  sale: SaleForEdit;
  ledger: Pickable | null;
  products: ProductGroup[];
  banks: NonNullable<ReturnType<typeof useSaleData>["banks"]>;
  saveEdit: (input: EditSaleIn) => Promise<{ transactionId: string }>;
  saving: boolean;
  saved: boolean;
  onDiscard: () => void;
};
type EditSaleIn = RouterInputs["transactions"]["sale"]["edit"];

// everything an edit holds and works out. Made once in SaleEditEntry; every stage reads it with useSaleEdit()
export function useSaleEditState({ sale, ledger, products, banks, saveEdit, saving: editSaving, saved, onDiscard }: SaleEditInput) {
  const t = useTranslations("transactions.sale");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const router = useRouter();

  // each pack size with its product, to find an item's name, photo, saved price and GST %
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const savedLine = (id: string) => sale.lines.find((l) => l.productId === id)!;

  // the answers: each item's price (starting at what it sold at, with GST) and the day
  const [lines, setLines] = useState<PriceLine[]>(() =>
    sale.lines.map((l) => ({
      productId: l.productId,
      price: String(round2(l.rateBeforeGst * (1 + (packOf(l.productId)?.pack.gstPercent ?? 0) / 100))),
      belowCostOk: true,
    })),
  );
  const putPrice = (line: PriceLine) => setLines((all) => all.map((l) => (l.productId === line.productId ? line : l)));
  const [day, setDay] = useState(() => indiaDay(new Date(sale.dateTime)));
  // the product details card over the page: the item whose price is being changed
  const [cardFor, setCardFor] = useState<string | null>(null);

  // the cart, worked out as the server does: each item's figures, the charges and discount as saved, the total
  // rounded to the rupee
  const figures = lines.map((l) => lineFigures(parseAmount(l.price) ?? 0, savedLine(l.productId).quantity, packOf(l.productId)?.pack.gstPercent ?? 0));
  const itemsPaise = figures.reduce((a, f) => a + f.total, 0);
  const itemsTotal = itemsPaise / 100;
  const chargesPaise = Math.round((sale.transportCharges + sale.packingCharges + sale.loadingCharges) * 100);
  const grossPaise = itemsPaise + chargesPaise;
  const offPaise = Math.min(Math.round(sale.discount * 100), grossPaise);
  const figuredPaise = grossPaise - offPaise;
  const totalPaise = Math.round(figuredPaise / 100) * 100;
  const roundOff = (totalPaise - figuredPaise) / 100;
  const total = totalPaise / 100;
  const pricesOk = lines.every((l) => (parseAmount(l.price) ?? 0) > 0);

  // what the edit leaves: the new total less what was paid towards the bill; more owed (plus) or paid over (minus).
  // Cash takes it now (a walk-in all of it, a customer any part) or refunds what's paid over at once; credit leaves it
  // owed, or as their advance
  const kind = sale.kind;
  const credit = kind === "credit";
  const editPaid = sale.paid;
  const balance = round2(total - editPaid);
  const editDueLeft = Math.max(0, balance);
  const editAdvanceLeft = Math.max(0, -balance);
  const refunding = kind === "cash" && balance < 0;
  const walkIn = !sale.customer;
  // what the customer owes from before, leaving out what this sale itself still has owed on it
  const balanceNow = ledger?.balance ? (ledger.balance.today.side === "debit" ? 1 : -1) * ledger.balance.today.amount : 0;
  const oldDue = ledger?.party ? Math.max(0, round2(balanceNow - (sale.total - editPaid))) : 0;
  const dueNow = round2(oldDue + total);
  // what's received now: a customer types any part of what's left; a walk-in pays all of it; a refund gives back what's
  // paid over
  const [receivedText, setReceivedText] = useState("");
  const received = credit ? 0 : balance < 0 ? -balance : walkIn ? balance : Math.min(parseAmount(receivedText) ?? 0, balance);
  // what stays owed on the account: the old due and this bill, less what was paid and what's taken now (a refund gives
  // back only what's paid over, so the old due stays)
  const editLeft = refunding ? oldDue : Math.max(0, round2(oldDue + editDueLeft - received));

  // cash: a card each for cash and every bank account, what came in (or went out) typed
  const [gridTexts, setGridTexts] = useState<Record<string, string>>({});
  const [gridModes, setGridModes] = useState<Record<string, BankMode | null>>({});
  const [refs, setRefs] = useState<Record<string, { mode: BankMode; text: string }>>({});
  const [refLeft, setRefLeft] = useState<string[]>([]);
  const gridPlaces: GridPlace[] = ["cash", ...banks.map((b) => b.id)].map((id) => {
    const b = banks.find((x) => x.id === id);
    return {
      id,
      name: id === "cash" ? tc("cash") : b ? bankNameIn(b.bankName, locale) : "",
      sub: id === "cash" ? null : `••${b?.last4 ?? ""}`,
      held: null,
      text: gridTexts[id] ?? "",
      amount: Number(gridTexts[id]) || 0,
      mode: id === "cash" ? null : (gridModes[id] ?? null),
    };
  });
  const gridTotal = round2(gridPlaces.reduce((sum, p) => sum + p.amount, 0));
  const gridAccs = gridPlaces.filter((p) => p.id !== "cash" && p.amount > 0);
  const refOf = (id: string, mode: BankMode | null) => (mode && refs[id]?.mode === mode ? refs[id]!.text : "");
  const upiIdsOf = (id: string) => banks.find((b) => b.id === id)?.upiIds ?? [];
  // the cards add up to what's received; every account says how, with a reference that fits, and UPI has a UPI ID
  const intoOk =
    received > 0 &&
    gridTotal === received &&
    gridAccs.every((p) => p.mode !== null && refOkFor(p.mode, refOf(p.id, p.mode)) && (p.mode !== "upi" || upiIdsOf(p.id).length > 0));
  // the total changed (a price): what's received starts again; what's received changed: where it came in starts again
  useEffect(() => setReceivedText(""), [total]);
  useEffect(() => {
    setGridTexts({});
    setGridModes({});
    setRefs({});
    setRefLeft([]);
  }, [received]);
  // a QR for each account by UPI with a UPI ID of ours, inside its card
  const qrItems: QrItem[] = gridAccs
    .filter((p) => p.mode === "upi" && upiIdsOf(p.id).length > 0)
    .map((p) => ({
      key: p.id,
      title: `${p.name} ${p.sub ?? ""}`.trim(),
      upiIds: upiIdsOf(p.id),
      payee: banks.find((b) => b.id === p.id)?.accountHolderName ?? "",
      amount: p.amount,
    }));

  // when each stage is filled in; Next or Save tapped with something missing shows it in red
  const [tried, setTried] = useState(false);
  const complete: Record<EditStep, boolean> = {
    cart: total > 0 && pricesOk,
    payment: credit || balance === 0 || (received > 0 && intoOk),
    details: day !== "",
  };
  const missingOf = (s: EditStep) =>
    s === "cart"
      ? t("missing.amount")
      : s === "details"
        ? t("missing.date")
        : received === 0
          ? t("missing.received")
          : gridTotal < received
            ? t("missing.left", { amount: rupees(round2(received - gridTotal)) })
            : t("missing.into");

  // moving between stages: the phone's Back goes to the stage before
  const [at, setAt] = useState<EditStep>("cart");
  const index = STEPS.indexOf(at);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: EditStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
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
    if (!complete[at]) return guide();
    show(STEPS[index + 1]!);
  }

  // leaving with a change made asks first (not after the save, which goes back to the sale)
  const changed = day !== indiaDay(new Date(sale.dateTime)) || total !== sale.total;
  const { dialog: leaveDialog } = useLeaveGuard(!saved && changed, onDiscard);

  // the save: everything as saved, with the new prices, the day, and what moves now (cash only)
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // the server's own words only where they say what to fix; anything else a plain message
  function saveErrorOf(err: unknown) {
    const e = err as { data?: { code?: string }; message?: string };
    const code = e?.data?.code;
    return code === undefined
      ? t("errors.network")
      : code === "TOO_MANY_REQUESTS"
        ? t("errors.busy")
        : (code === "BAD_REQUEST" || code === "CONFLICT" || code === "PRECONDITION_FAILED") && e.message
          ? e.message
          : code === "NOT_FOUND"
            ? t("errors.gone")
            : t("errors.failed");
  }
  async function save() {
    if (!ready) {
      setAt(STEPS[firstOpen]!);
      return guide();
    }
    setSaving(true);
    setSaveError(null);
    const moving = received > 0;
    const input: EditSaleIn = {
      transactionId: sale.transactionId,
      saveKey,
      dateTime: momentOf(day),
      remarks: sale.remarks,
      vehicleNumber: sale.vehicleNumber,
      lines: lines.map((l, i) => {
        const s = savedLine(l.productId);
        return { productId: l.productId, quantity: s.quantity, rateBeforeGst: figures[i]!.rate / 100, belowCostOk: l.belowCostOk, godowns: s.godowns };
      }),
      discount: sale.discount,
      transportCharges: sale.transportCharges,
      packingCharges: sale.packingCharges,
      loadingCharges: sale.loadingCharges,
      kind,
      cashAmount: moving ? gridPlaces[0]!.amount : 0,
      bankParts: moving
        ? gridAccs.map((p) => ({ bankDetailsId: p.id, amount: p.amount, mode: p.mode!, referenceNumber: refOf(p.id, p.mode).trim() || null }))
        : [],
      customerLedgerId: null,
      newCustomer: null,
      // where it was billed and sent, as saved (a walk-in's typed name, phone and addresses too)
      ...(sale.customer
        ? { billToAddressId: sale.billTo && "addressId" in sale.billTo ? sale.billTo.addressId : null, shipTo: sale.shipTo }
        : {
            buyer: sale.buyer,
            shipTo: sale.shipTo,
            billToAddress: sale.billTo && "address" in sale.billTo ? sale.billTo.address : null,
          }),
    };
    try {
      const done = await saveEdit(input);
      // back to the sale in History; replace, so going back doesn't land on the form
      router.replace(`/history/${done.transactionId}`);
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
    packOf,
    savedLine,
    lines,
    figures,
    putPrice,
    cardFor,
    setCardFor,
    itemsTotal,
    roundOff,
    total,
    kind,
    credit,
    walkIn,
    editPaid,
    editDueLeft,
    editAdvanceLeft,
    editLeft,
    refunding,
    oldDue,
    dueNow,
    hasAccount: !!ledger?.party,
    received,
    receivedText,
    typeReceived: setReceivedText,
    gridPlaces,
    setGridText: (id: string, text: string) => setGridTexts((all) => ({ ...all, [id]: text })),
    setGridMode: (id: string, mode: BankMode | null) => setGridModes((all) => ({ ...all, [id]: mode })),
    gridTotal,
    upiIdsOf,
    refs,
    setRefs,
    refLeft,
    setRefLeft,
    qrItems,
    day,
    setDay,
    tried,
    complete,
    steps: STEPS,
    current: at,
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

export type SaleEditState = ReturnType<typeof useSaleEditState>;

const SaleEditContext = createContext<SaleEditState | null>(null);
export const SaleEditProvider = SaleEditContext.Provider;

export function useSaleEdit() {
  const value = useContext(SaleEditContext);
  if (!value) throw new Error("useSaleEdit is used outside SaleEditProvider");
  return value;
}
