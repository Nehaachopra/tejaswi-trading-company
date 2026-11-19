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
import { tdsOn } from "../receipt/shared";
import { refOkFor } from "../shared/bank-mode";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { momentOf } from "../shared/form-basics";
import type { QrItem } from "../shared/qr-spot";
import type { GridPlace } from "../shared/split-grid";

// the cards, in order: the cart, the amount (charges and a cash discount), cash or credit, who bought it, what was
// received and where it came into (cash only), then the day, vehicle, remarks and Save
export type SaleStep = "products" | "amount" | "money" | "customer" | "received" | "details";
const ALL_STEPS: SaleStep[] = ["products", "amount", "money", "customer", "received", "details"];

// the TDS a buyer takes from what it pays us, by law (section 194Q), as the server uses it
export const SALE_TDS_RATE = 0.1;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const { products, categories, stock, placeOfBusiness, banks, order, orderLedger, loading, loadFailed, retryLoad, saveSale, saving: creating, saved } = useSaleData();

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
  // cash: the buyer's name and phone, and their address (our place of business, until changed): one for billing and
  // shipping, and a second when it ships somewhere else
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [addresses, setAddresses] = useState<AddressDraft[]>(() => [emptyAddress(true)]);
  // cash, to a saved customer: what they handed over (typed only when they owe from before), whether they deducted
  // TDS, and their PAN when TDS is on and none is saved
  const [receivedText, setReceivedText] = useState("");
  const [tdsOnIt, setTdsOnIt] = useState(false);
  const [pan, setPan] = useState("");
  // cash, to a customer with an advance with us: whether it's set off against this bill
  const [setOffOn, setSetOffOn] = useState(false);
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
  // the day it's dated (today until changed), the vehicle the goods leave in and its remarks
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [vehicle, setVehicle] = useState("");
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
    return p ? `${productTitle(p.group)} ${packLabel(p.pack.packSize, p.pack.packSizeCode, p.pack.packCount)}` : "";
  };
  // the godowns holding each pack size, from what each godown holds
  const holds = new Map<string, GodownHold[]>();
  for (const g of stock ?? [])
    for (const product of g.products)
      for (const p of product.packs)
        if (p.quantity > 0) holds.set(p.productId, [...(holds.get(p.productId) ?? []), { godownId: g.godownId, name: g.godownName, held: p.quantity, counting: g.beingCounted }]);
  const godownsOf = (productId: string) => holds.get(productId) ?? [];
  // a dispatch on a sale order: how many of a pack size the order still waits for (what it holds back from stock)
  const orderLine = (productId: string) => order?.lines.find((l) => l.productId === productId) ?? null;
  const orderLeft = (productId: string) => {
    const l = orderLine(productId);
    return l ? Math.max(0, l.quantity - l.delivered) : 0;
  };
  // what of a pack size this sale can take: the free stock, and what its order holds back for it
  const freeOf = (p: Pack) => p.unreservedQuantity + orderLeft(p.productId);
  // the price a pack was ordered at (with GST, less its share of the order's discounts), as a new price to start
  // from; "" when it's the saved price, or the pack isn't waited for
  const orderPrice = (p: Pack) => {
    const l = orderLine(p.productId);
    if (!l || l.quantity === 0 || orderLeft(p.productId) === 0) return "";
    const each = round2(l.total / l.quantity);
    return each === p.priceAfterGst ? "" : String(each);
  };
  // a pack size can be sold once it has a price, a GST % and stock it can take
  const sellable = (p: Pack) => p.priceAfterGst != null && p.gstPercent != null && freeOf(p) > 0;

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

  // cash: what's received. A walk-in pays the bill. A saved customer pays any part of what's due (this bill and what
  // they owe from before): the old due first, then this bill, the rest staying owed; anything past it all is an
  // advance with us, as on a receipt; they may have deducted TDS from it. Staff see no balances, so no old due or
  // advance is worked out for them
  const picked = customer?.kind === "ledger" ? customer.ledger : null;
  const pickedId = picked?.id ?? null;
  const tdsCan = kind === "cash" && !!picked?.party;
  const tdsIs = tdsCan && tdsOnIt;
  const owedBefore = picked?.balance?.today.side === "debit" ? picked.balance.today.amount : 0;
  // what a saved customer owes from before, for cash and credit alike
  const oldDue = picked?.party ? owedBefore : 0;
  // an advance they already have with us (their account is in credit), and what of it is set off against this bill
  // (as much as the bill takes), once they say so
  const heldAdvance = tdsCan && picked?.balance?.today.side === "credit" ? picked.balance.today.amount : 0;
  const setOff = setOffOn ? Math.min(heldAdvance, total) : 0;
  const billLeft = round2(total - setOff);
  const dueNow = round2(oldDue + billLeft);
  // a saved customer's is typed: any part of what's due (the rest stays owed) or more; a walk-in pays the bill
  const received = tdsCan ? (parseAmount(receivedText) ?? 0) : total;
  // the TDS on it; a paisa off the bill or the whole due from rounding is taken as exactly that (as the server does)
  let tdsAmount = tdsIs && received > 0 ? tdsOn(received, SALE_TDS_RATE) : 0;
  if (tdsIs && received > 0) for (const target of [billLeft, dueNow]) if (Math.abs(round2(received + tdsAmount) - target) < 0.015) tdsAmount = round2(target - received);
  const settles = round2(received + tdsAmount);
  // of what it settles: the old due first, then this bill, then an advance (only when their balance is known); and
  // what's still owed after
  const towardsOld = Math.min(settles, oldDue);
  const towardsBill = Math.min(round2(settles - towardsOld), billLeft);
  const advance = tdsCan && picked?.balance && settles > dueNow ? round2(settles - dueNow) : 0;
  const leftDue = Math.max(0, round2(dueNow - settles));
  const panNeeded = tdsIs && !picked?.party?.hasPan;
  const panOk = !panNeeded || PAN.test(pan);
  // something came in, or the advance set off pays for it (all of it, or the rest stays owed)
  const receivedOk = (received > 0 || setOff > 0) && panOk;
  const typeReceived = setReceivedText;
  const flipTds = setTdsOnIt;
  // an advance in it: asked once before going on ("Did you receive ₹X as advance?"); asked again if the advance changes
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
  // someone else picked (or cash or credit changed): what was received starts again
  useEffect(() => {
    setReceivedText("");
    setSetOffOn(false);
    setTdsOnIt(false);
    setPan("");
  }, [pickedId, kind]);

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
  // the cards add up to what's received; every account says how it came in, with a reference that fits, and an
  // account by UPI has a UPI ID of ours
  const intoOk =
    received > 0 &&
    gridTotal === received &&
    gridAccs.every((p) => p.mode !== null && refOkFor(p.mode, refOf(p.id, p.mode)) && (p.mode !== "upi" || upiIdsOf(p.id).length > 0));
  // what's received changed: what came in where starts again
  useEffect(() => {
    setGridTexts({});
    setGridModes({});
  }, [received]);
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
  // cash: the buyer's name and phone (a 10-digit mobile) are asked only from ₹50,000 taxable value, and needed then;
  // every address typed in full
  const phoneOk = buyerPhone === "" || /^[6-9]\d{9}$/.test(buyerPhone);
  // a second address is where it ships: the same place as the first is not another address
  const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const sameAddress =
    addresses.length > 1 &&
    (["addressLine1", "landmark", "city", "district", "postalCode"] as const).every((f) => sameText(addresses[0]![f], addresses[1]![f])) &&
    addresses[0]!.stateCode === addresses[1]!.stateCode;
  const addressesOk = !sameAddress && addresses.every((a) => !Object.values(addressProblems(a)).some(Boolean));
  const buyerOk = !buyerNeeded || (phoneOk && buyerName.trim() !== "" && buyerPhone !== "");

  // when each card is filled in
  const linesOk =
    lines.length > 0 &&
    lines.every((l) => {
      const p = packOf(l.productId)?.pack;
      const q = Number(l.quantity) || 0;
      return !!p && q >= 1 && q <= freeOf(p) && placedOf(l) === q;
    });
  const complete: Record<SaleStep, boolean> = {
    products: linesOk,
    amount: total > 0,
    money: kind !== null,
    // nothing came in (the advance set off covers it): no account to place it in
    received: kind === "credit" || (receivedOk && (received === 0 || intoOk)),
    customer:
      customer?.kind === "ledger" ||
      (customer?.kind === "party" && (kind === "credit" ? !matched && partyOk(newParty, true) : buyerOk && addressesOk)),
    details: day !== "",
  };
  // a credit sale takes no money now: its card after the customer only shows what they'll owe (the old due, this
  // bill and the two together), and only when they owe from before
  const STEPS = ALL_STEPS.filter((s) => s !== "received" || kind !== "credit" || oldDue > 0);
  const [at, setAt] = useState<SaleStep>("products");
  const current = STEPS.includes(at) ? at : "customer";
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
  async function next() {
    if (!complete[current]) return guide();
    // the amount leaves an advance: they say it's one before going on
    if (current === "received" && !(await confirmAdvance())) return;
    show(STEPS[index + 1]!);
  }
  // cash or credit picked: either moves straight on to the customer (a chip-only card)
  function pickKind(next: "cash" | "credit") {
    if (next !== kind) {
      setKind(next);
      setGridTexts({});
      setGridModes({});
      setCustomer(orderCustomer(next));
    }
    show("customer");
  }
  // a dispatch on a sale order starts from who the order is for. A customer: picked already (and kept: the order is
  // theirs). A name kept on the order: someone new with the name, phone and address from the order filled in, for cash
  // as the buyer, on credit as a new customer (the admin's to add); the name stays the order's, the rest can be
  // changed, and one of ours with that phone can be used instead (the same person)
  const orderLocked = !!order?.customer.partyId && !!orderLedger;
  const orderBuyer = !!order && !order.customer.partyId;
  function orderCustomer(next: "cash" | "credit"): LedgerChoice {
    if (!order) return null;
    if (order.customer.partyId) return orderLedger ? { kind: "ledger", ledger: orderLedger } : null;
    if (next === "credit" && !isAdmin) return null;
    const at = order.deliveryAddress;
    const address: AddressDraft = at
      ? { ...emptyAddress(true), addressLine1: at.addressLine1, landmark: at.landmark, city: at.city, district: at.district, state: at.state, stateCode: at.stateCode as StateCode, postalCode: at.postalCode }
      : emptyAddress(true);
    if (next === "cash") {
      setBuyerName(order.customer.name);
      setBuyerPhone(order.customer.phone ?? "");
      if (at) setAddresses([address]);
    } else {
      setNewParty({ ...emptyParty(), name: order.customer.name, phone: order.customer.phone ?? "", addresses: [address] });
    }
    return { kind: "party" };
  }
  // a cash sale under ₹50,000 taxable value (not on an order): no search, the buyer's address is asked straight away
  // (Change brings the search back)
  const [searchSaved, setSearchSaved] = useState(false);
  const walkIn = kind === "cash" && !buyerNeeded && !order && !searchSaved;
  function findSaved() {
    setSearchSaved(true);
    setCustomer(null);
  }
  useEffect(() => {
    if (walkIn && customer?.kind !== "party") setCustomer({ kind: "party" });
  }, [walkIn, customer]);

  // what the card still needs, once Next or Save was tapped
  const missingOf = (s: SaleStep) =>
    s === "products"
      ? lines.length === 0
        ? t("missing.products")
        : t("missing.lines")
      : s === "amount"
        ? t("missing.amount")
        : s === "money"
          ? t("missing.kind")
          : s === "received"
            ? received === 0
              ? t("missing.received")
              : !panOk
                  ? t("missing.pan")
                  : // what's still to be placed, or (all placed) how an account got its part
                    gridTotal < received
                    ? t("missing.left", { amount: rupees(round2(received - gridTotal)) })
                    : t("missing.into")
            : s === "details"
              ? t("missing.date")
              : kind === "credit" || customer?.kind !== "party"
                ? t("missing.customer")
                : !buyerOk
                  ? t("missing.buyer")
                  : sameAddress
                    ? t("sameAddress")
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
    // an advance not yet said to be one (the amount changed after Next): asked here too
    if (!(await confirmAdvance())) return;
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
    // a cash buyer's addresses: billed at the first, and sent to the second when there is one
    const billAt = addresses[0]!;
    const shipAt = addresses[1] ?? billAt;
    try {
      const sale = await saveSale({
        saveKey,
        saleOrderId: order?.id ?? null,
        dateTime: momentOf(day),
        remarks: remarks.trim() || null,
        vehicleNumber: vehicle || null,
        lines: items,
        discount: offPaise / 100,
        transportCharges: paise(transport) / 100,
        packingCharges: paise(packing) / 100,
        loadingCharges: paise(loadingCharges) / 100,
        kind: kind!,
        ...(kind === "cash"
          ? {
              cashAmount: gridPlaces[0]!.amount,
              // a customer picked: billed and sent to their own address; the TDS they deducted, and their PAN when
              // it wasn't saved
              customerLedgerId: customer?.kind === "ledger" ? customer.ledger.id : null,
              tdsDeducted: tdsIs,
              advanceSetOff: setOff > 0,
              customerPan: panNeeded ? pan : null,
              bankParts: gridAccs.map((p) => ({
                bankDetailsId: p.id,
                amount: p.amount,
                mode: p.mode!,
                referenceNumber: refOf(p.id, p.mode).trim() || null,
              })),
              // someone new: their addresses, and from ₹50,000 their name and phone, kept on the sale
              ...(customer?.kind === "party"
                ? { buyer: buyerNeeded || orderBuyer ? { name: buyerName.trim(), phone: buyerPhone } : null, shipTo: { address: typedAddress(shipAt) }, billToAddress: typedAddress(billAt) }
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
    order,
    orderLocked,
    orderBuyer,
    walkIn,
    findSaved,
    orderLeft,
    freeOf,
    orderPrice,
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
    sameAddress,
    oldDue,
    dueNow,
    received,
    receivedText,
    typeReceived,
    heldAdvance,
    setOffOn,
    setSetOffOn,
    setOff,
    billLeft,
    advance,
    askingAdvance,
    tdsCan,
    tdsOnIt: tdsIs,
    flipTds,
    tdsAmount,
    settles,
    towardsOld,
    towardsBill,
    leftDue,
    panNeeded,
    pan,
    setPan,
    day,
    setDay,
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
