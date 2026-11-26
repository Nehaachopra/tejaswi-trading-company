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
import {
  type AddressDraft,
  draftInput as partyInput,
  draftOk as partyOk,
  emptyAddress,
  emptyDraft as emptyParty,
  type PartyDraft,
} from "../../account/party/party-fields";
import type { StateCode } from "../../account/party/party-kinds";
import type { Pack, ProductGroup } from "../../product/products/product-tile";
import type { LedgerChoice, Pickable } from "../pickers/ledger-picker";
import { usePhoneMatches } from "../pickers/party-finder";
import { tdsOn } from "../receipt/shared";
import { lineFigures, SALE_TDS_RATE } from "../sale/state";
import { refOkFor } from "../shared/bank-mode";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { QrItem } from "../shared/qr-spot";
import type { GridPlace } from "../shared/split-grid";

// the stages, in order, as a sale's: the cart (prices only), cash or credit, the customer (only a walk-in put on
// credit), the payment (cash) or the due (credit), then the date
export type EditStep = "cart" | "money" | "customer" | "payment" | "details";

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

// a walk-in put on credit, as a new customer: the sale's name and phone, and its typed addresses (billed at the first,
// sent to the second when it went elsewhere); the short name is left to type
export function walkInParty(sale: SaleForEdit): PartyDraft {
  const typed = (p: SaleForEdit["shipTo"] | null): AddressDraft | null =>
    p && "address" in p
      ? {
          ...emptyAddress(true),
          addressLine1: p.address.addressLine1,
          landmark: p.address.landmark,
          city: p.address.city,
          district: p.address.district,
          state: p.address.state,
          stateCode: p.address.stateCode as StateCode,
          postalCode: p.address.postalCode,
          gstin: p.address.gstin ?? "",
        }
      : null;
  const bill = typed(sale.billTo);
  const ship = typed(sale.shipTo);
  const same = bill && ship && JSON.stringify({ ...bill, key: "" }) === JSON.stringify({ ...ship, key: "" });
  const addresses = [bill ?? ship, !same && bill ? ship : null].filter((a): a is AddressDraft => a !== null);
  return {
    ...emptyParty(),
    name: sale.buyer?.name ?? "",
    phone: sale.buyer?.phone ?? "",
    ...(addresses.length > 0 ? { addresses: addresses.map((a, i) => ({ ...a, isDefault: i === 0 })) } : {}),
  };
}

// everything an edit holds and works out. Made once in SaleEditEntry; every stage reads it with useSaleEdit()
export function useSaleEditState({ sale, ledger, products, banks, saveEdit, saving: editSaving, saved, onDiscard }: SaleEditInput) {
  const t = useTranslations("transactions.sale");
  const tc = useTranslations("transactions.chat");
  // (the due stage's words are a purchase's)
  const tp = useTranslations("transactions.purchase");
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
  // the prices it opened with: none changed (and still cash or credit as saved) means nothing about the money changes,
  // so Next on the cart goes straight to the details
  const [startLines] = useState(lines);
  const pricesChanged = lines.some((l, i) => parseAmount(l.price) !== parseAmount(startLines[i]!.price));
  const [day, setDay] = useState(() => indiaDay(new Date(sale.dateTime)));
  // the vehicle it went in (as saved, until changed)
  const [vehicle, setVehicle] = useState(sale.vehicleNumber ?? "");
  const vehicleChanged = vehicle !== (sale.vehicleNumber ?? "");
  // the product details card over the page: the item whose price is being changed
  const [cardFor, setCardFor] = useState<string | null>(null);

  // the cart, worked out as the server does: each item's figures, the charges and discount as saved, the total
  // rounded to the rupee
  // (a price left as it was keeps the rate it was saved at, to the paisa)
  const figures = lines.map((l, i) => {
    const quantity = savedLine(l.productId).quantity;
    const gst = packOf(l.productId)?.pack.gstPercent ?? 0;
    if (parseAmount(l.price) !== parseAmount(startLines[i]!.price)) return lineFigures(parseAmount(l.price) ?? 0, quantity, gst);
    const rate = Math.round(savedLine(l.productId).rateBeforeGst * 100);
    const value = rate * quantity;
    const tax = Math.round((value * gst) / 100);
    return { rate, value, tax, total: value + tax };
  });
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

  // cash or credit (as saved, until changed), and credit's period (as saved; 30 days for a cash sale put on credit)
  const [kind, setKind] = useState<"cash" | "credit">(sale.kind);
  const credit = kind === "credit";
  const [creditDays, setCreditDays] = useState(() =>
    sale.kind === "credit" ? (sale.creditPeriodDays === null ? "" : String(sale.creditPeriodDays)) : "30",
  );
  const walkIn = !sale.customer;
  // a walk-in put on credit needs a customer: one of ours picked, or added now with the sale's name, phone and
  // addresses filled in
  const [customer, setCustomer] = useState<LedgerChoice>(null);
  const [newParty, setNewParty] = useState<PartyDraft>(() => walkInParty(sale));
  const [editingCustomer, setEditingCustomer] = useState(false);
  const needsCustomer = walkIn && credit;
  const picked = needsCustomer && customer?.kind === "ledger" ? customer.ledger : null;
  // a new customer's phone that one of ours already has shows them instead
  const matches = usePhoneMatches(needsCustomer && customer?.kind === "party" ? newParty.phone : "", "customer");
  const matched = matches[0] ?? null;

  // what the edit leaves: the new total less what was paid towards the bill; more owed (plus) or paid over (minus).
  // Cash takes it now (a walk-in all of it, a customer any part) or refunds what's paid over at once; credit leaves it
  // owed, or as their advance
  const editPaid = sale.paid;
  const balance = round2(total - editPaid);
  const editDueLeft = Math.max(0, balance);
  const editAdvanceLeft = Math.max(0, -balance);
  const refunding = kind === "cash" && balance < 0;
  // what the customer owes from before: the sale's own customer, leaving out what this sale itself still has owed on
  // it; a customer picked now (a walk-in put on credit), all they owe
  const balanceOf = (l: Pickable | null) => (l?.balance ? (l.balance.today.side === "debit" ? 1 : -1) * l.balance.today.amount : 0);
  const oldDue = ledger?.party
    ? Math.max(0, round2(balanceOf(ledger) - (sale.total - editPaid)))
    : picked?.party
      ? Math.max(0, balanceOf(picked))
      : 0;
  // a customer's cash with something left to receive, as a cash sale's: an advance of theirs (their account besides this
  // bill, in credit) set off unless switched off, the TDS they deducted (a switch) and their PAN when none is saved
  const tdsCan = kind === "cash" && !walkIn && balance > 0;
  const heldAdvance = tdsCan && ledger?.party ? Math.max(0, round2(-(balanceOf(ledger) - (sale.total - editPaid)))) : 0;
  const [setOffOn, setSetOffOn] = useState(true);
  const setOff = tdsCan && setOffOn ? Math.min(heldAdvance, editDueLeft) : 0;
  const [tdsOnIt, setTdsOnIt] = useState(false);
  const tdsIs = tdsCan && tdsOnIt;
  const [pan, setPan] = useState("");
  const panNeeded = tdsIs && !ledger?.party?.hasPan;
  const panOk = !panNeeded || /^[A-Z]{5}\d{4}[A-Z]$/.test(pan);
  // the most they can pay now: what's left of this bill (less the advance set off) and all they owe from before
  const most = round2(editDueLeft - setOff + oldDue);
  const dueNow = round2(oldDue + total - setOff);
  // credit: what they'll owe after this bill (what was paid towards it taken off)
  const creditDue = Math.max(0, round2(oldDue + balance));
  // what's received now: a customer types any part of what's left; a walk-in pays all of it. A refund pays back what's
  // paid over: a customer's typed (any part, the rest stays as their advance), a walk-in's all of it
  const [receivedText, setReceivedText] = useState("");
  const typed = parseAmount(receivedText) ?? 0;
  const received = credit ? 0 : balance < 0 ? (walkIn ? -balance : Math.min(typed, -balance)) : walkIn ? balance : Math.min(typed, most);
  // the TDS on what came in (a paisa off the bill or all they owe from rounding taken as exactly that), and what it
  // settles; it goes to the older dues first, then this bill
  let tdsAmount = tdsIs && received > 0 ? tdsOn(received, SALE_TDS_RATE) : 0;
  if (tdsIs && received > 0)
    for (const target of [round2(editDueLeft - setOff), most]) if (Math.abs(round2(received + tdsAmount) - target) < 0.015) tdsAmount = round2(target - received);
  const settles = round2(received + tdsAmount);
  const towardsOld = tdsCan ? Math.min(settles, oldDue) : 0;
  const towardsBill = tdsCan ? Math.min(round2(settles - towardsOld), round2(editDueLeft - setOff)) : 0;
  // what stays owed on the account: the old due and this bill, less what was paid, the advance set off and what's
  // settled now (a refund gives back only what's paid over, so the old due stays)
  const editLeft = refunding ? oldDue : Math.max(0, round2(oldDue + editDueLeft - setOff - settles));
  // a customer's refund of only part of what was paid over: the rest stays as their advance
  const refundAdvanceLeft = refunding ? Math.max(0, round2(-balance - received)) : 0;

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
  // the total (a price) or cash or credit changed: what's received starts again; what's received changed: where it came
  // in starts again
  useEffect(() => setReceivedText(""), [total, kind]);
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
  const untouched = !pricesChanged && kind === sale.kind;
  const [jumped, setJumped] = useState(false);
  const complete: Record<EditStep, boolean> = {
    cart: total > 0 && pricesOk,
    money: true,
    customer: !needsCustomer || customer?.kind === "ledger" || (customer?.kind === "party" && !matched && partyOk(newParty, true)),
    // credit: its period never more than 365 days
    // (nothing about the money changed: nothing to take now)
    payment: untouched || (credit ? creditDays === "" || Number(creditDays) <= 365 : balance === 0 || (((received > 0 && intoOk) || (received === 0 && setOff > 0)) && panOk)),
    details: day !== "",
  };
  const missingOf = (s: EditStep) =>
    s === "cart"
      ? t("missing.amount")
      : s === "details"
        ? t("missing.date")
        : s === "customer"
          ? t("missing.customer")
          : credit
            ? tp("missing.creditDays")
            : refunding && received === 0
              ? tp("missing.paid")
              : received === 0 && setOff === 0
              ? t("missing.received")
              : !panOk
                ? t("missing.pan")
              : gridTotal < received
                ? t("missing.left", { amount: rupees(round2(received - gridTotal)) })
                : t("missing.into");

  // moving between stages: the phone's Back goes to the stage before
  const STEPS: EditStep[] = ["cart", "money", ...(needsCustomer ? (["customer"] as const) : []), "payment", "details"];
  const [at, setAt] = useState<EditStep>("cart");
  const current = STEPS.includes(at) ? at : "money";
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  // (a stage skipped can't be opened from the summary)
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
    // the cart as it was: straight to the details (Back comes back to the cart)
    if (current === "cart" && untouched) {
      setJumped(true);
      return show("details");
    }
    setJumped(false);
    show(STEPS[index + 1]!);
  }
  // Back: the stage before (from the details after the cart was left as it was: the cart)
  function back() {
    show(current === "details" && jumped && untouched ? "cart" : STEPS[index - 1]!);
  }
  // cash or credit picked: moves straight on (a chip-only stage); a walk-in put on credit starts its customer afresh
  function pickKind(k: "cash" | "credit") {
    if (k !== kind) {
      setKind(k);
      setCustomer(null);
      setNewParty(walkInParty(sale));
      setEditingCustomer(false);
    }
    show(walkIn && k === "credit" ? "customer" : "payment");
  }

  // leaving with a change made asks first (not after the save, which goes on to its success card)
  const changed = day !== indiaDay(new Date(sale.dateTime)) || total !== sale.total || kind !== sale.kind || vehicleChanged;
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
    // nothing changed (prices, cash or credit, the date): nothing saved, no edit recorded; straight back to the sale
    if (untouched && day === indiaDay(new Date(sale.dateTime)) && !vehicleChanged) {
      router.replace(`/history/${sale.transactionId}`);
      return;
    }
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
      vehicleNumber: vehicle.trim() || null,
      lines: lines.map((l, i) => {
        const s = savedLine(l.productId);
        return { productId: l.productId, quantity: s.quantity, rateBeforeGst: figures[i]!.rate / 100, belowCostOk: l.belowCostOk, godowns: s.godowns };
      }),
      discount: sale.discount,
      transportCharges: sale.transportCharges,
      packingCharges: sale.packingCharges,
      loadingCharges: sale.loadingCharges,
      kind,
      creditPeriodDays: credit && creditDays !== "" ? Number(creditDays) : null,
      cashAmount: moving && !credit ? gridPlaces[0]!.amount : 0,
      bankParts:
        moving && !credit
          ? gridAccs.map((p) => ({ bankDetailsId: p.id, amount: p.amount, mode: p.mode!, referenceNumber: refOf(p.id, p.mode).trim() || null }))
          : [],
      // a walk-in put on credit: the customer picked or added now (billed and sent to their own address)
      tdsDeducted: tdsIs && received > 0,
      advanceSetOff: setOff > 0,
      customerPan: panNeeded ? pan : null,
      customerLedgerId: needsCustomer && customer?.kind === "ledger" ? customer.ledger.id : null,
      newCustomer: needsCustomer && customer?.kind === "party" ? partyInput(newParty) : null,
      // otherwise where it was billed and sent, as saved (a walk-in's typed name, phone and addresses too)
      ...(sale.customer
        ? { billToAddressId: sale.billTo && "addressId" in sale.billTo ? sale.billTo.addressId : null, shipTo: sale.shipTo }
        : needsCustomer
          ? {}
          : {
              buyer: sale.buyer,
              shipTo: sale.shipTo,
              billToAddress: sale.billTo && "address" in sale.billTo ? sale.billTo.address : null,
            }),
    };
    try {
      const done = await saveEdit(input);
      // on to its success card; replace, so going back doesn't land on the form
      router.replace(`/history/${done.transactionId}/edit/done`);
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
    pickKind,
    creditDays,
    setCreditDays,
    creditDue,
    walkIn,
    customer,
    setCustomer,
    newParty,
    setNewParty,
    editingCustomer,
    setEditingCustomer,
    matched,
    setTried,
    editPaid,
    editDueLeft,
    editAdvanceLeft,
    refundAdvanceLeft,
    editLeft,
    refunding,
    oldDue,
    dueNow,
    hasAccount: !!ledger?.party || !!picked?.party,
    received,
    receivedText,
    tdsCan,
    tdsOnIt: tdsIs,
    flipTds: setTdsOnIt,
    tdsAmount,
    settles,
    towardsOld,
    towardsBill,
    pan,
    setPan,
    panNeeded,
    heldAdvance,
    setOffOn,
    setSetOffOn,
    setOff,
    most,
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
    vehicle,
    setVehicle,
    setDay,
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
    back,
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
