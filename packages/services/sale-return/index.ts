import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray } from "@repo/database";
import {
  bankDetailsTable,
  categoriesTable,
  deletedProductsTable,
  godownsTable,
  ledgerEntriesTable,
  ledgersTable,
  partiesTable,
  productGodownsTable,
  productsTable,
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
  type ReturnLineInputModel,
  type SaleForReturnModel,
  type SaleReturnIdInputModel,
  type SavedSaleReturnModel,
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
    const earlier = await q
      .select({ discount: saleReturnsTable.discountAmount })
      .from(saleReturnsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, saleReturnsTable.transactionId))
      .where(and(eq(saleReturnsTable.saleId, sale.id), eq(transactionsTable.status, "active")));
    const discountBack = earlier.reduce((a, r) => a + toPaise(r.discount), 0);
    // what the cash discount came off: the items with their GST, and the charges (GST in them)
    const charges = toPaise(sale.shippingAmount) + toPaise(sale.packagingAmount) + toPaise(sale.handlingAmount);
    const itemsGross = [...items.values()].reduce((a, i) => a + i.gross - i.off + i.gst, 0);
    return { t, sale, items, discountBack, discount: toPaise(sale.discountAmount), gross: itemsGross + charges };
  }

  // why the sale can't take a return, if it can't
  private blockedBy(loaded: Awaited<ReturnType<SaleReturnService["load"]>>, day: string) {
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
      return {
        transactionId: t.id,
        assignedId: t.assignedId,
        dateTime: t.dateTime,
        kind: sale.transactedIn === "credit" ? "credit" : "cash",
        customer: customer ? { ledgerId: customer.ledgerId, partyId: customer.party.id, name: customer.party.name, owed: customer.owed / 100, held: customer.held / 100 } : null,
        buyer: sale.partyId ? null : { name: sale.partyNameSnapshot, phone: sale.partyPhoneSnapshot },
        supplyType: sale.supplyType === "inter" ? "inter" : "intra",
        total: Number(t.amount),
        discount: loaded.discount / 100,
        gross: loaded.gross / 100,
        lines: [...items.values()].map((i) => {
          const taxable = i.gross - i.off;
          return {
            productId: i.productId,
            name: i.name,
            sold: i.sold,
            returned: i.returned.quantity,
            canReturn: i.sold - i.returned.quantity,
            price: Math.round((taxable + i.gst) / i.sold) / 100,
            rate: Math.round(taxable / i.sold) / 100,
            gstRate: i.gstRate,
            godowns: i.godowns,
          };
        }),
        lastDay: lastNoteDay(indiaDay(t.dateTime)),
        returnBlockedBy: this.blockedBy(loaded, indiaDay(new Date())),
      };
    });
  }

  // the return's figures, in paise: each item's share of what it sold for (the last of an item takes exactly what's
  // left, so the returns add up to the sale), the cash discount's share by value, the total rounded to the rupee
  private figure(loaded: Awaited<ReturnType<SaleReturnService["load"]>>, lines: ReturnLineInputModel[]) {
    const share = (whole: number, before: number, quantity: number, returnedBefore: number, sold: number) =>
      returnedBefore + quantity === sold ? whole - before : Math.round((whole * quantity) / sold);
    const items = lines.map((l) => {
      const i = loaded.items.get(l.productId);
      if (!i) throw new TRPCError({ code: "BAD_REQUEST", message: "An item isn't on this sale." });
      const left = i.sold - i.returned.quantity;
      if (l.quantity > left) throw new TRPCError({ code: "BAD_REQUEST", message: `Only ${left} of ${i.name} can come back.` });
      const gross = share(i.gross, i.returned.gross, l.quantity, i.returned.quantity, i.sold);
      const off = share(i.off, i.returned.off, l.quantity, i.returned.quantity, i.sold);
      const gst = share(i.gst, i.returned.gst, l.quantity, i.returned.quantity, i.sold);
      return { line: l, item: i, gross, off, taxable: gross - off, gst };
    });
    const taxable = items.reduce((a, i) => a + i.taxable, 0);
    const gst = items.reduce((a, i) => a + i.gst, 0);
    // the cash discount's share: by the value with GST of what comes back, out of what it was taken off; never past
    // what's left of it
    const discount = loaded.gross > 0 ? Math.min(loaded.discount - loaded.discountBack, Math.round((loaded.discount * (taxable + gst)) / loaded.gross)) : 0;
    const figured = taxable + gst - discount;
    const total = Math.round(figured / 100) * 100;
    return { items, taxable, gst, discount, total, roundOff: total - figured };
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
    input: Omit<CreateSaleReturnInputModel, "saveKey">,
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
    const customer = await this.customerOf(tx, sale.partyId);
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
    let onAccount = 0;
    if (customer) {
      // an exchange keeps it all on their account (the new sale takes it); a refund pays back only what's over what
      // they owe
      if (exchange && refund.paid > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "An exchange pays nothing back to a customer." });
      const over = Math.max(0, f.total - customer.owed);
      if (refund.paid > over) throw new TRPCError({ code: "BAD_REQUEST", message: `Only ₹${(over / 100).toLocaleString("en-IN")} can be paid back; the rest comes off what they owe.` });
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

    // a customer's: what stays on their account settles their dues oldest first; past them it's an advance
    if (customer && onAccount > 0) {
      await this.dues.settleOldestIn(tx, { kind: "debtor", partyId: customer.party.id, transactionId: created.id, amount: onAccount / 100 });
    }
    return { transactionId: created.id, assignedId: created.assignedId, total: f.total, walkIn: !customer };
  }

  // a refund saved
  async create(rawInput: CreateSaleReturnInputModel, actor: ActorModel): Promise<SavedSaleReturnModel> {
    const input = createSaleReturnInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const r = await this.createIn(tx, input, actor, null);
      return { transactionId: r.transactionId, assignedId: r.assignedId, total: r.total / 100, sale: null };
    });
  }

  // an exchange saved: the return and its new sale together. A customer's return goes on their account first, so the
  // sale can set it off as an advance; a walk-in's sale is saved first, taking as much of the return as its bill does
  async exchange(rawInput: ExchangeInputModel, actor: ActorModel): Promise<SavedSaleReturnModel> {
    const input = exchangeInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const loaded = await this.load(tx, input.saleReturn.saleTransactionId, false);
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
    const exchanged = !exchangeSale ? 0 : walkIn ? Math.min(total, toPaise(exchangeSale.total)) : total;
    const customerNet = walkIn
      ? 0
      : (
          await db
            .select({ amount: ledgerEntriesTable.amount, side: ledgerEntriesTable.transactionType })
            .from(ledgerEntriesTable)
            .innerJoin(ledgersTable, eq(ledgersTable.id, ledgerEntriesTable.ledgerId))
            .where(and(eq(ledgerEntriesTable.transactionId, t.id), eq(ledgerEntriesTable.isReversal, false), eq(ledgersTable.referenceTable, "parties")))
        ).reduce((a, e) => a + (e.side === "credit" ? 1 : -1) * toPaise(e.amount), 0);
    const onAccount = walkIn || exchangeSale ? 0 : customerNet;
    const refunded = total - onAccount - exchanged;
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
