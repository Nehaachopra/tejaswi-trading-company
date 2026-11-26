import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray } from "@repo/database";
import {
  bankDetailsTable,
  categoriesTable,
  deletedProductsTable,
  dueSettlementsTable,
  duesTable,
  godownsTable,
  ledgerEntriesTable,
  ledgersTable,
  partiesTable,
  productCostHistoryTable,
  productGodownsTable,
  productsTable,
  purchaseProductsTable,
  purchaseReturnProductsTable,
  purchaseReturnsTable,
  purchasesTable,
  transactionBankDetailsTable,
  transactionsTable,
} from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel, PostingLine } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import DueService from "../due";
import PartyService from "../party";
import { BANK_MODE_DB, type MoreBankPartModel } from "../payment/model";
import { anyProduct } from "../product/any-product";
import PurchaseService from "../purchase";
import { weightedCost } from "../purchase/cost";
import { createPurchaseInputModel } from "../purchase/model";
import SettingService from "../setting";
import StockEngine, { type Tx } from "../stock/engine";
import TransactionService from "../transaction";
import { settleLedger } from "../transaction/settle";
import {
  type CreatePurchaseReturnInputModel,
  createPurchaseReturnInputModel,
  type DebitNoteModel,
  type PurchaseForReturnModel,
  type PurchaseReturnIdInputModel,
  type PurchaseReturnLineInputModel,
  type SavedPurchaseReturnModel,
} from "./model";

// the day a moment falls on in India, as YYYY-MM-DD
const indiaDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);

// the last day a debit note can be issued against a purchase: 30 November after the end of its financial year (April
// to March), GST section 34
const lastNoteDay = (day: string) => {
  const [y, m] = day.split("-").map(Number) as [number, number];
  return `${m >= 4 ? y + 1 : y}-11-30`;
};

// a purchase as a return works it out
type Loaded = Awaited<ReturnType<PurchaseReturnService["load"]>>;

// one item of the purchase, its godown parts added up, and what's gone back of it on returns still in place
type PurchaseItem = {
  productId: string;
  name: string;
  purchaseProductId: string;
  bought: number;
  gross: number;
  off: number;
  gst: number;
  gstRate: number;
  godowns: { godownId: string; name: string; quantity: number }[];
  returned: number;
};

// what a pack was bought for before GST (its line discount taken off), in paise
const rateOf = (i: PurchaseItem) => Math.round((i.gross - i.off) / i.bought);

// Purchase returns: goods going back to the supplier against one saved purchase (the admin's). They leave the godowns
// picked, and that much of the purchase is turned round at the rate it was bought at: its value and the GST we'd
// claimed (our debit note), and its share of the cash discount. Freight, packing, loading and other charges are never
// given back. Each pack's weighted average cost drops what those packs cost. The total comes off what we owe the
// supplier (anything over stays with them as advance), or they pay it back now into cash and bank. Items replaced come
// in again on a new purchase at the rate they were first bought at. Stock, cost, ledgers, dues and the return are
// saved together or not at all
export default class PurchaseReturnService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly purchases = new PurchaseService(accounts, transactions, parties),
    private readonly settings = new SettingService(),
    private readonly stock = new StockEngine(),
  ) {}

  // the purchase, its items (each once, with what's gone back of it before), the charges, and what's still owed on it
  private async load(q: Tx, purchaseTransactionId: string, lock: boolean) {
    const base = q.select().from(transactionsTable).where(eq(transactionsTable.id, purchaseTransactionId));
    const [t] = lock ? await base.for("update") : await base;
    if (!t || t.type !== "purchase") throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found." });
    const [purchase] = await q.select().from(purchasesTable).where(eq(purchasesTable.transactionId, t.id));
    if (!purchase) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found." });
    const parts = await q
      .select({ pp: purchaseProductsTable, godownId: productGodownsTable.godownId })
      .from(purchaseProductsTable)
      .leftJoin(productGodownsTable, eq(productGodownsTable.id, purchaseProductsTable.productGodownId))
      .where(eq(purchaseProductsTable.purchaseId, purchase.id))
      .orderBy(asc(purchaseProductsTable.createdAt), asc(purchaseProductsTable.id));
    const items = new Map<string, PurchaseItem>();
    for (const { pp, godownId } of parts) {
      const item = items.get(pp.productId) ?? {
        productId: pp.productId,
        name: pp.productNameSnapshot,
        purchaseProductId: pp.id,
        bought: 0,
        gross: 0,
        off: 0,
        gst: 0,
        gstRate: pp.gstRate,
        godowns: [],
        returned: 0,
      };
      item.bought += pp.quantity;
      item.gross += toPaise(pp.grossProductPrice);
      item.off += toPaise(pp.discountAmount);
      item.gst += toPaise(pp.gstAmount);
      if (godownId) item.godowns.push({ godownId, name: pp.godownName, quantity: pp.quantity });
      items.set(pp.productId, item);
    }
    // what's gone back on returns still in place
    const back = await q
      .select({ quantity: purchaseReturnProductsTable.quantity, productId: purchaseProductsTable.productId })
      .from(purchaseReturnProductsTable)
      .innerJoin(purchaseReturnsTable, eq(purchaseReturnsTable.id, purchaseReturnProductsTable.returnId))
      .innerJoin(transactionsTable, eq(transactionsTable.id, purchaseReturnsTable.transactionId))
      .innerJoin(purchaseProductsTable, eq(purchaseProductsTable.id, purchaseReturnProductsTable.purchaseProductId))
      .where(and(eq(purchaseReturnsTable.purchaseId, purchase.id), eq(transactionsTable.status, "active")));
    for (const b of back) items.get(b.productId)!.returned += b.quantity;
    // the charges (GST in them) and the cash discount, as the purchase had them: a return never changes them
    const charges = toPaise(purchase.freightAmount) + toPaise(purchase.packagingAmount) + toPaise(purchase.handlingAmount) + toPaise(purchase.otherAmount);
    // what's still owed on this bill: its due less what's been settled on it by transactions in place
    const [due] = await q.select({ id: duesTable.id, amount: duesTable.amount }).from(duesTable).where(eq(duesTable.transactionId, t.id));
    const settled = due
      ? (
          await q
            .select({ amount: dueSettlementsTable.amount })
            .from(dueSettlementsTable)
            .innerJoin(transactionsTable, eq(transactionsTable.id, dueSettlementsTable.transactionId))
            .where(and(eq(dueSettlementsTable.dueId, due.id), eq(transactionsTable.status, "active")))
        ).reduce((a, s) => a + toPaise(s.amount), 0)
      : 0;
    const dueLeft = due ? Math.max(0, toPaise(due.amount) - settled) : 0;
    return { t, purchase, items, charges, discount: toPaise(purchase.discountAmount), due: due ? { id: due.id, left: dueLeft } : null };
  }

  // the bill as if only `left` of each item had been bought, in paise, worked out as a purchase's is: each item at the
  // rate it was bought at with its GST, the charges as they were (their GST taken out at the highest rate among the
  // items still on it), the cash discount as it was (never more than the bill), rounded to the rupee
  private bill(loaded: Loaded, left: (i: PurchaseItem) => number) {
    const items = [...loaded.items.values()].map((i) => {
      const value = rateOf(i) * left(i);
      return { item: i, value, gst: Math.round((value * i.gstRate) / 100) };
    });
    const rate = Math.max(0, ...items.filter((x) => left(x.item) > 0).map((x) => x.item.gstRate));
    const chargeTaxable = Math.round((loaded.charges * 100) / (100 + rate));
    const value = items.reduce((a, x) => a + x.value, 0);
    const gst = items.reduce((a, x) => a + x.gst, 0) + loaded.charges - chargeTaxable;
    const gross = value + chargeTaxable + gst;
    const off = Math.min(loaded.discount, gross);
    const total = Math.round((gross - off) / 100) * 100;
    return { taxable: value + chargeTaxable, gst, off, total };
  }

  // why the purchase can't take a return, if it can't
  private blockedBy(loaded: Loaded, day: string) {
    if (loaded.t.status === "cancelled") return "cancelled" as const;
    if ([...loaded.items.values()].every((i) => i.returned >= i.bought)) return "allReturned" as const;
    if (day > lastNoteDay(indiaDay(loaded.t.dateTime))) return "tooLate" as const;
    return null;
  }

  // the supplier's ledger with what we owe them now and what they hold of ours as advance, in paise
  private async supplierOf(q: Tx, partyId: string | null) {
    if (!partyId) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found." });
    const [ledger] = await q.select().from(ledgersTable).where(and(eq(ledgersTable.referenceTable, "parties"), eq(ledgersTable.referenceId, partyId)));
    const [party] = await q.select().from(partiesTable).where(eq(partiesTable.id, partyId));
    if (!ledger || !party) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found." });
    const balance = toPaise(ledger.balance);
    return { ledgerId: ledger.id, party, owed: ledger.balanceType === "credit" ? balance : 0, held: ledger.balanceType === "debit" ? balance : 0 };
  }

  // the purchase as the return form opens it
  async forReturn(input: { transactionId: string }): Promise<PurchaseForReturnModel> {
    return db.transaction(async (tx) => {
      const loaded = await this.load(tx, input.transactionId, false);
      const { t, purchase, items } = loaded;
      const supplier = await this.supplierOf(tx, purchase.partyId);
      // the bill as it stands (after any earlier returns), and what's been paid towards it
      const before = this.bill(loaded, (i) => i.bought - i.returned);
      return {
        transactionId: t.id,
        assignedId: t.assignedId,
        dateTime: t.dateTime,
        kind: purchase.transactedIn === "credit" ? "credit" : "cash",
        supplier: { ledgerId: supplier.ledgerId, partyId: supplier.party.id, name: supplier.party.name, owed: supplier.owed / 100, held: supplier.held / 100 },
        supplyType: purchase.supplyType === "inter" ? "inter" : "intra",
        total: Number(t.amount),
        billNow: before.total / 100,
        paid: (before.total - (loaded.due?.left ?? 0)) / 100,
        freightCharges: Number(purchase.freightAmount),
        packingCharges: Number(purchase.packagingAmount),
        loadingCharges: Number(purchase.handlingAmount),
        otherCharges: Number(purchase.otherAmount),
        discount: loaded.discount / 100,
        lines: [...items.values()].map((i) => ({
          productId: i.productId,
          name: i.name,
          bought: i.bought,
          returned: i.returned,
          canReturn: i.bought - i.returned,
          price: Math.round(rateOf(i) * (1 + i.gstRate / 100)) / 100,
          rate: rateOf(i) / 100,
          gstRate: i.gstRate,
          godowns: i.godowns,
        })),
        lastDay: lastNoteDay(indiaDay(t.dateTime)),
        returnBlockedBy: this.blockedBy(loaded, indiaDay(new Date())),
      };
    });
  }

  // the return's figures, in paise: the bill as it stands less the bill as if these packs had never been bought (the
  // charges and cash discount as they were), so its value, GST, the discount it gives back and its total are what came
  // off; each item's own line at the rate it was bought at, for the debit note
  private figure(loaded: Loaded, lines: PurchaseReturnLineInputModel[]) {
    const back = new Map<string, number>();
    for (const l of lines) {
      const i = loaded.items.get(l.productId);
      if (!i) throw new TRPCError({ code: "BAD_REQUEST", message: "An item isn't on this purchase." });
      const left = i.bought - i.returned;
      if (l.quantity > left) throw new TRPCError({ code: "BAD_REQUEST", message: `Only ${left} of ${i.name} can go back.` });
      back.set(l.productId, l.quantity);
    }
    const before = this.bill(loaded, (i) => i.bought - i.returned);
    const after = this.bill(loaded, (i) => i.bought - i.returned - (back.get(i.productId) ?? 0));
    const items = lines.map((l) => {
      const item = loaded.items.get(l.productId)!;
      const value = rateOf(item) * l.quantity;
      return { line: l, item, gross: value, gst: Math.round((value * item.gstRate) / 100) };
    });
    const taxable = before.taxable - after.taxable;
    const gst = before.gst - after.gst;
    const discount = before.off - after.off;
    const total = before.total - after.total;
    return { items, taxable, gst, discount, total, roundOff: total - (taxable + gst - discount), dueLeft: loaded.due?.left ?? 0 };
  }

  // what the supplier pays back into cash and bank accounts (money coming in: no cap)
  private async refundLines(tx: Tx, cashAmount: number, bankParts: MoreBankPartModel[]) {
    const lines: PostingLine[] = [];
    const banks: { part: MoreBankPartModel; ledgerId: string }[] = [];
    const cash = toPaise(cashAmount);
    if (cash > 0) lines.push({ ledgerId: await settleLedger(tx, this.accounts, "cash", null), side: "debit", amount: cash / 100 });
    for (const b of bankParts) {
      const ledgerId = await settleLedger(tx, this.accounts, "bank", b.bankDetailsId);
      banks.push({ part: b, ledgerId });
      lines.push({ ledgerId, side: "debit", amount: toPaise(b.amount) / 100 });
    }
    return { lines, banks, paid: cash + bankParts.reduce((a, b) => a + toPaise(b.amount), 0) };
  }

  // a replacement's new purchase: the replaced items from the same supplier at the rate they were first bought at,
  // into the godowns given, on credit (the return is on their account). A cash discount keeps it from coming to more
  // than the return (a rupee of rounding, or a discount the first bill had)
  private replacementPurchase(loaded: Loaded, replaced: PurchaseReturnLineInputModel[], dateTime: Date, returnTotal: number, supplierLedgerId: string) {
    const { purchase } = loaded;
    // worked out as the purchase will: each godown's part at the rate with its GST, rounded to the rupee
    const gross = replaced.reduce((a, l) => {
      const i = loaded.items.get(l.productId)!;
      return a + l.replaceInto!.reduce((b, g) => b + rateOf(i) * g.quantity + Math.round((rateOf(i) * g.quantity * i.gstRate) / 100), 0);
    }, 0);
    const discount = Math.round(gross / 100) * 100 > returnTotal ? gross - returnTotal : 0;
    const draft = createPurchaseInputModel.parse({
      dateTime,
      supplierLedgerId,
      billFromAddressId: purchase.billFromAddressId,
      supplierInvoiceNumber: purchase.supplierInvoiceNumber,
      lines: replaced.map((l) => ({ productId: l.productId, quantity: l.quantity, rateBeforeGst: rateOf(loaded.items.get(l.productId)!) / 100, godowns: l.replaceInto })),
      discount: discount / 100,
      kind: "credit",
      remarks: null,
    });
    return { draft, total: Math.round((gross - discount) / 100) * 100 };
  }

  // a purchase return saved. With items replaced, a new purchase comes in with them first (on the supplier's account);
  // then the return, its total off what we owe, the rest paid back now or kept as an advance with them
  async create(rawInput: CreatePurchaseReturnInputModel, actor: ActorModel): Promise<SavedPurchaseReturnModel> {
    const input = createPurchaseReturnInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const replaced = input.lines.filter((l) => l.replaceInto !== null);
      if (replaced.length === 0) {
        const r = await this.createIn(tx, input, actor, null);
        return { transactionId: r.transactionId, assignedId: r.assignedId, total: r.total / 100, purchase: null };
      }
      const loaded = await this.load(tx, input.purchaseTransactionId, false);
      const total = this.figure(loaded, input.lines).total;
      const supplier = await this.supplierOf(tx, loaded.purchase.partyId);
      const rep = this.replacementPurchase(loaded, replaced, input.dateTime, total, supplier.ledgerId);
      const p = await this.purchases.createIn(tx, rep.draft, actor);
      if (toPaise(p.total) !== rep.total) throw new TRPCError({ code: "CONFLICT", message: "The replacement didn't add up. Try again." });
      const r = await this.createIn(tx, input, actor, { purchaseId: p.purchaseId, used: rep.total });
      return { transactionId: r.transactionId, assignedId: r.assignedId, total: r.total / 100, purchase: { transactionId: p.transactionId, assignedId: p.assignedId, total: p.total } };
    });
  }

  // a return inside a save. `replacement`: the new purchase saved with it, and how much of the return it took
  private async createIn(tx: Tx, input: CreatePurchaseReturnInputModel, actor: ActorModel, replacement: { purchaseId: string; used: number } | null) {
    const loaded = await this.load(tx, input.purchaseTransactionId, true);
    const { t, purchase } = loaded;
    const day = indiaDay(input.dateTime);
    const blocked = this.blockedBy(loaded, day);
    if (blocked === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "This purchase is cancelled." });
    if (blocked === "allReturned") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Everything on this purchase has gone back already." });
    if (blocked === "tooLate") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `A debit note for this purchase can't be issued after ${lastNoteDay(indiaDay(t.dateTime))}.` });
    if (day < indiaDay(t.dateTime)) throw new TRPCError({ code: "BAD_REQUEST", message: "A return can't be before its purchase." });
    if (input.supplierCreditNoteDate && input.supplierCreditNoteDate < indiaDay(t.dateTime)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The supplier's credit note can't be before the purchase." });
    }
    // the debit note goes into the return date's month: one whose GSTR-3B is filed takes no more
    await this.transactions.assertOpen(tx, "gstr3b", input.dateTime);

    const f = this.figure(loaded, input.lines);
    const supplier = await this.supplierOf(tx, purchase.partyId);
    const intra = purchase.supplyType !== "inter";
    const cgst = intra ? Math.floor(f.gst / 2) : 0;
    const sgst = intra ? f.gst - cgst : 0;
    const igst = intra ? 0 : f.gst;

    // the purchase turned round: the supplier owes us the total (off what we owe them), Purchase return up by the
    // value (and the round off), the GST we'd claimed taken back, the cash discount they gave us given back. Then
    // what they pay back now into cash and bank, off their account again
    const lines: PostingLine[] = [
      { ledgerId: supplier.ledgerId, side: "debit", amount: f.total / 100 },
      { ledgerId: await this.accounts.ledgerId(tx, "purchaseReturn"), side: "credit", amount: (f.taxable + f.roundOff) / 100 },
    ];
    if (cgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "inputCgst"), side: "credit", amount: cgst / 100 });
    if (sgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "inputSgst"), side: "credit", amount: sgst / 100 });
    if (igst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "inputIgst"), side: "credit", amount: igst / 100 });
    if (f.discount > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "discountReceived"), side: "debit", amount: f.discount / 100 });

    // cash pays back all that's left once a replacement has taken its part; credit none of it
    const refund = await this.refundLines(tx, input.cashAmount, input.bankParts);
    const rest = f.total - (replacement?.used ?? 0);
    if (input.refundIn === "cash" && refund.paid !== rest) throw new TRPCError({ code: "BAD_REQUEST", message: "Cash and bank must add up to the total." });
    if (input.refundIn === "credit" && refund.paid !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A refund on credit takes nothing back now." });
    if (refund.paid > 0) lines.push({ ledgerId: supplier.ledgerId, side: "credit", amount: refund.paid / 100 });
    lines.push(...refund.lines);
    const onAccount = f.total - refund.paid;

    const created = await this.transactions.create(
      tx,
      { type: "purchase_return", subType: replacement ? "replacement" : undefined, dateTime: input.dateTime, amount: f.total / 100, remarks: input.remarks, lines },
      actor,
    );

    // each pack's cost without the packs going back: they leave at what they came in at, their value and their share
    // of the purchase's charges (by value, as when bought). Read before the stock leaves
    const itemsValue = [...loaded.items.values()].reduce((a, i) => a + i.gross - i.off, 0);
    const chargeTaxable = Math.round((loaded.charges * 100) / (100 + Math.max(0, ...[...loaded.items.values()].map((i) => i.gstRate))));
    const ids = input.lines.map((l) => l.productId);
    const before = await tx
      .select({ id: productsTable.id, quantity: productsTable.quantity, cost: productsTable.weightedAverageCost })
      .from(productsTable)
      .where(inArray(productsTable.id, ids));
    // the packs leave the godowns picked
    await this.stock.apply(
      tx,
      input.lines.flatMap((l) => l.godowns.map((g) => ({ productId: l.productId, godownId: g.godownId, delta: -g.quantity }))),
    );
    for (const b of before) {
      const item = loaded.items.get(b.id)!;
      const q = input.lines.find((l) => l.productId === b.id)!.quantity;
      const itemCharge = itemsValue === 0 ? 0 : Math.round((chargeTaxable * (item.gross - item.off)) / itemsValue);
      const value = rateOf(item) * q + Math.round((itemCharge * q) / item.bought);
      const was = b.cost === null ? null : toPaise(Number(b.cost));
      const cost = weightedCost({ quantity: b.quantity, cost: was }, { quantity: -q, value: -value });
      // a cost history point only when the cost changes
      if (cost !== was) {
        await tx.update(productsTable).set({ weightedAverageCost: fromPaise(cost) }).where(eq(productsTable.id, b.id));
        await tx.insert(productCostHistoryTable).values({ productId: b.id, weightedAverageCost: fromPaise(cost), quantityAfter: b.quantity - q, transactionId: created.id });
      }
    }

    const [saved] = await tx
      .insert(purchaseReturnsTable)
      .values({
        transactionId: created.id,
        purchaseId: purchase.id,
        returnDate: day,
        transactedIn: refund.paid === 0 ? "credit" : onAccount === 0 ? "cash" : "both",
        supplierCreditNoteNumber: input.supplierCreditNoteNumber,
        supplierCreditNoteDate: input.supplierCreditNoteDate,
        subtotal: fromPaise(f.taxable),
        discountAmount: fromPaise(f.discount),
        gstAmount: fromPaise(f.gst),
        reasonKind: input.reasonKind,
        reason: input.reasonKind === "other" ? input.reason : null,
        remark: input.remarks,
        exchangePurchaseId: replacement?.purchaseId ?? null,
      })
      .returning({ id: purchaseReturnsTable.id });

    // each item's part out of each godown, its share of the purchase line split over the godowns by quantity (the last
    // godown takes what's left)
    const godowns = await tx
      .select({ id: godownsTable.id, name: godownsTable.godownName })
      .from(godownsTable)
      .where(inArray(godownsTable.id, [...new Set(input.lines.flatMap((l) => l.godowns.map((g) => g.godownId)))]));
    const holds = await tx
      .select({ id: productGodownsTable.id, productId: productGodownsTable.productId, godownId: productGodownsTable.godownId })
      .from(productGodownsTable)
      .where(inArray(productGodownsTable.productId, ids));
    const rows = f.items.flatMap((it) => {
      let gross = it.gross;
      let gst = it.gst;
      return it.line.godowns.map((g, k) => {
        const last = k === it.line.godowns.length - 1;
        const part = (whole: number, left: number) => (last ? left : Math.round((whole * g.quantity) / it.line.quantity));
        const row = { gross: part(it.gross, gross), gst: part(it.gst, gst) };
        gross -= row.gross;
        gst -= row.gst;
        return {
          returnId: saved!.id,
          purchaseProductId: it.item.purchaseProductId,
          productGodownId: holds.find((h) => h.productId === it.line.productId && h.godownId === g.godownId)?.id ?? null,
          godownName: (godowns.find((x) => x.id === g.godownId)?.name ?? "").slice(0, 20),
          quantity: g.quantity,
          grossProductPrice: fromPaise(row.gross),
          discountAmount: fromPaise(0),
          gstAmount: fromPaise(row.gst),
        };
      });
    });
    await tx.insert(purchaseReturnProductsTable).values(rows);

    // each bank account paid back into, how and the account as it is now
    if (refund.banks.length > 0) {
      const accs = await tx
        .select({ id: bankDetailsTable.id, bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
        .from(bankDetailsTable)
        .where(inArray(bankDetailsTable.id, refund.banks.map((b) => b.part.bankDetailsId)));
      const savedAt = Date.now();
      for (const [i, b] of refund.banks.entries()) {
        const acc = accs.find((a) => a.id === b.part.bankDetailsId)!;
        await tx.insert(transactionBankDetailsTable).values({
          createdAt: new Date(savedAt + i),
          transactionId: created.id,
          bankDetailsId: b.part.bankDetailsId,
          amount: fromPaise(toPaise(b.part.amount)),
          mode: BANK_MODE_DB[b.part.mode],
          referenceNumber: b.part.referenceNumber,
          bankNameSnapshot: acc.bankName.slice(0, 100),
          bankAccountLast4Snapshot: acc.accountNumber.slice(-4),
          bankIfscSnapshot: acc.ifsc?.slice(0, 11) ?? null,
        });
      }
    }

    // what stays on their account settles what we owe on this bill first, then our other dues to them oldest first;
    // past them it's an advance with them
    if (onAccount > 0) {
      const onBill = Math.min(onAccount, f.dueLeft);
      if (onBill > 0 && loaded.due) await tx.insert(dueSettlementsTable).values({ dueId: loaded.due.id, transactionId: created.id, amount: fromPaise(onBill) });
      if (onAccount > onBill) await this.dues.settleOldestIn(tx, { kind: "creditor", partyId: supplier.party.id, transactionId: created.id, amount: (onAccount - onBill) / 100 });
    }
    return { transactionId: created.id, assignedId: created.assignedId, total: f.total };
  }

  // a return as our debit note
  async debitNote(input: PurchaseReturnIdInputModel): Promise<DebitNoteModel> {
    const [row] = await db
      .select({ r: purchaseReturnsTable, t: transactionsTable, p: purchasesTable })
      .from(purchaseReturnsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, purchaseReturnsTable.transactionId))
      .innerJoin(purchasesTable, eq(purchasesTable.id, purchaseReturnsTable.purchaseId))
      .where(eq(purchaseReturnsTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase return not found." });
    const { r, t, p } = row;
    const [purchaseT] = await db.select({ id: transactionsTable.id, assignedId: transactionsTable.assignedId }).from(transactionsTable).where(eq(transactionsTable.id, p.transactionId));
    const parts = await db
      .select({
        prp: purchaseReturnProductsTable,
        productId: purchaseProductsTable.productId,
        name: purchaseProductsTable.productNameSnapshot,
        gstRate: purchaseProductsTable.gstRate,
        hsn: { hsn4Digit: anyProduct.hsn4Digit, hsn8Digit: anyProduct.hsn8Digit },
      })
      .from(purchaseReturnProductsTable)
      .innerJoin(purchaseProductsTable, eq(purchaseProductsTable.id, purchaseReturnProductsTable.purchaseProductId))
      .leftJoin(productsTable, eq(productsTable.id, purchaseProductsTable.productId))
      .leftJoin(deletedProductsTable, eq(deletedProductsTable.id, purchaseProductsTable.productId))
      .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .where(eq(purchaseReturnProductsTable.returnId, r.id))
      .orderBy(asc(purchaseReturnProductsTable.createdAt), asc(purchaseReturnProductsTable.id));
    const byProduct = new Map<string, { title: string; hsn: string | null; gstRate: number; quantity: number; gross: number; off: number; gst: number }>();
    for (const x of parts) {
      const line = byProduct.get(x.productId) ?? { title: x.name, hsn: x.hsn.hsn8Digit ?? x.hsn.hsn4Digit ?? null, gstRate: x.gstRate, quantity: 0, gross: 0, off: 0, gst: 0 };
      line.quantity += x.prp.quantity;
      line.gross += toPaise(x.prp.grossProductPrice);
      line.off += toPaise(x.prp.discountAmount);
      line.gst += toPaise(x.prp.gstAmount);
      byProduct.set(x.productId, line);
    }
    const lines = [...byProduct.entries()].map(([productId, l]) => ({
      productId,
      title: l.title,
      hsn: l.hsn,
      quantity: l.quantity,
      rate: Math.round(l.gross / l.quantity) / 100,
      discount: l.off / 100,
      taxable: (l.gross - l.off) / 100,
      gstRate: l.gstRate,
      gst: l.gst / 100,
    }));
    const gstAll = toPaise(r.gstAmount);
    const intra = p.supplyType !== "inter";
    const cgst = intra ? Math.floor(gstAll / 2) : 0;
    const total = toPaise(t.amount);
    // how it was settled: what the replacement purchase took, what the supplier paid back (what came off their account
    // again), and the rest on their account
    const [replacement] = r.exchangePurchaseId
      ? await db
          .select({ transactionId: purchasesTable.transactionId, assignedId: transactionsTable.assignedId, total: transactionsTable.amount })
          .from(purchasesTable)
          .innerJoin(transactionsTable, eq(transactionsTable.id, purchasesTable.transactionId))
          .where(eq(purchasesTable.id, r.exchangePurchaseId))
      : [];
    const replaced = replacement ? Math.min(total, toPaise(replacement.total)) : 0;
    const supplierNet = (
      await db
        .select({ amount: ledgerEntriesTable.amount, side: ledgerEntriesTable.transactionType })
        .from(ledgerEntriesTable)
        .innerJoin(ledgersTable, eq(ledgersTable.id, ledgerEntriesTable.ledgerId))
        .where(and(eq(ledgerEntriesTable.transactionId, t.id), eq(ledgerEntriesTable.isReversal, false), eq(ledgersTable.referenceTable, "parties")))
    ).reduce((a, e) => a + (e.side === "debit" ? 1 : -1) * toPaise(e.amount), 0);
    const refunded = total - supplierNet;
    const onAccount = total - replaced - refunded;
    return {
      transactionId: t.id,
      assignedId: t.assignedId,
      noteDate: r.returnDate,
      status: t.status === "cancelled" ? "cancelled" : "active",
      company: t.companySnapshot ?? (await this.settings.get("company")),
      purchase: { transactionId: purchaseT!.id, assignedId: purchaseT!.assignedId, invoiceDate: p.invoiceDate, supplierInvoiceNumber: p.supplierInvoiceNumber },
      supplier: { name: p.partyNameSnapshot, phone: p.partyPhoneSnapshot, gstin: p.billFromGstinSnapshot },
      supplierCreditNote: r.supplierCreditNoteNumber || r.supplierCreditNoteDate ? { number: r.supplierCreditNoteNumber, date: r.supplierCreditNoteDate } : null,
      supplyType: intra ? "intra" : "inter",
      reasonKind: r.reasonKind,
      reason: r.reason,
      remarks: t.remarks,
      lines,
      taxable: toPaise(r.subtotal) / 100,
      cgst: cgst / 100,
      sgst: (intra ? gstAll - cgst : 0) / 100,
      igst: (intra ? 0 : gstAll) / 100,
      discount: Number(r.discountAmount),
      roundOff: (total - (toPaise(r.subtotal) + gstAll - toPaise(r.discountAmount))) / 100,
      total: total / 100,
      settled: { onAccount: onAccount / 100, refunded: refunded / 100, replaced: replaced / 100 },
      replacementPurchase: replacement ? { transactionId: replacement.transactionId, assignedId: replacement.assignedId } : null,
      createdByName: t.createdByName ?? "",
    };
  }
}
