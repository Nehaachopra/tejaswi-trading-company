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
  productGodownsTable,
  productsTable,
  returnDeliveriesTable,
  saleProductsTable,
  saleReturnProductsTable,
  saleReturnsTable,
  salesTable,
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
import SaleService from "../sale";
import { figureSale } from "../sale/figures";
import { createSaleInputModel } from "../sale/model";
import SettingService from "../setting";
import StockEngine, { type Tx } from "../stock/engine";
import TransactionService from "../transaction";
import { settleLedger } from "../transaction/settle";
import {
  type CreateSaleReturnInputModel,
  createSaleReturnInputModel,
  type CreditNoteModel,
  type ExchangeInputModel,
  exchangeInputModel,
  type PendingSaleReplacementModel,
  type ReturnLineInputModel,
  type SaleForReturnModel,
  type SaleReturnIdInputModel,
  type SavedSaleReturnModel,
  type SendReplacementInputModel,
  sendReplacementInputModel,
} from "./model";

// the day a moment falls on in India, as YYYY-MM-DD
const indiaDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);

// the last day a credit note can be issued against a sale: 30 November after the end of the sale's financial year
// (April to March), GST section 34
const lastNoteDay = (saleDay: string) => {
  const [y, m] = saleDay.split("-").map(Number) as [number, number];
  return `${m >= 4 ? y + 1 : y}-11-30`;
};

// one item of the sale, its godown parts added up, and what's come back of it on returns still in place
// a sale as a return works it out
type Loaded = Awaited<ReturnType<SaleReturnService["load"]>>;

type SaleItem = {
  productId: string;
  name: string;
  saleProductId: string;
  sold: number;
  gross: number;
  off: number;
  gst: number;
  gstRate: number;
  godowns: { godownId: string; name: string; quantity: number }[];
  returned: { quantity: number; gross: number; off: number; gst: number };
};

// what a pack sold for before GST, in paise
const rateOf = (i: SaleItem) => Math.round((i.gross - i.off) / i.sold);

// what the items replaced later keep on the customer's account until they go out, in paise: each at the rate it sold at
// with its GST, rounded to the rupee, never more than `most` (what's left of the return)
const laterHoldOf = (loaded: { items: Map<string, SaleItem> }, lines: ReturnLineInputModel[], most: number) => {
  let gross = 0;
  for (const l of lines) {
    if (!l.replaceLater) continue;
    const value = rateOf(loaded.items.get(l.productId)!) * l.quantity;
    gross += value + Math.round((value * loaded.items.get(l.productId)!.gstRate) / 100);
  }
  return gross === 0 ? 0 : Math.max(0, Math.min(Math.round(gross / 100) * 100, most));
};

// Sale returns: goods coming back against one saved sale (the admin's). They go back into the godowns picked, and that
// much of the sale is turned round at the price it sold at: its value and GST (a credit note), and its share of the
// cash discount. Transport, packing and loading are never refunded. The total comes off what the customer owes (anything
// over stays as advance, or is paid back now from cash and bank); a walk-in is paid back. An exchange saves the return
// with a new sale to the same buyer, the return counted as received on it. Stock, ledgers, dues and the return are
// saved together or not at all
export default class SaleReturnService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly sales = new SaleService(accounts, transactions, parties),
    private readonly settings = new SettingService(),
    private readonly stock = new StockEngine(),
  ) {}

  // the sale, its items (each once, with what's come back of it before) and the cash discount already taken back
  private async load(q: Tx, saleTransactionId: string, lock: boolean) {
    const base = q.select().from(transactionsTable).where(eq(transactionsTable.id, saleTransactionId));
    const [t] = lock ? await base.for("update") : await base;
    if (!t || t.type !== "sale") throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
    const [sale] = await q.select().from(salesTable).where(eq(salesTable.transactionId, t.id));
    if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
    const parts = await q
      .select({ sp: saleProductsTable, godownId: productGodownsTable.godownId })
      .from(saleProductsTable)
      .leftJoin(productGodownsTable, eq(productGodownsTable.id, saleProductsTable.productGodownId))
      .where(eq(saleProductsTable.saleId, sale.id))
      .orderBy(asc(saleProductsTable.createdAt), asc(saleProductsTable.id));
    const items = new Map<string, SaleItem>();
    for (const { sp, godownId } of parts) {
      const item = items.get(sp.productId) ?? {
        productId: sp.productId,
        name: sp.productNameSnapshot,
        saleProductId: sp.id,
        sold: 0,
        gross: 0,
        off: 0,
        gst: 0,
        gstRate: sp.gstRate,
        godowns: [],
        returned: { quantity: 0, gross: 0, off: 0, gst: 0 },
      };
      item.sold += sp.quantity;
      item.gross += toPaise(sp.grossProductPrice);
      item.off += toPaise(sp.discountAmount);
      item.gst += toPaise(sp.gstAmount);
      if (godownId) item.godowns.push({ godownId, name: sp.godownName, quantity: sp.quantity });
      items.set(sp.productId, item);
    }
    // what's come back on returns still in place
    const back = await q
      .select({ srp: saleReturnProductsTable, productId: saleProductsTable.productId })
      .from(saleReturnProductsTable)
      .innerJoin(saleReturnsTable, eq(saleReturnsTable.id, saleReturnProductsTable.returnId))
      .innerJoin(transactionsTable, eq(transactionsTable.id, saleReturnsTable.transactionId))
      .innerJoin(saleProductsTable, eq(saleProductsTable.id, saleReturnProductsTable.saleProductId))
      .where(and(eq(saleReturnsTable.saleId, sale.id), eq(transactionsTable.status, "active")));
    for (const { srp, productId } of back) {
      const r = items.get(productId)!.returned;
      r.quantity += srp.quantity;
      r.gross += toPaise(srp.grossProductPrice);
      r.off += toPaise(srp.discountAmount);
      r.gst += toPaise(srp.gstAmount);
    }
    // the charges (GST in them) and the cash discount, as the sale had them: a return never changes them
    const charges = toPaise(sale.shippingAmount) + toPaise(sale.packagingAmount) + toPaise(sale.handlingAmount);
    // what's still owed on this bill (a customer's): its due less what's been settled on it by transactions in place
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
    return { t, sale, items, charges, discount: toPaise(sale.discountAmount), due: due ? { id: due.id, left: dueLeft } : null };
  }

  // the bill as if only `left` of each item had been sold, in paise, worked out as a sale's is: each item at the rate it
  // sold at with its GST, the charges as they were (their GST taken out at the highest rate among the items still on
  // it), the cash discount as it was (never more than the bill), rounded to the rupee
  private bill(loaded: Loaded, left: (i: SaleItem) => number) {
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

  // why the sale can't take a return, if it can't
  private blockedBy(loaded: Loaded, day: string) {
    if (loaded.t.status === "cancelled") return "cancelled" as const;
    if ([...loaded.items.values()].every((i) => i.returned.quantity >= i.sold)) return "allReturned" as const;
    if (day > lastNoteDay(indiaDay(loaded.t.dateTime))) return "tooLate" as const;
    return null;
  }

  // the customer's ledger (a sale to a saved customer) with what they owe now (or hold as advance), in paise
  private async customerOf(q: Tx, partyId: string | null) {
    if (!partyId) return null;
    const [ledger] = await q.select().from(ledgersTable).where(and(eq(ledgersTable.referenceTable, "parties"), eq(ledgersTable.referenceId, partyId)));
    const [party] = await q.select().from(partiesTable).where(eq(partiesTable.id, partyId));
    if (!ledger || !party) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
    const balance = toPaise(ledger.balance);
    return { ledgerId: ledger.id, party, owed: ledger.balanceType === "debit" ? balance : 0, held: ledger.balanceType === "credit" ? balance : 0 };
  }

  // the sale as the return form opens it
  async forReturn(input: { transactionId: string }): Promise<SaleForReturnModel> {
    return db.transaction(async (tx) => {
      const loaded = await this.load(tx, input.transactionId, false);
      const { t, sale, items } = loaded;
      const customer = await this.customerOf(tx, sale.partyId);
      // the bill as it stands (after any earlier returns), and what's been paid towards it
      const before = this.bill(loaded, (i) => i.sold - i.returned.quantity);
      return {
        transactionId: t.id,
        assignedId: t.assignedId,
        dateTime: t.dateTime,
        kind: sale.transactedIn === "credit" ? "credit" : "cash",
        customer: customer ? { ledgerId: customer.ledgerId, partyId: customer.party.id, name: customer.party.name, owed: customer.owed / 100, held: customer.held / 100 } : null,
        buyer: sale.partyId ? null : { name: sale.partyNameSnapshot, phone: sale.partyPhoneSnapshot },
        supplyType: sale.supplyType === "inter" ? "inter" : "intra",
        total: Number(t.amount),
        billNow: before.total / 100,
        paid: (before.total - (loaded.due?.left ?? 0)) / 100,
        transportCharges: Number(sale.shippingAmount),
        packingCharges: Number(sale.packagingAmount),
        loadingCharges: Number(sale.handlingAmount),
        discount: loaded.discount / 100,
        lines: [...items.values()].map((i) => ({
          productId: i.productId,
          name: i.name,
          sold: i.sold,
          returned: i.returned.quantity,
          canReturn: i.sold - i.returned.quantity,
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

  // the return's figures, in paise: the bill as it stands less the bill as if these packs had never been sold (the
  // charges and cash discount as they were), so its value, GST, the discount it gives back and its total are what
  // came off; each item's own line at the rate it sold at, for the credit note
  private figure(loaded: Loaded, lines: ReturnLineInputModel[]) {
    const back = new Map<string, number>();
    for (const l of lines) {
      const i = loaded.items.get(l.productId);
      if (!i) throw new TRPCError({ code: "BAD_REQUEST", message: "An item isn't on this sale." });
      const left = i.sold - i.returned.quantity;
      if (l.quantity > left) throw new TRPCError({ code: "BAD_REQUEST", message: `Only ${left} of ${i.name} can come back.` });
      back.set(l.productId, l.quantity);
    }
    const before = this.bill(loaded, (i) => i.sold - i.returned.quantity);
    const after = this.bill(loaded, (i) => i.sold - i.returned.quantity - (back.get(i.productId) ?? 0));
    const items = lines.map((l) => {
      const item = loaded.items.get(l.productId)!;
      const value = rateOf(item) * l.quantity;
      return { line: l, item, gross: value, off: 0, taxable: value, gst: Math.round((value * item.gstRate) / 100) };
    });
    const taxable = before.taxable - after.taxable;
    const gst = before.gst - after.gst;
    const discount = before.off - after.off;
    const total = before.total - after.total;
    return { items, taxable, gst, discount, total, roundOff: total - (taxable + gst - discount), dueLeft: loaded.due?.left ?? 0 };
  }

  // what a refund's cash and bank parts take out, each part fitting what that place holds today
  private async refundLines(tx: Tx, cashAmount: number, bankParts: MoreBankPartModel[]) {
    const lines: PostingLine[] = [];
    const banks: { part: MoreBankPartModel; ledgerId: string }[] = [];
    const cash = toPaise(cashAmount);
    const cashLedger = cash > 0 ? await settleLedger(tx, this.accounts, "cash", null) : null;
    if (cashLedger) lines.push({ ledgerId: cashLedger, side: "credit", amount: cash / 100 });
    for (const b of bankParts) {
      const ledgerId = await settleLedger(tx, this.accounts, "bank", b.bankDetailsId);
      banks.push({ part: b, ledgerId });
      lines.push({ ledgerId, side: "credit", amount: toPaise(b.amount) / 100 });
    }
    const now = await this.accounts.balances(lines.map((l) => l.ledgerId));
    for (const l of lines) {
      const b = now.get(l.ledgerId)?.today;
      const has = b ? (b.side === "debit" ? 1 : -1) * toPaise(b.amount) : 0;
      if (toPaise(l.amount) > has) throw new TRPCError({ code: "PRECONDITION_FAILED", message: l.ledgerId === cashLedger ? "That's more than there is in cash." : "That's more than there is in the bank account." });
    }
    return { lines, banks, paid: cash + bankParts.reduce((a, b) => a + toPaise(b.amount), 0) };
  }

  // a return inside a save. `exchange`: the new sale it's saved with (a customer's is saved after it, and linked then),
  // and how much of the return that sale took in cash (a walk-in's)
  private async createIn(
    tx: Tx,
    // (an exchange's return has no refundIn: it all goes to the new sale)
    input: Omit<CreateSaleReturnInputModel, "saveKey" | "refundIn" | "customerLedgerId" | "newCustomer"> &
      Partial<Pick<CreateSaleReturnInputModel, "refundIn" | "customerLedgerId" | "newCustomer">>,
    actor: ActorModel,
    exchange: { saleId: string | null; used: number } | null,
  ) {
    const loaded = await this.load(tx, input.saleTransactionId, true);
    const { t, sale } = loaded;
    const day = indiaDay(input.dateTime);
    const blocked = this.blockedBy(loaded, day);
    if (blocked === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "This sale is cancelled." });
    if (blocked === "allReturned") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Everything on this sale has come back already." });
    if (blocked === "tooLate") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `A credit note for this sale can't be issued after ${lastNoteDay(indiaDay(t.dateTime))}.` });
    if (day < indiaDay(t.dateTime)) throw new TRPCError({ code: "BAD_REQUEST", message: "A return can't be before its sale." });
    // the credit note goes into the return date's month: one whose GSTR-1 is filed takes no more
    await this.transactions.assertOpen(tx, "gstr1", input.dateTime);

    const f = this.figure(loaded, input.lines);
    let customer = await this.customerOf(tx, sale.partyId);
    // a walk-in's refund on credit goes to a customer's account: the one picked, or added now
    if (!customer && !exchange && input.refundIn === "credit") {
      if (!input.customerLedgerId && !input.newCustomer) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the customer, or add one." });
      customer = await this.sales.customerIn(tx, { customerLedgerId: input.customerLedgerId ?? null, newCustomer: input.newCustomer ?? null });
    }
    const intra = sale.supplyType !== "inter";
    const cgst = intra ? Math.floor(f.gst / 2) : 0;
    const sgst = intra ? f.gst - cgst : 0;
    const igst = intra ? 0 : f.gst;

    // the sale turned round: Sale return up by the value (and the round off), the GST owed down, the cash discount
    // taken back. Then where the total goes: the customer's account (off what they owe, the rest an advance, any of it
    // paid back now); a walk-in's cash and bank (an exchange's part in cash, taken straight back by its sale)
    const lines: PostingLine[] = [{ ledgerId: await this.accounts.ledgerId(tx, "saleReturn"), side: "debit", amount: (f.taxable + f.roundOff) / 100 }];
    if (cgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputCgst"), side: "debit", amount: cgst / 100 });
    if (sgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputSgst"), side: "debit", amount: sgst / 100 });
    if (igst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputIgst"), side: "debit", amount: igst / 100 });
    if (f.discount > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "discountGiven"), side: "credit", amount: f.discount / 100 });

    const refund = await this.refundLines(tx, input.cashAmount, input.bankParts);
    // items replaced later: a saved customer's only; their value waits on the account until the packs go out
    if (input.lines.some((l) => l.replaceLater) && !sale.partyId) throw new TRPCError({ code: "BAD_REQUEST", message: "A walk-in's replacement goes out now." });
    const laterHold = laterHoldOf(loaded, input.lines, f.total - (exchange?.used ?? 0));
    let onAccount = 0;
    if (customer) {
      // a refund in cash pays back all that's left once a replacement's sale has taken its part and the items replaced
      // later keep theirs; on credit (and an exchange, whose new sale takes it from their account) none of it: it comes
      // off what they owe, the rest an advance
      const refundIn = input.refundIn ?? "credit";
      const rest = f.total - (exchange?.used ?? 0) - laterHold;
      if (refundIn === "cash" && refund.paid !== rest) throw new TRPCError({ code: "BAD_REQUEST", message: "Cash and bank must add up to the total." });
      if (refundIn === "credit" && refund.paid !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A refund on credit pays nothing back now." });
      lines.push({ ledgerId: customer.ledgerId, side: "credit", amount: f.total / 100 });
      if (refund.paid > 0) lines.push({ ledgerId: customer.ledgerId, side: "debit", amount: refund.paid / 100 });
      onAccount = f.total - refund.paid;
    } else {
      // a walk-in: the exchange's part in cash, the rest paid back
      const used = exchange?.used ?? 0;
      if (used + refund.paid !== f.total) {
        throw new TRPCError({ code: "BAD_REQUEST", message: exchange ? "Pay back what's over the new sale." : "Cash and bank must add up to the total." });
      }
      if (used > 0) lines.push({ ledgerId: await settleLedger(tx, this.accounts, "cash", null), side: "credit", amount: used / 100 });
    }
    lines.push(...refund.lines);

    const created = await this.transactions.create(tx, { type: "sale_return", subType: exchange ? "exchange" : undefined, dateTime: input.dateTime, amount: f.total / 100, remarks: input.remarks, lines }, actor);

    // the packs go back into the godowns picked (free stock)
    await this.stock.apply(
      tx,
      input.lines.flatMap((l) => l.godowns.map((g) => ({ productId: l.productId, godownId: g.godownId, delta: g.quantity }))),
    );

    const [saved] = await tx
      .insert(saleReturnsTable)
      .values({
        transactionId: created.id,
        saleId: sale.id,
        returnDate: day,
        transactedIn: !customer ? "cash" : refund.paid === 0 ? "credit" : onAccount === 0 ? "cash" : "both",
        subtotal: fromPaise(f.taxable),
        discountAmount: fromPaise(f.discount),
        gstAmount: fromPaise(f.gst),
        reasonKind: input.reasonKind,
        reason: input.reasonKind === "other" ? input.reason : null,
        remark: input.remarks,
        exchangeSaleId: exchange?.saleId ?? null,
      })
      .returning({ id: saleReturnsTable.id });

    // each item's part into each godown, its share of the sale line split over the godowns by quantity (the last
    // godown takes what's left)
    const godowns = await tx
      .select({ id: godownsTable.id, name: godownsTable.godownName })
      .from(godownsTable)
      .where(inArray(godownsTable.id, [...new Set(input.lines.flatMap((l) => l.godowns.map((g) => g.godownId)))]));
    const holds = await tx
      .select({ id: productGodownsTable.id, productId: productGodownsTable.productId, godownId: productGodownsTable.godownId })
      .from(productGodownsTable)
      .where(inArray(productGodownsTable.productId, input.lines.map((l) => l.productId)));
    const rows = f.items.flatMap((it) => {
      let gross = it.gross;
      let off = it.off;
      let gst = it.gst;
      return it.line.godowns.map((g, k) => {
        const last = k === it.line.godowns.length - 1;
        const part = (whole: number, left: number) => (last ? left : Math.round((whole * g.quantity) / it.line.quantity));
        const row = { gross: part(it.gross, gross), off: part(it.off, off), gst: part(it.gst, gst) };
        gross -= row.gross;
        off -= row.off;
        gst -= row.gst;
        return {
          returnId: saved!.id,
          saleProductId: it.item.saleProductId,
          productGodownId: holds.find((h) => h.productId === it.line.productId && h.godownId === g.godownId)?.id ?? null,
          godownName: godowns.find((x) => x.id === g.godownId)?.name ?? "",
          quantity: g.quantity,
          grossProductPrice: fromPaise(row.gross),
          discountAmount: fromPaise(row.off),
          gstAmount: fromPaise(row.gst),
          // replaced later: its packs still to go out
          replaced: it.line.replaceLater,
        };
      });
    });
    await tx.insert(saleReturnProductsTable).values(rows);

    // each bank account paid back from, how and the account as it is now
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

    // a customer's: what stays on their account settles what's owed on this bill first, then their other dues oldest
    // first; past them it's an advance
    if (customer && onAccount > 0) {
      const onBill = Math.min(onAccount, f.dueLeft);
      if (onBill > 0 && loaded.due) await tx.insert(dueSettlementsTable).values({ dueId: loaded.due.id, transactionId: created.id, amount: fromPaise(onBill) });
      if (onAccount > onBill) await this.dues.settleOldestIn(tx, { kind: "debtor", partyId: customer.party.id, transactionId: created.id, amount: (onAccount - onBill) / 100 });
    }
    return { transactionId: created.id, assignedId: created.assignedId, total: f.total, walkIn: !customer };
  }

  // a replacement's new sale: the replaced items to the same buyer at the rate they first sold at, leaving the godowns
  // given, going where the first sale went. Its cash discount keeps it from coming to more than the return (a rupee of
  // rounding, or a discount the first bill had); a customer's is on credit (the return is on their account), a
  // walk-in's is paid for by the return
  private async replacementSale(tx: Tx, loaded: Loaded, replaced: ReturnLineInputModel[], dateTime: Date, returnTotal: number, customerLedgerId: string | null) {
    const { sale } = loaded;
    const shipTo = {
      addressLine1: sale.shipToAddressLine1Snapshot ?? "",
      landmark: sale.shipToAddressLine2Snapshot ?? "",
      city: sale.shipToCitySnapshot ?? "",
      district: sale.shipToDistrictSnapshot ?? "",
      state: sale.shipToStateSnapshot ?? "",
      stateCode: sale.shipToStateCodeSnapshot,
      postalCode: sale.shipToPostalCodeSnapshot ?? "",
    };
    const billTo = sale.billToCitySnapshot
      ? {
          addressLine1: sale.billToAddressLine1Snapshot ?? "",
          landmark: sale.billToAddressLine2Snapshot ?? "",
          city: sale.billToCitySnapshot,
          district: sale.billToDistrictSnapshot ?? "",
          state: sale.billToStateSnapshot ?? "",
          stateCode: sale.billToStateCodeSnapshot,
          postalCode: sale.billToPostalCodeSnapshot ?? "",
          gstin: sale.billToGstinSnapshot ?? "",
        }
      : null;
    const draft = createSaleInputModel.parse({
      dateTime,
      lines: replaced.map((l) => ({ productId: l.productId, quantity: l.quantity, rateBeforeGst: rateOf(loaded.items.get(l.productId)!) / 100, belowCostOk: true, godowns: l.replaceFrom })),
      kind: customerLedgerId ? "credit" : "cash",
      customerLedgerId,
      shipTo: { address: shipTo },
      ...(customerLedgerId ? {} : { billToAddress: billTo, buyer: { name: sale.partyNameSnapshot, phone: sale.partyPhoneSnapshot ?? "" } }),
    });
    const bill = figureSale(draft, await this.sales.productsIn(tx, draft));
    if (bill.total <= returnTotal) return { sale: draft, total: bill.total };
    // more than the return: the cash discount takes the difference off (the bill before rounding, down to the return)
    const off = bill.total - bill.roundOff - returnTotal;
    const lowered = { ...draft, discount: off / 100 };
    return { sale: lowered, total: figureSale(lowered, await this.sales.productsIn(tx, lowered)).total };
  }

  // a refund saved. With items replaced, a new sale goes out with them at the price they first sold at (that much of
  // the return pays for it); what's left of the return is refunded as asked. A walk-in's is paid back in cash
  async create(rawInput: CreateSaleReturnInputModel, actor: ActorModel): Promise<SavedSaleReturnModel> {
    const input = createSaleReturnInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const replaced = input.lines.filter((l) => l.replaceFrom !== null);
      if (replaced.length === 0) {
        const r = await this.createIn(tx, input, actor, null);
        return { transactionId: r.transactionId, assignedId: r.assignedId, total: r.total / 100, sale: null };
      }
      const loaded = await this.load(tx, input.saleTransactionId, false);
      const total = this.figure(loaded, input.lines).total;
      const customer = await this.customerOf(tx, loaded.sale.partyId);
      const rep = await this.replacementSale(tx, loaded, replaced, input.dateTime, total, customer?.ledgerId ?? null);
      if (customer) {
        // a customer's: the new sale first, on their account; then the return, the rest of it paid back or kept
        const s = await this.sales.createIn(tx, rep.sale, actor);
        const r = await this.createIn(tx, input, actor, { saleId: s.saleId, used: rep.total });
        return { transactionId: r.transactionId, assignedId: r.assignedId, total: r.total / 100, sale: s.saved };
      }
      // a walk-in's: the return first, the new sale paid for out of it, the rest paid back
      if (input.refundIn === "credit") throw new TRPCError({ code: "BAD_REQUEST", message: "With an item replaced, a walk-in's refund is paid back in cash." });
      const r = await this.createIn(tx, input, actor, { saleId: null, used: rep.total });
      const s = await this.sales.createIn(tx, rep.sale, actor, { exchangeIn: total });
      if (s.exchanged !== rep.total) throw new TRPCError({ code: "CONFLICT", message: "The replacement didn't add up. Try again." });
      await tx.update(saleReturnsTable).set({ exchangeSaleId: s.saleId }).where(eq(saleReturnsTable.transactionId, r.transactionId));
      return { transactionId: r.transactionId, assignedId: r.assignedId, total: r.total / 100, sale: s.saved };
    });
  }

  // an exchange saved: the return and its new sale together. A customer's return goes on their account first, so the
  // sale can set it off as an advance; a walk-in's sale is saved first, taking as much of the return as its bill does
  async exchange(rawInput: ExchangeInputModel, actor: ActorModel): Promise<SavedSaleReturnModel> {
    const input = exchangeInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const loaded = await this.load(tx, input.saleReturn.saleTransactionId, false);
      // an item replaced goes out again on the new sale: as many, at the rate it first sold at, from the godowns given
      for (const l of input.saleReturn.lines) {
        if (!l.replaceFrom) continue;
        const item = loaded.items.get(l.productId);
        const on = input.sale.lines.find((x) => x.productId === l.productId);
        const same =
          !!item &&
          !!on &&
          on.quantity === l.quantity &&
          toPaise(on.rateBeforeGst) === rateOf(item) &&
          on.godowns.length === l.replaceFrom.length &&
          on.godowns.every((g) => l.replaceFrom!.some((x) => x.godownId === g.godownId && x.quantity === g.quantity));
        if (!same) throw new TRPCError({ code: "BAD_REQUEST", message: "A replaced item goes on the new sale as it came back." });
      }
      const partyId = loaded.sale.partyId;
      if (partyId) {
        // the new sale is to the same customer
        const ledger = await this.customerOf(tx, partyId);
        if (input.sale.customerLedgerId !== ledger!.ledgerId || input.sale.newCustomer) throw new TRPCError({ code: "BAD_REQUEST", message: "An exchange's sale is to the same customer." });
        // the return first (its link to the sale is set once the sale is saved)
        const r = await this.createIn(tx, input.saleReturn, actor, { saleId: null, used: 0 });
        const s = await this.sales.createIn(tx, input.sale, actor);
        await tx.update(saleReturnsTable).set({ exchangeSaleId: s.saleId }).where(eq(saleReturnsTable.transactionId, r.transactionId));
        return { transactionId: r.transactionId, assignedId: r.assignedId, total: r.total / 100, sale: s.saved };
      }
      // a walk-in: the new sale is a cash sale with no customer
      if (input.sale.kind !== "cash" || input.sale.customerLedgerId || input.sale.newCustomer) throw new TRPCError({ code: "BAD_REQUEST", message: "A walk-in's exchange is a cash sale." });
      // the return first, so what comes back is in stock for the new sale; it takes as much of the return as its bill
      // comes to (worked out ahead, the same way the sale will)
      const total = this.figure(loaded, input.saleReturn.lines).total;
      const bill = figureSale(input.sale, await this.sales.productsIn(tx, input.sale)).total;
      const r = await this.createIn(tx, input.saleReturn, actor, { saleId: null, used: Math.min(total, bill) });
      const s = await this.sales.createIn(tx, input.sale, actor, { exchangeIn: total });
      if (s.exchanged !== Math.min(total, bill)) throw new TRPCError({ code: "CONFLICT", message: "The exchange didn't add up. Try again." });
      await tx.update(saleReturnsTable).set({ exchangeSaleId: s.saleId }).where(eq(saleReturnsTable.transactionId, r.transactionId));
      return { transactionId: r.transactionId, assignedId: r.assignedId, total: r.total / 100, sale: s.saved };
    });
  }

  // each item of a return replaced later: how many, and how many have gone out so far (on sales in place)
  private async owedOn(q: Tx, returnTransactionId: string) {
    const [ret] = await q
      .select({ id: saleReturnsTable.id, returnDate: saleReturnsTable.returnDate, saleId: saleReturnsTable.saleId })
      .from(saleReturnsTable)
      .where(eq(saleReturnsTable.transactionId, returnTransactionId));
    if (!ret) throw new TRPCError({ code: "NOT_FOUND", message: "Sale return not found." });
    const replaced = await q
      .select({ quantity: saleReturnProductsTable.quantity, productId: saleProductsTable.productId, name: saleProductsTable.productNameSnapshot })
      .from(saleReturnProductsTable)
      .innerJoin(saleProductsTable, eq(saleProductsTable.id, saleReturnProductsTable.saleProductId))
      .where(and(eq(saleReturnProductsTable.returnId, ret.id), eq(saleReturnProductsTable.replaced, true)))
      .orderBy(asc(saleReturnProductsTable.createdAt));
    const gone = await q
      .select({ productId: returnDeliveriesTable.productId, quantity: returnDeliveriesTable.quantity })
      .from(returnDeliveriesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, returnDeliveriesTable.deliveryTransactionId))
      .where(and(eq(returnDeliveriesTable.returnTransactionId, returnTransactionId), eq(transactionsTable.status, "active")));
    const items = new Map<string, { productId: string; name: string; replaced: number; gone: number }>();
    for (const r of replaced) {
      const i = items.get(r.productId) ?? { productId: r.productId, name: r.name, replaced: 0, gone: 0 };
      i.replaced += r.quantity;
      items.set(r.productId, i);
    }
    for (const g of gone) {
      const i = items.get(g.productId);
      if (i) i.gone += g.quantity;
    }
    // the sale it came back on
    const [st] = await q
      .select({ transactionId: transactionsTable.id, assignedId: transactionsTable.assignedId })
      .from(salesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, salesTable.transactionId))
      .where(eq(salesTable.id, ret.saleId));
    return { ret, items, sale: st! };
  }

  // a return's items replaced later still to go out: each pack size and how many are owed, at the rate it first sold at
  async pending(input: SaleReturnIdInputModel): Promise<PendingSaleReplacementModel> {
    return db.transaction(async (tx) => {
      const { ret, items, sale } = await this.owedOn(tx, input.transactionId);
      const [t] = await tx.select({ assignedId: transactionsTable.assignedId }).from(transactionsTable).where(eq(transactionsTable.id, input.transactionId));
      const loaded = await this.load(tx, sale.transactionId, false);
      return {
        transactionId: input.transactionId,
        assignedId: t!.assignedId,
        returnDate: ret.returnDate,
        sale,
        customerName: loaded.sale.partyNameSnapshot,
        partyId: loaded.sale.partyId,
        lines: [...items.values()]
          .filter((i) => i.replaced > i.gone)
          .map((i) => {
            const item = loaded.items.get(i.productId)!;
            return { productId: i.productId, name: i.name, quantity: i.replaced - i.gone, rate: rateOf(item) / 100, gstRate: item.gstRate };
          }),
      };
    });
  }

  // replaced packs going out later: a sale to the customer (on credit, at the rate they first sold at, from the godowns
  // given, to where the first sale went), set off against what the return left on their account, and a delivery row for
  // each item
  async send(rawInput: SendReplacementInputModel, actor: ActorModel) {
    const input = sendReplacementInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const [rt] = await tx.select().from(transactionsTable).where(eq(transactionsTable.id, input.returnTransactionId)).for("update");
      if (!rt || rt.type !== "sale_return") throw new TRPCError({ code: "NOT_FOUND", message: "Sale return not found." });
      const { ret, items, sale } = await this.owedOn(tx, input.returnTransactionId);
      if (indiaDay(input.dateTime) < ret.returnDate) throw new TRPCError({ code: "BAD_REQUEST", message: "The new packs can't go before the return." });
      for (const l of input.lines) {
        const i = items.get(l.productId);
        const owed = i ? i.replaced - i.gone : 0;
        if (owed <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "That item isn't waiting to go out." });
        if (l.quantity > owed) throw new TRPCError({ code: "BAD_REQUEST", message: `Only ${owed} of ${i!.name} are still to go.` });
      }
      const loaded = await this.load(tx, sale.transactionId, false);
      const customer = await this.customerOf(tx, loaded.sale.partyId);
      if (!customer) throw new TRPCError({ code: "BAD_REQUEST", message: "A walk-in's replacement goes out now." });
      // the sale as an exchange's replacement is drawn up (no cap: it's set off against what's held), with the vehicle
      // and remarks
      const rep = await this.replacementSale(
        tx,
        loaded,
        input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, godowns: l.from, replaceFrom: l.from, replaceLater: false })),
        input.dateTime,
        Number.MAX_SAFE_INTEGER,
        customer.ledgerId,
      );
      const s = await this.sales.createIn(tx, { ...rep.sale, saveKey: input.saveKey, vehicleNumber: input.vehicleNumber, remarks: input.remarks }, actor);
      // what the return left with them before this sale: set off against it
      const setOff = Math.min(customer.held, toPaise(s.saved.total));
      if (setOff > 0) await this.dues.settleOldestIn(tx, { kind: "debtor", partyId: customer.party.id, transactionId: s.saved.transactionId, amount: setOff / 100 });
      await tx.insert(returnDeliveriesTable).values(
        input.lines.map((l) => ({ returnTransactionId: input.returnTransactionId, deliveryTransactionId: s.saved.transactionId, productId: l.productId, quantity: l.quantity })),
      );
      return s.saved;
    });
  }

  // a return as its credit note
  async creditNote(input: SaleReturnIdInputModel): Promise<CreditNoteModel> {
    const [row] = await db
      .select({ r: saleReturnsTable, t: transactionsTable, s: salesTable })
      .from(saleReturnsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, saleReturnsTable.transactionId))
      .innerJoin(salesTable, eq(salesTable.id, saleReturnsTable.saleId))
      .where(eq(saleReturnsTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sale return not found." });
    const { r, t, s } = row;
    const [saleT] = await db.select({ id: transactionsTable.id, assignedId: transactionsTable.assignedId }).from(transactionsTable).where(eq(transactionsTable.id, s.transactionId));
    const parts = await db
      .select({
        srp: saleReturnProductsTable,
        productId: saleProductsTable.productId,
        name: saleProductsTable.productNameSnapshot,
        gstRate: saleProductsTable.gstRate,
        p: { brand: anyProduct.brand, name: anyProduct.name, hsn4Digit: anyProduct.hsn4Digit, hsn8Digit: anyProduct.hsn8Digit },
      })
      .from(saleReturnProductsTable)
      .innerJoin(saleProductsTable, eq(saleProductsTable.id, saleReturnProductsTable.saleProductId))
      .leftJoin(productsTable, eq(productsTable.id, saleProductsTable.productId))
      .leftJoin(deletedProductsTable, eq(deletedProductsTable.id, saleProductsTable.productId))
      .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .where(eq(saleReturnProductsTable.returnId, r.id))
      .orderBy(asc(saleReturnProductsTable.createdAt), asc(saleReturnProductsTable.id));
    const byProduct = new Map<string, { title: string; hsn: string | null; gstRate: number; quantity: number; gross: number; off: number; gst: number }>();
    for (const x of parts) {
      const line = byProduct.get(x.productId) ?? { title: x.name, hsn: x.p.hsn8Digit ?? x.p.hsn4Digit ?? null, gstRate: x.gstRate, quantity: 0, gross: 0, off: 0, gst: 0 };
      line.quantity += x.srp.quantity;
      line.gross += toPaise(x.srp.grossProductPrice);
      line.off += toPaise(x.srp.discountAmount);
      line.gst += toPaise(x.srp.gstAmount);
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
    const intra = s.supplyType !== "inter";
    const cgst = intra ? Math.floor(gstAll / 2) : 0;
    const total = toPaise(t.amount);
    // how it was settled: what went on the customer's account, what was paid back (cash and bank), and what the
    // exchange's sale took (a customer's: all of it, on their account; a walk-in's: as much as that bill came to)
    const [exchangeSale] = r.exchangeSaleId
      ? await db
          .select({ transactionId: salesTable.transactionId, assignedId: transactionsTable.assignedId, total: transactionsTable.amount })
          .from(salesTable)
          .innerJoin(transactionsTable, eq(transactionsTable.id, salesTable.transactionId))
          .where(eq(salesTable.id, r.exchangeSaleId))
      : [];
    const walkIn = !s.partyId;
    const exchanged = !exchangeSale ? 0 : Math.min(total, toPaise(exchangeSale.total));
    const customerNet = walkIn
      ? 0
      : (
          await db
            .select({ amount: ledgerEntriesTable.amount, side: ledgerEntriesTable.transactionType })
            .from(ledgerEntriesTable)
            .innerJoin(ledgersTable, eq(ledgersTable.id, ledgerEntriesTable.ledgerId))
            .where(and(eq(ledgerEntriesTable.transactionId, t.id), eq(ledgerEntriesTable.isReversal, false), eq(ledgersTable.referenceTable, "parties")))
        ).reduce((a, e) => a + (e.side === "credit" ? 1 : -1) * toPaise(e.amount), 0);
    // a walk-in's is paid back past what the new sale took; a customer's is what came off their account again (the
    // rest is on it, less what the new sale took from it)
    const refunded = walkIn ? total - exchanged : total - customerNet;
    const onAccount = total - exchanged - refunded;
    return {
      transactionId: t.id,
      assignedId: t.assignedId,
      noteDate: r.returnDate,
      status: t.status === "cancelled" ? "cancelled" : "active",
      company: t.companySnapshot ?? (await this.settings.get("company")),
      sale: { transactionId: saleT!.id, assignedId: saleT!.assignedId, invoiceDate: s.invoiceDate },
      buyer: { name: s.partyNameSnapshot, phone: s.partyPhoneSnapshot, gstin: s.billToGstinSnapshot },
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
      settled: { onAccount: onAccount / 100, refunded: refunded / 100, exchanged: exchanged / 100 },
      exchangeSale: exchangeSale ? { transactionId: exchangeSale.transactionId, assignedId: exchangeSale.assignedId } : null,
      createdByName: t.createdByName ?? "",
    };
  }
}
