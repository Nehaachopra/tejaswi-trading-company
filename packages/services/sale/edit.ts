import { TRPCError } from "@trpc/server";
import { and, db, desc, eq, inArray } from "@repo/database";
import {
  bankDetailsTable,
  dueSettlementsTable,
  duesTable,
  godownsTable,
  ledgerEntriesTable,
  ledgersTable,
  partiesTable,
  productGodownsTable,
  returnDeliveriesTable,
  saleOrderProductsTable,
  saleOrdersTable,
  saleProductsTable,
  salePurchaseCreditDetailsTable,
  saleReturnsTable,
  salesTable,
  transactionBankDetailsTable,
  transactionEditLogsTable,
  transactionsTable,
} from "@repo/database/schema";

import AccountsService from "../accounts";
import LedgerEngine from "../accounts/engine";
import type { ActorModel, PostingLine } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import DueService from "../due";
import PartyService from "../party";
import { BANK_MODE_DB } from "../payment/model";
import ProductService from "../product";
import SettingService from "../setting";
import { saleOrderDelivered } from "../sale-order/delivered";
import StockEngine, { type Tx } from "../stock/engine";
import TransactionService from "../transaction";
import { saleReturnLocks } from "../transaction/return-locks";
import { settleLedger } from "../transaction/settle";
import { type EditSaleInputModel, editSaleInputModel, type SaleForEditModel } from "./edit-model";
import { tdsOn } from "../receipt/model";
import { figureSale } from "./figures";
import SaleService from "./index";
import { SALE_TDS_RATE, type SaleAddressInputModel, type SaleIdInputModel, type SavedSaleModel } from "./model";

// the day and the month a moment falls in, in India
const indiaDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);
const indiaMonth = (at: Date) => indiaDay(at).slice(0, 7);
// the day n days after another
const daysOn = (day: string, n: number) => new Date(new Date(`${day}T12:00:00+05:30`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// the ledgers a sale posts that aren't money: Sale, the GST owed and the cash discount (the customer's is added per sale)
const BILL_LEDGERS = ["sale", "outputCgst", "outputSgst", "outputIgst", "discountGiven"] as const;

// an address as a sale keeps it
type Place = Awaited<ReturnType<SaleService["addressOf"]>>;
const typed = (a: SaleAddressInputModel): Place => ({
  id: null,
  line1: a.addressLine1,
  line2: a.landmark || null,
  city: a.city,
  district: a.district,
  state: a.state,
  stateCode: a.stateCode,
  postalCode: a.postalCode,
  gstin: a.gstin ?? null,
});

// lines on the same ledger netted into one (a debit and a credit on cash become what's left of them)
function netLines(lines: { ledgerId: string; paise: number }[]): PostingLine[] {
  const net = new Map<string, number>();
  for (const l of lines) net.set(l.ledgerId, (net.get(l.ledgerId) ?? 0) + l.paise);
  return [...net]
    .filter(([, p]) => p !== 0)
    .map(([ledgerId, p]) => ({ ledgerId, side: p > 0 ? "debit" : "credit", amount: Math.abs(p) / 100 }));
}

// Editing a sale (the admin's): its items (every one kept, quantities only up, prices free), charges, discount, day
// (within its month), addresses, vehicle and remarks. Its old ledger effect is reversed and the new one posted; the stock
// moves only by what changed; its due follows the new total. What the edit leaves against what was paid towards the
// bill is taken now or refunded (cash), or left owed or as an advance (credit). Each edit is kept in the edit log
export default class SaleEditService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly sales = new SaleService(accounts, transactions, parties, dues),
    private readonly engine = new LedgerEngine(),
    private readonly stock = new StockEngine(),
    private readonly products = new ProductService(),
    private readonly settings = new SettingService(),
  ) {}

  // the sale's row, its transaction, its lines and its due (a customer's), locked inside a save
  private async load(q: Tx, transactionId: string, lock: boolean) {
    const base = q.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
    const [t] = lock ? await base.for("update") : await base;
    if (!t || t.type !== "sale") throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
    const [sale] = await q.select().from(salesTable).where(eq(salesTable.transactionId, t.id));
    if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
    const parts = await q
      .select({ id: saleProductsTable.id, productId: saleProductsTable.productId, quantity: saleProductsTable.quantity, gross: saleProductsTable.grossProductPrice, discount: saleProductsTable.discountAmount, godownId: productGodownsTable.godownId })
      .from(saleProductsTable)
      .leftJoin(productGodownsTable, eq(productGodownsTable.id, saleProductsTable.productGodownId))
      .where(eq(saleProductsTable.saleId, sale.id));
    const [due] = await q.select().from(duesTable).where(eq(duesTable.transactionId, t.id));
    // what's been settled on its due (by it and by later receipts that are still in place)
    const settlements = due
      ? await q
          .select({ id: dueSettlementsTable.id, amount: dueSettlementsTable.amount, transactionId: dueSettlementsTable.transactionId, assignedId: transactionsTable.assignedId, createdAt: dueSettlementsTable.createdAt })
          .from(dueSettlementsTable)
          .innerJoin(transactionsTable, eq(transactionsTable.id, dueSettlementsTable.transactionId))
          .where(and(eq(dueSettlementsTable.dueId, due.id), eq(transactionsTable.status, "active")))
          .orderBy(desc(dueSettlementsTable.createdAt))
      : [];
    return { t, sale, parts, due: due ?? null, settlements };
  }

  // each ledger's net on the transaction, in paise (debit as plus)
  private async nets(q: Tx, transactionId: string) {
    const entries = await q.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.transactionId, transactionId));
    const net = new Map<string, number>();
    for (const e of entries) net.set(e.ledgerId, (net.get(e.ledgerId) ?? 0) + (e.transactionType === "debit" ? 1 : -1) * toPaise(e.amount));
    return net;
  }

  // the money ledgers on the transaction (cash, bank accounts, TDS receivable) and their net, in paise: every ledger
  // but the bill's own and the customer's
  private async moneyNets(q: Tx, transactionId: string, customerLedgerId: string | null) {
    // one at a time: a transaction runs one query at once
    const bill = new Set<string>();
    for (const k of BILL_LEDGERS) bill.add(await this.accounts.ledgerId(q, k));
    const net = await this.nets(q, transactionId);
    return [...net].filter(([id, p]) => p !== 0 && !bill.has(id) && id !== customerLedgerId).map(([ledgerId, paise]) => ({ ledgerId, paise }));
  }

  // why it can't be edited, if it can't
  private async blockedBy(q: Tx, t: { id: string; status: string; dateTime: Date }) {
    if (t.status === "cancelled") return "cancelled" as const;
    if (await this.transactions.filed(q, "gstr1", t.dateTime)) return "gstFiled" as const;
    // a return's replacement: an exchange's new sale, or one a return's packs replaced later went out on (goods that
    // came back on it don't block it: those items are locked instead)
    const [sale] = await q.select({ id: salesTable.id }).from(salesTable).where(eq(salesTable.transactionId, t.id));
    if (sale) {
      const [exchange] = await q.select({ id: saleReturnsTable.id }).from(saleReturnsTable).where(eq(saleReturnsTable.exchangeSaleId, sale.id));
      if (exchange) return "replacement" as const;
      const [delivery] = await q.select({ id: returnDeliveriesTable.id }).from(returnDeliveriesTable).where(eq(returnDeliveriesTable.deliveryTransactionId, t.id)).limit(1);
      if (delivery) return "replacement" as const;
      // every item came back (refunded or replaced): nothing left to edit
      if ((await saleReturnLocks(q, sale.id)).allReturned) return "returned" as const;
    }
    return null;
  }

  // the sale as the edit form opens it
  async forEdit(input: SaleIdInputModel): Promise<SaleForEditModel> {
    return db.transaction(async (tx) => {
      const { t, sale, parts, due, settlements } = await this.load(tx, input.transactionId, false);
      const customer = sale.partyId ? await this.accounts.ledgerOf(tx, "parties", sale.partyId) : null;
      // each item once, its godown parts under it, at the price it sold at
      const byProduct = new Map<string, SaleForEditModel["lines"][number]>();
      for (const p of parts) {
        const line = byProduct.get(p.productId) ?? { productId: p.productId, quantity: 0, rateBeforeGst: 0, godowns: [] };
        line.quantity += p.quantity;
        line.rateBeforeGst = Math.round(((toPaise(p.gross) - toPaise(p.discount)) / p.quantity)) / 100;
        if (p.godownId) line.godowns.push({ godownId: p.godownId, quantity: p.quantity });
        byProduct.set(p.productId, line);
      }
      const money = await this.moneyNets(tx, t.id, customer?.id ?? null);
      const tdsId = await this.accounts.ledgerId(tx, "tdsReceivable");
      const banks = await tx.select().from(transactionBankDetailsTable).where(eq(transactionBankDetailsTable.transactionId, t.id));
      const bankSum = banks.reduce((a, b) => a + toPaise(b.amount), 0);
      const tds = money.filter((m) => m.ledgerId === tdsId).reduce((a, m) => a + m.paise, 0);
      const moneyIn = money.filter((m) => m.ledgerId !== tdsId).reduce((a, m) => a + m.paise, 0);
      // a customer's: what's settled on this bill; a walk-in's: what came in
      const paid = due ? settlements.reduce((a, s) => a + toPaise(s.amount), 0) : moneyIn;
      // a customer's: what the sale settled on its own past the money and TDS it took (an advance set off), and each
      // later receipt's part (the oldest first)
      const ownSettled = settlements.filter((s) => s.transactionId === t.id).reduce((a, s) => a + toPaise(s.amount), 0);
      const setOff = due ? Math.max(0, ownSettled - moneyIn - tds) : 0;
      // credit: the period it was saved with
      const [credit] = await tx
        .select({ days: salePurchaseCreditDetailsTable.creditPeriodInDays })
        .from(salePurchaseCreditDetailsTable)
        .where(eq(salePurchaseCreditDetailsTable.transactionId, t.id));
      const receipts = settlements
        .filter((s) => s.transactionId !== t.id)
        .reverse()
        .map((s) => ({ assignedId: s.assignedId, amount: Number(s.amount) }));
      const place = (id: string | null, snap: { line1: string | null; line2: string | null; city: string | null; district: string | null; state: string | null; stateCode: string | null; postalCode: string | null; gstin?: string | null }) =>
        id
          ? { addressId: id }
          : {
              address: {
                addressLine1: snap.line1 ?? "",
                landmark: snap.line2 ?? "",
                city: snap.city ?? "",
                district: snap.district ?? "",
                state: snap.state ?? "",
                stateCode: snap.stateCode as SaleAddressInputModel["stateCode"],
                postalCode: snap.postalCode ?? "",
                gstin: snap.gstin ?? null,
              },
            };
      return {
        transactionId: t.id,
        assignedId: t.assignedId,
        dateTime: t.dateTime,
        kind: sale.transactedIn as "cash" | "credit",
        creditPeriodDays: sale.transactedIn === "credit" ? (credit?.days ?? null) : null,
        customer: customer && sale.partyId ? { ledgerId: customer.id, partyId: sale.partyId, name: customer.name } : null,
        buyer: sale.partyId ? null : { name: sale.partyNameSnapshot, phone: sale.partyPhoneSnapshot ?? "" },
        saleOrderId: sale.orderId,
        lines: [...byProduct.values()],
        discount: Number(sale.discountAmount),
        transportCharges: Number(sale.shippingAmount),
        packingCharges: Number(sale.packagingAmount),
        loadingCharges: Number(sale.handlingAmount),
        billTo:
          sale.billToAddressId || sale.billToCitySnapshot
            ? place(sale.billToAddressId, {
                line1: sale.billToAddressLine1Snapshot,
                line2: sale.billToAddressLine2Snapshot,
                city: sale.billToCitySnapshot,
                district: sale.billToDistrictSnapshot,
                state: sale.billToStateSnapshot,
                stateCode: sale.billToStateCodeSnapshot,
                postalCode: sale.billToPostalCodeSnapshot,
                gstin: sale.billToGstinSnapshot,
              })
            : null,
        shipTo: place(sale.shipToAddressId, {
          line1: sale.shipToAddressLine1Snapshot,
          line2: sale.shipToAddressLine2Snapshot,
          city: sale.shipToCitySnapshot,
          district: sale.shipToDistrictSnapshot,
          state: sale.shipToStateSnapshot,
          stateCode: sale.shipToStateCodeSnapshot,
          postalCode: sale.shipToPostalCodeSnapshot,
        }),
        vehicleNumber: sale.vehicleNumber,
        remarks: sale.remarks,
        total: Number(t.amount),
        paid: paid / 100,
        received: {
          cash: Math.max(0, moneyIn - bankSum) / 100,
          tds: tds / 100,
          banks: banks.map((b) => ({ bankName: b.bankNameSnapshot, last4: b.bankAccountLast4Snapshot, mode: b.mode, amount: Number(b.amount) })),
          setOff: setOff / 100,
          receipts,
        },
        editBlockedBy: await this.blockedBy(tx, t),
        ...(await saleReturnLocks(tx, sale.id).then((l) => ({ lockedLines: [...l.locked].map(([productId, why]) => ({ productId, why })), firstReturnDate: l.firstReturn }))),
      };
    });
  }

  // saves an edit
  async edit(rawInput: EditSaleInputModel, actor: ActorModel): Promise<SavedSaleModel> {
    const input = editSaleInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const { t, sale, parts: oldParts, due, settlements } = await this.load(tx, input.transactionId, true);
      const blocked = await this.blockedBy(tx, t);
      if (blocked === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "This sale is cancelled." });
      if (blocked === "gstFiled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That month's GSTR-1 is filed. Use a sale return instead." });
      if (blocked === "replacement") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A return's replacement can't be edited." });
      if (blocked === "returned") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Every item on this sale came back; it can't be edited." });
      if (indiaMonth(input.dateTime) !== indiaMonth(t.dateTime)) throw new TRPCError({ code: "BAD_REQUEST", message: "The date stays in the sale's own month." });
      // returns still in place: the day stays on or before the first one's
      const locks = await saleReturnLocks(tx, sale.id);
      if (locks.firstReturn && indiaDay(input.dateTime) > locks.firstReturn) throw new TRPCError({ code: "BAD_REQUEST", message: "The date can't move past this sale's first return." });
      if (oldParts.some((p) => !p.godownId)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A godown this sale used is gone." });

      // every item kept, none fewer than before (fewer is a return)
      const before = new Map<string, number>();
      for (const p of oldParts) before.set(p.productId, (before.get(p.productId) ?? 0) + p.quantity);
      // each item's rate before GST as it was saved (as the edit form opens it), for the edit log
      const rateBefore = new Map<string, number>();
      for (const p of oldParts) rateBefore.set(p.productId, Math.round((toPaise(p.gross) - toPaise(p.discount)) / p.quantity) / 100);
      for (const [productId, qty] of before) {
        const line = input.lines.find((l) => l.productId === productId);
        if (!line) throw new TRPCError({ code: "BAD_REQUEST", message: "An item can't be taken off in an edit. Use a sale return." });
        if (line.quantity < qty) throw new TRPCError({ code: "BAD_REQUEST", message: "A quantity can't go down in an edit. Use a sale return." });
        // refunded, or its replacement still to go: as it was
        if (locks.locked.has(productId) && (line.quantity !== qty || Math.abs(line.rateBeforeGst - (rateBefore.get(productId) ?? 0)) > 0.005))
          throw new TRPCError({ code: "BAD_REQUEST", message: "An item refunded, or with its replacement still to go, stays as it was." });
      }

      const company = await this.settings.get("company", tx);
      const products = await this.sales.productsIn(tx, input);
      const { parts, priced, chargeTaxable, gstAll, off, total, roundOff } = figureSale(input, products);

      // the customer: the sale's own, or (a walk-in put on credit) one picked or added now
      let customer: { ledgerId: string; party: typeof partiesTable.$inferSelect } | null = null;
      if (sale.partyId) {
        const ledger = await this.accounts.ledgerOf(tx, "parties", sale.partyId);
        const [party] = await tx.select().from(partiesTable).where(eq(partiesTable.id, sale.partyId));
        customer = { ledgerId: ledger.id, party: party! };
      } else if (input.kind === "credit") {
        if (!input.customerLedgerId && !input.newCustomer) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the customer, or add one." });
        const c = await this.sales.customerIn(tx, input);
        customer = { ledgerId: c.ledgerId, party: c.party };
      }

      // where it's billed and goes, as on a new sale
      const billTo = customer
        ? input.billToAddressId
          ? await this.sales.addressOf(tx, customer.party.id, input.billToAddressId)
          : await this.sales.defaultAddressOf(tx, customer.party.id)
        : input.billToAddress
          ? typed(input.billToAddress)
          : null;
      let shipTo: Place;
      if (input.shipTo === null) {
        const home = customer ? await this.sales.defaultAddressOf(tx, customer.party.id) : null;
        if (!home) throw new TRPCError({ code: "BAD_REQUEST", message: "Type where it goes." });
        shipTo = home;
      } else if ("addressId" in input.shipTo) {
        if (!customer) throw new TRPCError({ code: "BAD_REQUEST", message: "Type where it goes." });
        shipTo = await this.sales.addressOf(tx, customer.party.id, input.shipTo.addressId);
      } else shipTo = typed(input.shipTo.address);
      const intra = shipTo.stateCode === company.stateCode;
      const cgst = intra ? Math.floor(gstAll / 2) : 0;
      const sgst = intra ? gstAll - cgst : 0;
      const igst = intra ? 0 : gstAll;

      // what was paid towards the bill, and what the edit leaves: more owed (plus) or paid over (minus)
      const money = await this.moneyNets(tx, t.id, customer?.ledgerId ?? null);
      const moneyAll = money.reduce((a, m) => a + m.paise, 0);
      const paid = due ? settlements.reduce((a, s) => a + toPaise(s.amount), 0) : moneyAll;
      const balance = total - paid;
      const moved = toPaise(input.cashAmount) + input.bankParts.reduce((a, b) => a + toPaise(b.amount), 0);
      // cash: a bill up takes money now (a walk-in all of it, a customer some of it at most); a bill down pays back what
      // was paid over (a walk-in all of it, a customer any part: the rest stays as their advance); credit: nothing moves
      let received = 0;
      let refunded = 0;
      // a customer's, as a cash sale's: the TDS they deducted on what came in, and an advance of theirs set off
      let tds = 0;
      let setOff = 0;
      if (input.kind === "cash") {
        if (balance > 0) {
          if (!customer && moved !== balance) throw new TRPCError({ code: "BAD_REQUEST", message: "Cash and bank must add up to what's left to receive." });
          if (customer) {
            // their account besides this bill: what they owe from before, or an advance with us
            const [l] = await tx.select({ balance: ledgersTable.balance, side: ledgersTable.balanceType }).from(ledgersTable).where(eq(ledgersTable.id, customer.ledgerId));
            const account = l ? (l.side === "debit" ? 1 : -1) * toPaise(Number(l.balance)) : 0;
            const besides = account - (due ? toPaise(due.amount) - paid : 0);
            setOff = input.advanceSetOff ? Math.min(Math.max(0, -besides), balance) : 0;
            const most = balance - setOff + Math.max(0, besides);
            tds = input.tdsDeducted ? toPaise(tdsOn(moved / 100, SALE_TDS_RATE)) : 0;
            // a paisa off the bill or all they owe from rounding is taken as exactly that
            if (input.tdsDeducted) for (const target of [balance - setOff, most]) if (Math.abs(moved + tds - target) <= 1) tds = target - moved;
            // (a bill left as it was, still cash: nothing need come in now; what's left stays owed)
            const sameBill = total === toPaise(Number(t.amount)) && sale.transactedIn === input.kind;
            if (moved + tds > most || (moved <= 0 && setOff === 0 && !sameBill)) throw new TRPCError({ code: "BAD_REQUEST", message: "Receive some of what they owe, and no more." });
            if (tds > 0) {
              if (!customer.party.pan && !input.customerPan) throw new TRPCError({ code: "BAD_REQUEST", message: "Give the customer's PAN." });
              if (!customer.party.pan) await tx.update(partiesTable).set({ pan: input.customerPan }).where(eq(partiesTable.id, customer.party.id));
            }
          }
          received = moved;
        } else if (balance < 0) {
          if (!customer && moved !== -balance) throw new TRPCError({ code: "BAD_REQUEST", message: "Refund what was paid over, in full." });
          if (customer && (moved <= 0 || moved > -balance)) throw new TRPCError({ code: "BAD_REQUEST", message: "Pay back some of what was paid over, and no more." });
          refunded = moved;
        } else if (moved !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing is left to receive." });
      } else if (!customer) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the customer, or add one." });

      // the ledgers again: the old effect reversed (on its own day), the new one posted on the sale's day
      await this.engine.reverse(tx, { transactionId: t.id, dateTime: t.dateTime });
      const raw: { ledgerId: string; paise: number }[] = [];
      // the money already in stays where it went
      for (const m of money) raw.push(m);
      // what came in now, or went back
      const moneyLedgers: { ledgerId: string; part: (typeof input.bankParts)[number] | null; paise: number }[] = [];
      if (toPaise(input.cashAmount) > 0) moneyLedgers.push({ ledgerId: await settleLedger(tx, this.accounts, "cash", null), part: null, paise: toPaise(input.cashAmount) });
      for (const b of input.bankParts) moneyLedgers.push({ ledgerId: await settleLedger(tx, this.accounts, "bank", b.bankDetailsId), part: b, paise: toPaise(b.amount) });
      for (const m of moneyLedgers) raw.push({ ledgerId: m.ledgerId, paise: refunded > 0 ? -m.paise : m.paise });
      // the customer: owes the bill, less what's come in through this sale (now and before, TDS too), plus a refund
      if (tds > 0) raw.push({ ledgerId: await this.accounts.ledgerId(tx, "tdsReceivable"), paise: tds });
      if (customer) raw.push({ ledgerId: customer.ledgerId, paise: total - (moneyAll + received + tds - refunded) });
      else if (moneyAll + received - refunded !== total) throw new TRPCError({ code: "BAD_REQUEST", message: "Cash and bank must add up to the total." });
      if (off > 0) raw.push({ ledgerId: await this.accounts.ledgerId(tx, "discountGiven"), paise: off });
      raw.push({ ledgerId: await this.accounts.ledgerId(tx, "sale"), paise: -(priced.subtotal + chargeTaxable + roundOff) });
      if (cgst > 0) raw.push({ ledgerId: await this.accounts.ledgerId(tx, "outputCgst"), paise: -cgst });
      if (sgst > 0) raw.push({ ledgerId: await this.accounts.ledgerId(tx, "outputSgst"), paise: -sgst });
      if (igst > 0) raw.push({ ledgerId: await this.accounts.ledgerId(tx, "outputIgst"), paise: -igst });
      await this.engine.post(tx, { transactionId: t.id, dateTime: input.dateTime, lines: netLines(raw) });

      // the stock moves by what changed in each godown: more leaves (from what an open order holds back first), less
      // comes back free
      const was = new Map<string, number>();
      for (const p of oldParts) was.set(`${p.productId}|${p.godownId}`, (was.get(`${p.productId}|${p.godownId}`) ?? 0) + p.quantity);
      const now = new Map<string, number>();
      for (const p of parts) now.set(`${p.line.productId}|${p.godownId}`, (now.get(`${p.line.productId}|${p.godownId}`) ?? 0) + p.quantity);
      const held = new Map<string, number>();
      const [order] = sale.orderId ? await tx.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, sale.orderId)).for("update") : [];
      // what an open order this sale dispatches still holds back of each item
      if (order?.status === "pending") {
        const ordered = await tx.select({ productId: saleOrderProductsTable.productId, quantity: saleOrderProductsTable.quantityOrdered }).from(saleOrderProductsTable).where(eq(saleOrderProductsTable.saleOrderId, order.id));
        const went = await saleOrderDelivered(tx, order.id);
        for (const o of ordered) held.set(o.productId, Math.max(0, o.quantity - (went.get(o.productId) ?? 0)));
      }
      const keys = new Set([...was.keys(), ...now.keys()]);
      await this.stock.apply(
        tx,
        [...keys].flatMap((key) => {
          const [productId, godownId] = key.split("|") as [string, string];
          const delta = (now.get(key) ?? 0) - (was.get(key) ?? 0);
          if (delta <= 0) return [{ productId, godownId, delta: -delta }];
          const fromHeld = Math.min(delta, held.get(productId) ?? 0);
          held.set(productId, (held.get(productId) ?? 0) - fromHeld);
          return [
            { productId, godownId, delta: -fromHeld, reserved: true },
            { productId, godownId, delta: -(delta - fromHeld) },
          ];
        }),
      );

      // its lines: a godown part kept is changed in place (a return may point at it later), a new one added, one now
      // empty dropped
      const godowns = await tx.select({ id: godownsTable.id, name: godownsTable.godownName }).from(godownsTable).where(inArray(godownsTable.id, [...new Set(parts.map((p) => p.godownId))]));
      const holds = await tx
        .select({ id: productGodownsTable.id, productId: productGodownsTable.productId, godownId: productGodownsTable.godownId })
        .from(productGodownsTable)
        .where(inArray(productGodownsTable.productId, input.lines.map((l) => l.productId)));
      const kept = new Set<string>();
      for (const [i, p] of parts.entries()) {
        const values = {
          saleId: sale.id,
          productId: p.line.productId,
          productNameSnapshot: p.product.name,
          quantity: p.quantity,
          productGodownId: holds.find((h) => h.productId === p.line.productId && h.godownId === p.godownId)?.id ?? null,
          godownName: godowns.find((g) => g.id === p.godownId)?.name ?? "",
          grossProductPrice: fromPaise(Math.max(p.product.listRate * p.quantity, priced.priced[i]!.value)),
          discountAmount: fromPaise(Math.max(0, p.product.listRate * p.quantity - priced.priced[i]!.value)),
          gstRate: Math.round(p.product.gstRate),
          gstAmount: fromPaise(priced.priced[i]!.gst),
        };
        const old = oldParts.find((o) => o.productId === p.line.productId && o.godownId === p.godownId);
        if (old) {
          kept.add(old.id);
          await tx.update(saleProductsTable).set(values).where(eq(saleProductsTable.id, old.id));
        } else await tx.insert(saleProductsTable).values(values);
      }
      const gone = oldParts.filter((o) => !kept.has(o.id)).map((o) => o.id);
      // a line goods came back on stays
      if (gone.some((id) => locks.referenced.has(id))) throw new TRPCError({ code: "BAD_REQUEST", message: "A godown goods came back on stays on the sale." });
      if (gone.length > 0) await tx.delete(saleProductsTable).where(inArray(saleProductsTable.id, gone));

      // an open order this sale dispatches: complete once everything ordered has gone out
      if (order?.status === "pending") {
        const ordered = await tx.select({ productId: saleOrderProductsTable.productId, quantity: saleOrderProductsTable.quantityOrdered }).from(saleOrderProductsTable).where(eq(saleOrderProductsTable.saleOrderId, order.id));
        const went = await saleOrderDelivered(tx, order.id);
        if (ordered.every((o) => (went.get(o.productId) ?? 0) >= o.quantity)) await tx.update(saleOrdersTable).set({ status: "completed" }).where(eq(saleOrdersTable.id, order.id));
      }

      // the sale as it now reads
      const party = customer?.party ?? null;
      await tx
        .update(salesTable)
        .set({
          partyId: party?.id ?? null,
          partyNameSnapshot: (party?.name ?? input.buyer?.name ?? sale.partyNameSnapshot).slice(0, 150),
          partyPhoneSnapshot: party?.phone ?? (input.buyer ? input.buyer.phone || null : sale.partyPhoneSnapshot),
          partyEmailSnapshot: party?.email ?? null,
          billToAddressId: billTo?.id ?? null,
          billToGstinSnapshot: billTo?.gstin ?? null,
          billToAddressLine1Snapshot: billTo?.line1.slice(0, 200) ?? null,
          billToAddressLine2Snapshot: billTo?.line2?.slice(0, 200) ?? null,
          billToCitySnapshot: billTo?.city.slice(0, 100) ?? null,
          billToDistrictSnapshot: billTo?.district.slice(0, 100) ?? null,
          billToStateSnapshot: billTo?.state.slice(0, 100) ?? null,
          billToStateCodeSnapshot: billTo?.stateCode ?? null,
          billToPostalCodeSnapshot: billTo?.postalCode ?? null,
          shipToAddressId: shipTo.id,
          shipToAddressLine1Snapshot: shipTo.line1.slice(0, 200),
          shipToAddressLine2Snapshot: shipTo.line2?.slice(0, 200) ?? null,
          shipToCitySnapshot: shipTo.city.slice(0, 100),
          shipToDistrictSnapshot: shipTo.district.slice(0, 100),
          shipToStateSnapshot: shipTo.state.slice(0, 100),
          shipToStateCodeSnapshot: shipTo.stateCode,
          shipToPostalCodeSnapshot: shipTo.postalCode,
          supplyType: intra ? "intra" : "inter",
          vehicleNumber: input.vehicleNumber,
          subtotal: fromPaise(priced.subtotal),
          discountAmount: fromPaise(off),
          gstAmount: fromPaise(gstAll),
          shippingAmount: fromPaise(toPaise(input.transportCharges)),
          packagingAmount: fromPaise(toPaise(input.packingCharges)),
          handlingAmount: fromPaise(toPaise(input.loadingCharges)),
          remarks: input.remarks,
          invoiceDate: indiaDay(input.dateTime),
        })
        .where(eq(salesTable.id, sale.id));
      await tx.update(transactionsTable).set({ dateTime: input.dateTime, amount: fromPaise(total), remarks: input.remarks }).where(eq(transactionsTable.id, t.id));

      // each bank account's part of what came in now
      const bankIn = received > 0 ? moneyLedgers.filter((m) => m.part) : [];
      if (bankIn.length > 0) {
        const accs = await tx
          .select({ id: bankDetailsTable.id, bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
          .from(bankDetailsTable)
          .where(inArray(bankDetailsTable.id, bankIn.map((b) => b.part!.bankDetailsId)));
        const savedAt = Date.now();
        for (const [i, b] of bankIn.entries()) {
          const acc = accs.find((a) => a.id === b.part!.bankDetailsId)!;
          await tx.insert(transactionBankDetailsTable).values({
            createdAt: new Date(savedAt + i),
            transactionId: t.id,
            bankDetailsId: b.part!.bankDetailsId,
            amount: fromPaise(b.paise),
            mode: BANK_MODE_DB[b.part!.mode],
            referenceNumber: b.part!.referenceNumber,
            bankNameSnapshot: acc.bankName.slice(0, 100),
            bankAccountLast4Snapshot: acc.accountNumber.slice(-4),
            bankIfscSnapshot: acc.ifsc?.slice(0, 11) ?? null,
          });
        }
      }

      // the due follows the new total: what was settled past it is let go (the newest first: it's their advance, or
      // what was refunded); a walk-in put on credit gets one, what they paid settling it
      // credit: due after its period (none: no set day); cash: no day
      const dueOn = input.kind === "credit" && input.creditPeriodDays !== null ? daysOn(indiaDay(input.dateTime), input.creditPeriodDays) : null;
      if (customer) {
        if (due) {
          await tx.update(duesTable).set({ amount: fromPaise(total), dueOn }).where(eq(duesTable.id, due.id));
          let over = paid - total;
          for (const s of settlements) {
            if (over <= 0) break;
            const take = Math.min(over, toPaise(s.amount));
            if (take === toPaise(s.amount)) await tx.delete(dueSettlementsTable).where(eq(dueSettlementsTable.id, s.id));
            else await tx.update(dueSettlementsTable).set({ amount: fromPaise(toPaise(s.amount) - take) }).where(eq(dueSettlementsTable.id, s.id));
            over -= take;
          }
        } else {
          const dueId = await this.dues.createIn(tx, {
            kind: "debtor",
            party: { id: customer.party.id, name: customer.party.name, phone: customer.party.phone },
            transactionId: t.id,
            amount: total / 100,
            dueOn,
            terms: null,
          });
          const settled = Math.min(total, moneyAll);
          if (settled > 0) await tx.insert(dueSettlementsTable).values({ dueId, transactionId: t.id, amount: fromPaise(settled) });
        }
        // what came in now settles what they owe, oldest first, as a sale's does
        if (received + tds + setOff > 0) await this.dues.settleOldestIn(tx, { kind: "debtor", partyId: customer.party.id, transactionId: t.id, amount: (received + tds + setOff) / 100 });
      }

      // the credit period kept with the sale: credit with one has it (changed or added), anything else has none
      const [creditBefore] = await tx
        .select({ days: salePurchaseCreditDetailsTable.creditPeriodInDays })
        .from(salePurchaseCreditDetailsTable)
        .where(eq(salePurchaseCreditDetailsTable.transactionId, t.id));
      await tx.delete(salePurchaseCreditDetailsTable).where(eq(salePurchaseCreditDetailsTable.transactionId, t.id));
      if (input.kind === "credit" && input.creditPeriodDays !== null)
        await tx.insert(salePurchaseCreditDetailsTable).values({ transactionId: t.id, creditPeriodInDays: input.creditPeriodDays });

      // a pack size added with no selling price saved: the price it sold at becomes its price, unless sold at a loss
      for (const [i, l] of input.lines.entries()) {
        if (!products[i]!.unpriced || l.belowCostOk || before.has(l.productId)) continue;
        const priceAfterGst = Math.round(toPaise(l.rateBeforeGst) * (1 + products[i]!.gstRate / 100)) / 100;
        await this.products.setPriceIn(tx, l.productId, priceAfterGst, products[i]!.gstRate, actor);
      }

      // the edit log: what changed, from what to what (the items in one order, so the same items read the same)
      const byId = <T extends { productId: string }>(a: T[]) => [...a].sort((x, y) => x.productId.localeCompare(y.productId));
      const changes = [
        { field: "date", old: indiaDay(t.dateTime), new: indiaDay(input.dateTime) },
        { field: "kind", old: sale.transactedIn, new: input.kind },
        { field: "creditPeriodDays", old: creditBefore?.days ?? null, new: input.kind === "credit" ? input.creditPeriodDays : null },
        { field: "total", old: Number(t.amount), new: total / 100 },
        {
          field: "items",
          old: byId([...before].map(([id, q]) => ({ productId: id, quantity: q, rate: rateBefore.get(id) ?? 0 }))),
          new: byId(input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, rate: l.rateBeforeGst }))),
        },
        { field: "discount", old: Number(sale.discountAmount), new: off / 100 },
        { field: "charges", old: [sale.shippingAmount, sale.packagingAmount, sale.handlingAmount].map(Number), new: [input.transportCharges, input.packingCharges, input.loadingCharges] },
        { field: "shipTo", old: [sale.shipToAddressLine1Snapshot, sale.shipToCitySnapshot, sale.shipToPostalCodeSnapshot].join(", "), new: [shipTo.line1, shipTo.city, shipTo.postalCode].join(", ") },
        { field: "vehicleNumber", old: sale.vehicleNumber, new: input.vehicleNumber },
        { field: "remarks", old: sale.remarks, new: input.remarks },
        { field: "customer", old: sale.partyNameSnapshot, new: party?.name ?? input.buyer?.name ?? sale.partyNameSnapshot },
        ...(received > 0 ? [{ field: "received", old: null, new: received / 100 }] : []),
        ...(tds > 0 ? [{ field: "tds", old: null, new: tds / 100 }] : []),
        ...(refunded > 0 ? [{ field: "refunded", old: null, new: refunded / 100 }] : []),
      ].filter((c) => JSON.stringify(c.old) !== JSON.stringify(c.new));
      // nothing changed: no edit is recorded
      if (changes.length > 0) await tx.insert(transactionEditLogsTable).values({ transactionId: t.id, editedById: actor.id, editedByName: actor.name.slice(0, 30), changes });

      return { transactionId: t.id, assignedId: t.assignedId, total: total / 100 };
    });
  }
}
