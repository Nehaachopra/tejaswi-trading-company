"use client";

import type { BankMode } from "@repo/trpc/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";

import { bankNameIn } from "~/lib/bank-names";
import { packLabel, rupees } from "~/lib/format";
import { parseAmount } from "~/lib/price";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { useSaleData } from "~/providers/sale";

import { indiaDay } from "../../account/balance";

import {
  addressProblems,
  type AddressDraft,
  draftInput as partyInput,
  draftOk as partyOk,
  emptyAddress,
  emptyDraft as emptyParty,
  type PartyDraft,
} from "../../account/party/party-fields";
import { type StateCode } from "../../account/party/party-kinds";
import { useSameNameConfirm } from "../../account/party/same-name";
import type { Pack, ProductGroup } from "../../product/products/product-tile";
import { productTitle } from "../../product/products/product-tile";
import type { LedgerChoice } from "../pickers/ledger-picker";
import { usePhoneMatches } from "../pickers/party-finder";
import { refOkFor } from "../shared/bank-mode";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { QrItem } from "../shared/qr-spot";
import type { GridPlace } from "../shared/split-grid";

// the cards, in order: the cart, the amount (charges and a cash discount), cash or credit (and where cash came into),
// who bought it, then the day, remarks and Save
export type SaleStep = "products" | "amount" | "money" | "customer" | "details";
const STEPS: SaleStep[] = ["products", "amount", "money", "customer", "details"];

// a cash sale's taxable value from which the buyer's name and phone are needed (GST rule 46), as the server checks it
export const NAMED_BUYER_FROM = 50_000;

// one pack size in the cart: a new price with GST ("" keeps its saved price), how many, and how many leave each godown
export type CartLine = { productId: string; newPrice: string; quantity: string; godowns: Record<string, string> };

// a godown holding a pack size: its name, how many it has, and whether it's being counted (locked)
export type GodownHold = { godownId: string; name: string; held: number; counting: boolean };

// a line's figures in paise, as the server works them out: the rate before GST from the price with GST, its value, the
// GST on it and its total
export function lineFigures(priceGst: number, quantity: number, gstPercent: number) {
  const rate = Math.round((priceGst * 100 * 100) / (100 + gstPercent));
  const value = rate * quantity;
  const tax = Math.round((value * gstPercent) / 100);
  return { rate, value, tax, total: value + tax };
}

// the price a line sells at: the new price typed, or the pack's saved price with GST
export const priceOf = (line: Pick<CartLine, "newPrice">, pack: Pick<Pack, "priceAfterGst">) =>
  parseAmount(line.newPrice) ?? pack.priceAfterGst ?? 0;

// the godowns' parts of a line, as numbers
export const placedOf = (line: Pick<CartLine, "godowns">) =>
  Object.values(line.godowns).reduce((a, v) => a + (Number(v) || 0), 0);

// everything the sale form holds and works out. Made once in SaleEntry; every card reads it with useSaleEntry()
export function useSaleEntryState({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const t = useTranslations("transactions.sale");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const router = useRouter();
  const sameName = useSameNameConfirm();
  const { products, categories, stock, placeOfBusiness, banks, loading, loadFailed, retryLoad, saveSale, saving: creating, saved } = useSaleData();

  // the answers
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [transport, setTransport] = useState("");
  const [packing, setPacking] = useState("");
  const [loadingCharges, setLoadingCharges] = useState("");
  const [kind, setKind] = useState<"cash" | "credit" | null>(null);
  // cash: what came into cash and each bank account (a card each), how each came in and its reference
  const [gridTexts, setGridTexts] = useState<Record<string, string>>({});
  const [gridModes, setGridModes] = useState<Record<string, BankMode | null>>({});
  const [refs, setRefs] = useState<Record<string, { mode: BankMode; text: string }>>({});
  const [refLeft, setRefLeft] = useState<string[]>([]);
  // the customer, searched and picked (cash or credit), or someone new: on credit a new customer (their details typed
  // on the card), for cash the buyer below; a picked one's details changed here
  const [customer, setCustomer] = useState<LedgerChoice>(null);
  const [newParty, setNewParty] = useState<PartyDraft>(() => emptyParty());
  const [editingCustomer, setEditingCustomer] = useState(false);
  // cash: the buyer's name and phone, and their addresses (our place of business first, until changed)
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [addresses, setAddresses] = useState<AddressDraft[]>(() => [emptyAddress(true)]);
  // the place of business fills the first address's town, district, state and PIN once it's in hand (only while
  // nothing's been typed in it); its line and landmark are left to type
  useEffect(() => {
    if (!placeOfBusiness) return;
    setAddresses((all) =>
      all.length === 1 && all[0]!.city === "" && all[0]!.postalCode === ""
        ? [
            {
              ...all[0]!,
              city: placeOfBusiness.city,
              district: placeOfBusiness.district,
              state: placeOfBusiness.state,
              stateCode: placeOfBusiness.stateCode as StateCode,
              postalCode: placeOfBusiness.postalCode,
            },
          ]
        : all,
    );
  }, [placeOfBusiness]);
  // the day it's dated (today until changed) and its remarks
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [remarks, setRemarks] = useState("");
  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());
  const [saveError, setSaveError] = useState<string | null>(null);
  // Next or Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);

  // each pack size with its product, to find a line's name, photo, price and GST %
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products ?? []) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  const packOf = (id: string) => packs.get(id) ?? null;
  const nameOf = (id: string) => {
    const p = packOf(id);
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode)}` : "";
  };
  // the godowns holding each pack size, from what each godown holds
  const holds = new Map<string, GodownHold[]>();
  for (const g of stock ?? [])
    for (const product of g.products)
      for (const p of product.packs)
        if (p.quantity > 0) holds.set(p.productId, [...(holds.get(p.productId) ?? []), { godownId: g.godownId, name: g.godownName, held: p.quantity, counting: g.beingCounted }]);
  const godownsOf = (productId: string) => holds.get(productId) ?? [];
  // a pack size can be sold once it has a price, a GST % and free stock
  const sellable = (p: Pack) => p.priceAfterGst != null && p.gstPercent != null && p.unreservedQuantity > 0;

  // the cart, worked out
  const figures = lines.map((l) => {
    const p = packOf(l.productId)?.pack;
    return lineFigures(p ? priceOf(l, p) : 0, Number(l.quantity) || 0, p?.gstPercent ?? 0);
  });
  const itemsPaise = figures.reduce((a, f) => a + f.total, 0);
  const valuePaise = figures.reduce((a, f) => a + f.value, 0);
  const itemsTotal = itemsPaise / 100;
  const paise = (v: string) => Math.round((parseAmount(v) ?? 0) * 100);
  const chargesPaise = paise(transport) + paise(packing) + paise(loadingCharges);
  // the bill before the cash discount, the discount (never more than the bill) and what's to be received
  const grossPaise = itemsPaise + chargesPaise;
  const offPaise = Math.min(paise(discount), grossPaise);
  const total = (grossPaise - offPaise) / 100;
  // the taxable value: the items' value before GST, and the charges with their GST taken out at each line's rate (as
  // the server spreads them)
  let chargeLeft = chargesPaise;
  const chargeTaxable = figures.reduce((sum, f, i) => {
    const share = i === figures.length - 1 ? chargeLeft : valuePaise === 0 ? 0 : Math.round((chargesPaise * f.value) / valuePaise);
    chargeLeft -= share;
    return sum + Math.round((share * 100) / (100 + (packOf(lines[i]!.productId)?.pack.gstPercent ?? 0)));
  }, 0);
  const taxable = (valuePaise + chargeTaxable) / 100;
  // a cash sale from ₹50,000 taxable value names its buyer
  const buyerNeeded = kind === "cash" && taxable >= NAMED_BUYER_FROM;

  // change the cart: put one in (or change it, from the product card), or take it out
  const putLine = (line: CartLine) =>
    setLines((all) => (all.some((l) => l.productId === line.productId) ? all.map((l) => (l.productId === line.productId ? line : l)) : [...all, line]));
  const removeLine = (productId: string) => setLines((all) => all.filter((l) => l.productId !== productId));
  // the product card over the page: the pack size being added or changed
  const [cardFor, setCardFor] = useState<string | null>(null);

  // cash: a card each for cash and every bank account, what came into it typed
  const gridPlaces: GridPlace[] = ["cash", ...(banks ?? []).map((b) => b.id)].map((id) => {
    const b = banks?.find((x) => x.id === id);
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
  const gridTotal = Math.round(gridPlaces.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const gridAccs = gridPlaces.filter((p) => p.id !== "cash" && p.amount > 0);
  const refOf = (id: string, mode: BankMode | null) => (mode && refs[id]?.mode === mode ? refs[id]!.text : "");
  const upiIdsOf = (id: string) => banks?.find((b) => b.id === id)?.upiIds ?? [];
  // the cards add up to what's to be received; every account says how it came in, with a reference that fits, and an
  // account by UPI has a UPI ID of ours
  const intoOk =
    total > 0 &&
    gridTotal === total &&
    gridAccs.every((p) => p.mode !== null && refOkFor(p.mode, refOf(p.id, p.mode)) && (p.mode !== "upi" || upiIdsOf(p.id).length > 0));
  // the amount changed: what came in where starts again
  useEffect(() => {
    setGridTexts({});
    setGridModes({});
  }, [total]);
  // a QR for each account by UPI with a UPI ID of ours, inside its card
  const qrItems: QrItem[] = gridAccs
    .filter((p) => p.mode === "upi" && upiIdsOf(p.id).length > 0)
    .map((p) => ({
      key: p.id,
      title: `${p.name} ${p.sub ?? ""}`.trim(),
      upiIds: upiIdsOf(p.id),
      payee: banks?.find((b) => b.id === p.id)?.accountHolderName ?? "",
      amount: p.amount,
    }));

  // credit: a new customer's phone that someone already has shows them instead
  const matches = usePhoneMatches(newParty.phone, "customer");
  const matched = kind === "credit" && customer?.kind === "party" && matches.length > 0 ? matches[0]! : null;
  // cash: the buyer's phone, a 10-digit mobile when given; every address typed in full
  const phoneOk = buyerPhone === "" || /^[6-9]\d{9}$/.test(buyerPhone);
  const addressesOk = addresses.every((a) => !Object.values(addressProblems(a)).some(Boolean));
  const buyerOk = phoneOk && (!buyerNeeded || (buyerName.trim() !== "" && buyerPhone !== ""));

  // when each card is filled in
  const linesOk =
    lines.length > 0 &&
    lines.every((l) => {
      const p = packOf(l.productId)?.pack;
      const q = Number(l.quantity) || 0;
      return !!p && q >= 1 && q <= p.unreservedQuantity && placedOf(l) === q;
    });
  const complete: Record<SaleStep, boolean> = {
    products: linesOk,
    amount: total > 0,
    money: kind === "credit" || (kind === "cash" && intoOk),
    customer:
      customer?.kind === "ledger" ||
      (customer?.kind === "party" && (kind === "credit" ? !matched && partyOk(newParty, true) : buyerOk && addressesOk)),
    details: day !== "",
  };
  const [at, setAt] = useState<SaleStep>("products");
  const current = at;
  const index = STEPS.indexOf(current);
  const firstOpen = STEPS.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  const reachable = (s: SaleStep) => STEPS.indexOf(s) <= (ready ? STEPS.length - 1 : firstOpen);
  // phones: the summary folded into a bar above the card
  const [summaryOpen, setSummaryOpen] = useState(false);

  // the phone's Back goes to the card before
  const remember = useCardHistory<SaleStep>("products", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function show(step: SaleStep) {
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
  // cash or credit picked: credit moves straight on to the customer; cash stays for where it came into
  function pickKind(next: "cash" | "credit") {
    if (next !== kind) {
      setKind(next);
      setGridTexts({});
      setGridModes({});
      setCustomer(null);
    }
    if (next === "credit") show("customer");
  }

  // what the card still needs, once Next or Save was tapped
  const missingOf = (s: SaleStep) =>
    s === "products"
      ? lines.length === 0
        ? t("missing.products")
        : t("missing.lines")
      : s === "amount"
        ? t("missing.amount")
        : s === "money"
          ? kind === null
            ? t("missing.kind")
            : // cash: what's still to be placed, or (all placed) how an account got its part
              gridTotal < total
              ? t("missing.left", { amount: rupees(Math.round((total - gridTotal) * 100) / 100) })
              : t("missing.into")
          : s === "details"
            ? t("missing.date")
            : kind === "credit" || customer?.kind !== "party"
            ? t("missing.customer")
            : !buyerOk
              ? t("missing.buyer")
              : t("missing.address");

  // leaving with something entered asks first (not after a save, which goes on to its own page)
  const { dialog: leaveDialog } = useLeaveGuard(!saved && lines.length > 0, onDiscard);

  // a cash buyer's typed address as the sale keeps it
  const typedAddress = (a: AddressDraft) => ({
    addressLine1: a.addressLine1.trim(),
    landmark: a.landmark.trim(),
    city: a.city.trim(),
    district: a.district.trim(),
    state: a.state.trim(),
    stateCode: a.stateCode!,
    postalCode: a.postalCode,
    gstin: a.gstin.trim() || null,
  });

  // Save tapped and still working: the button says so and can't be tapped again
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!ready) {
      setAt(STEPS[firstOpen]!);
      return guide();
    }
    // someone new with the same name in the same town as one already added: asked first
    if (kind === "credit" && customer?.kind === "party" && !(await sameName.confirm(newParty))) return;
    setSaving(true);
    setSaveError(null);
    const items = lines.map((l, i) => ({
      productId: l.productId,
      quantity: Number(l.quantity),
      rateBeforeGst: figures[i]!.rate / 100,
      godowns: Object.entries(l.godowns)
        .filter(([, v]) => (Number(v) || 0) > 0)
        .map(([godownId, v]) => ({ godownId, quantity: Number(v) })),
    }));
    // a cash buyer's addresses: where it goes (the default among those for shipping) and where it's billed
    const ships = addresses.filter((a) => a.addressType === "both" || a.addressType === "shipping");
    const bills = addresses.filter((a) => a.addressType === "both" || a.addressType === "billing");
    const shipAt = ships.find((a) => a.isDefault) ?? ships[0] ?? addresses.find((a) => a.isDefault) ?? addresses[0]!;
    const billAt = bills.find((a) => a.isDefault) ?? bills[0] ?? null;
    try {
      const sale = await saveSale({
        saveKey,
        dateTime: momentOf(day),
        remarks: remarks.trim() || null,
        lines: items,
        discount: offPaise / 100,
        transportCharges: paise(transport) / 100,
        packingCharges: paise(packing) / 100,
        loadingCharges: paise(loadingCharges) / 100,
        kind: kind!,
        ...(kind === "cash"
          ? {
              cashAmount: gridPlaces[0]!.amount,
              // a customer picked: billed and sent to their own address
              customerLedgerId: customer?.kind === "ledger" ? customer.ledger.id : null,
              bankParts: gridAccs.map((p) => ({
                bankDetailsId: p.id,
                amount: p.amount,
                mode: p.mode!,
                referenceNumber: refOf(p.id, p.mode).trim() || null,
              })),
              // someone new: their name, phone and addresses, kept on the sale
              ...(customer?.kind === "party"
                ? { buyer: { name: buyerName.trim(), phone: buyerPhone }, shipTo: { address: typedAddress(shipAt) }, billToAddress: billAt ? typedAddress(billAt) : null }
                : {}),
            }
          : {
              customerLedgerId: customer?.kind === "ledger" ? customer.ledger.id : null,
              newCustomer: customer?.kind === "party" ? partyInput(newParty) : null,
            }),
      });
      // on to its success page; replace, so going back doesn't land on the filled form
      router.replace(`/transaction/sale/${sale.transactionId}`);
    } catch (err) {
      setSaving(false);
      const e = err as { data?: { code?: string }; message?: string };
      const code = e?.data?.code;
      setSaveError(
        code === undefined
          ? t("errors.network")
          : code === "TOO_MANY_REQUESTS"
            ? t("errors.busy")
            : // the server's own words where they say what to fix (a price below cost, a godown being counted ...)
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
    tc,
    locale,
    isAdmin,
    loading,
    loadFailed,
    retryLoad,
    products: products ?? [],
    categories: categories ?? [],
    banks: banks ?? [],
    packOf,
    nameOf,
    godownsOf,
    sellable,
    lines,
    figures,
    putLine,
    removeLine,
    cardFor,
    setCardFor,
    itemsTotal,
    discount,
    setDiscount,
    transport,
    setTransport,
    packing,
    setPacking,
    loadingCharges,
    setLoadingCharges,
    grossTotal: grossPaise / 100,
    total,
    taxable,
    buyerNeeded,
    kind,
    pickKind,
    gridPlaces,
    setGridText: (id: string, text: string) => setGridTexts((all) => ({ ...all, [id]: text })),
    setGridMode: (id: string, mode: BankMode | null) => setGridModes((all) => ({ ...all, [id]: mode })),
    gridTotal,
    gridAccs,
    upiIdsOf,
    refs,
    setRefs,
    refLeft,
    setRefLeft,
    qrItems,
    customer,
    setCustomer,
    newParty,
    setNewParty,
    editingCustomer,
    setEditingCustomer,
    matched,
    buyerName,
    setBuyerName,
    buyerPhone,
    setBuyerPhone,
    phoneOk,
    addresses,
    setAddresses,
    day,
    setDay,
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
  };
}

export type SaleEntryState = ReturnType<typeof useSaleEntryState>;

const SaleEntryContext = createContext<SaleEntryState | null>(null);
export const SaleEntryProvider = SaleEntryContext.Provider;

export function useSaleEntry() {
  const value = useContext(SaleEntryContext);
  if (!value) throw new Error("useSaleEntry is used outside SaleEntryProvider");
  return value;
}
