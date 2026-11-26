import { TRPCError } from "@trpc/server";
import { and, asc, db, desc, eq, inArray } from "@repo/database";
import {
  bankDetailsTable,
  dueSettlementsTable,
  duesTable,
  ledgerEntriesTable,
  productCostHistoryTable,
  productsTable,
  purchaseProductsTable,
  purchaseReturnsTable,
  purchasesTable,
  returnDeliveriesTable,
  salePurchaseCreditDetailsTable,
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
import type { Tx } from "../stock/engine";
import TransactionService from "../transaction";
import { settleLedger } from "../transaction/settle";
import { weightedCost } from "./cost";
import { type EditPurchaseInputModel, editPurchaseInputModel, type PurchaseForEditModel } from "./edit-model";
import type { PurchaseIdInputModel, SavedPurchaseModel } from "./model";

// the day and the month a moment falls in, in India
const indiaDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);
const indiaMonth = (at: Date) => indiaDay(at).slice(0, 7);
// the day n days after another
const daysOn = (day: string, n: number) => new Date(new Date(`${day}T12:00:00+05:30`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
// what a ledger holds today, debit as plus, in paise
const heldPaise = (b: { amount: number; side: "debit" | "credit" } | undefined) => (b ? (b.side === "debit" ? 1 : -1) * toPaise(b.amount) : 0);

// the ledgers a purchase posts that aren't money: Purchase, the GST we claim and the cash discount received (the
// supplier's is added per purchase)
const BILL_LEDGERS = ["purchase", "inputCgst", "inputSgst", "inputIgst", "discountReceived"] as const;

// one godown part of an item as the purchase keeps it
type Part = { id: string; productId: string; quantity: number; gross: number; off: number; gstRate: number };

// a purchase's figures from its parts (each a godown's share of an item), in paise, as a new purchase works them out:
// each part's value (its gross less its discount), its share of the charges' value (taken out at the highest GST rate,
// spread by value, the last part taking what rounding leaves) and its GST; then the total rounded to the rupee
function figure(parts: Part[], charges: number, discount: number) {
  const itemsValue = parts.reduce((a, p) => a + p.gross - p.off, 0);
  const chargeTaxable = Math.round((charges * 100) / (100 + Math.max(0, ...parts.map((p) => p.gstRate))));
  let left = chargeTaxable;
  const priced = parts.map((p, i) => {
    const value = p.gross - p.off;
    const charge = i === parts.length - 1 ? left : itemsValue === 0 ? 0 : Math.round((chargeTaxable * value) / itemsValue);
    left -= charge;
    return { ...p, value, charge, gst: Math.round((value * p.gstRate) / 100) };
  });
  const itemsGst = priced.reduce((a, p) => a + p.gst, 0);
  const gstAll = itemsGst + charges - chargeTaxable;
  const gross = itemsValue + charges + itemsGst;
  if (discount > gross) throw new TRPCError({ code: "BAD_REQUEST", message: "The discount can't be more than the bill." });
  const figured = gross - discount;
  const total = Math.round(figured / 100) * 100;
  return { priced, itemsValue, chargeTaxable, gstAll, total, roundOff: total - figured };
}

// lines on the same ledger netted into one
function netLines(lines: { ledgerId: string; paise: number }[]): PostingLine[] {
  const net = new Map<string, number>();
  for (const l of lines) net.set(l.ledgerId, (net.get(l.ledgerId) ?? 0) + l.paise);
  return [...net]
    .filter(([, p]) => p !== 0)
    .map(([ledgerId, p]) => ({ ledgerId, side: p > 0 ? "debit" : "credit", amount: Math.abs(p) / 100 }));
}

// Editing a purchase (the admin's), as editing a sale: each item's rate and discount (quantities and godowns as they
// are), the charges, the cash discount, the supplier's bill number and day (within its month), the vehicle and remarks.
// Its old ledger effect is reversed and the new one posted; each pack's cost moves by what its packs' value changed;
// its due follows the new total. What the edit leaves against what was paid is paid now or taken back (cash), or left
// owed or as an advance (credit). Each edit is kept in the edit log; nothing changed records nothing
export default class PurchaseEditService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly engine = new LedgerEngine(),
  ) {}

  // the purchase's row, its transaction, its parts, the supplier's ledger and its due, locked inside a save
  private async load(q: Tx, transactionId: string, lock: boolean) {
    const base = q.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
    const [t] = lock ? await base.for("update") : await base;
    if (!t || t.type !== "purchase") throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found." });
    const [purchase] = await q.select().from(purchasesTable).where(eq(purchasesTable.transactionId, t.id));
    if (!purchase || !purchase.partyId) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found." });
    const rows = await q
      .select()
      .from(purchaseProductsTable)
      .where(eq(purchaseProductsTable.purchaseId, purchase.id))
      .orderBy(asc(purchaseProductsTable.createdAt), asc(purchaseProductsTable.id));
    const parts: (Part & { name: string })[] = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      name: r.productNameSnapshot,
      quantity: r.quantity,
      gross: toPaise(Number(r.grossProductPrice)),
      off: toPaise(Number(r.discountAmount)),
      gstRate: r.gstRate,
    }));
    const supplier = await this.accounts.ledgerOf(q, "parties", purchase.partyId);
    const [due] = await q.select().from(duesTable).where(eq(duesTable.transactionId, t.id));
    // what's been settled on its due (by it and by later payments still in place), the newest first
    const settlements = due
      ? await q
          .select({ id: dueSettlementsTable.id, amount: dueSettlementsTable.amount })
          .from(dueSettlementsTable)
          .innerJoin(transactionsTable, eq(transactionsTable.id, dueSettlementsTable.transactionId))
          .where(and(eq(dueSettlementsTable.dueId, due.id), eq(transactionsTable.status, "active")))
          .orderBy(desc(dueSettlementsTable.createdAt))
      : [];
    return { t, purchase, parts, supplier, due: due ?? null, settlements };
  }

  // the money ledgers on the transaction (cash, bank accounts) and their net, in paise (debit as plus): every ledger
  // but the bill's own and the supplier's
  private async moneyNets(q: Tx, transactionId: string, supplierLedgerId: string) {
    const bill = new Set<string>();
    for (const k of BILL_LEDGERS) bill.add(await this.accounts.ledgerId(q, k));
    const entries = await q.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.transactionId, transactionId));
    const net = new Map<string, number>();
    for (const e of entries) net.set(e.ledgerId, (net.get(e.ledgerId) ?? 0) + (e.transactionType === "debit" ? 1 : -1) * toPaise(e.amount));
    return [...net].filter(([id, p]) => p !== 0 && !bill.has(id) && id !== supplierLedgerId).map(([ledgerId, paise]) => ({ ledgerId, paise }));
  }

  // why it can't be edited, if it can't: cancelled, its GSTR-3B month filed, goods gone back on it (a return's figures
  // rest on its rates), or it's a return's replacement (bought at the original rate)
  private async blockedBy(q: Tx, t: { id: string; status: string; dateTime: Date }, purchaseId: string) {
    if (t.status === "cancelled") return "cancelled" as const;
    if (await this.transactions.filed(q, "gstr3b", t.dateTime)) return "gstFiled" as const;
    const returned = await q
      .select({ id: purchaseReturnsTable.id })
      .from(purchaseReturnsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, purchaseReturnsTable.transactionId))
      .where(and(eq(purchaseReturnsTable.purchaseId, purchaseId), eq(transactionsTable.status, "active")))
      .limit(1);
    if (returned.length > 0) return "returned" as const;
    const [replacement] = await q.select({ id: returnDeliveriesTable.id }).from(returnDeliveriesTable).where(eq(returnDeliveriesTable.deliveryTransactionId, t.id)).limit(1);
    if (replacement) return "replacement" as const;
    return null;
  }

  // the purchase as the edit form opens it
  async forEdit(input: PurchaseIdInputModel): Promise<PurchaseForEditModel> {
    return db.transaction(async (tx) => {
      const { t, purchase, parts, supplier, due, settlements } = await this.load(tx, input.transactionId, false);
      // each item once, its godown parts added up
      const byProduct = new Map<string, PurchaseForEditModel["lines"][number] & { gross: number; off: number }>();
      for (const p of parts) {
        const l = byProduct.get(p.productId) ?? { productId: p.productId, name: p.name, quantity: 0, rateBeforeGst: 0, discount: 0, gstRate: p.gstRate, gross: 0, off: 0 };
        l.quantity += p.quantity;
        l.gross += p.gross;
        l.off += p.off;
        byProduct.set(p.productId, l);
      }
      const money = await this.moneyNets(tx, t.id, supplier.id);
      const paid = due ? settlements.reduce((a, s) => a + toPaise(s.amount), 0) : -money.reduce((a, m) => a + m.paise, 0);
      const [credit] = await tx
        .select({ days: salePurchaseCreditDetailsTable.creditPeriodInDays })
        .from(salePurchaseCreditDetailsTable)
        .where(eq(salePurchaseCreditDetailsTable.transactionId, t.id));
      return {
        transactionId: t.id,
        assignedId: t.assignedId,
        dateTime: t.dateTime,
        supplierInvoiceNumber: purchase.supplierInvoiceNumber,
        kind: purchase.transactedIn as "cash" | "credit",
        creditPeriodDays: credit?.days ?? null,
        supplier: { ledgerId: supplier.id, partyId: purchase.partyId!, name: supplier.name },
        supplyType: purchase.supplyType as "intra" | "inter",
        lines: [...byProduct.values()].map(({ gross, off, ...l }) => ({ ...l, rateBeforeGst: Math.round(gross / l.quantity) / 100, discount: off / 100 })),
        freightCharges: Number(purchase.freightAmount),
        packingCharges: Number(purchase.packagingAmount),
        loadingCharges: Number(purchase.handlingAmount),
        otherCharges: Number(purchase.otherAmount),
        discount: Number(purchase.discountAmount),
        vehicleNumber: purchase.vehicleNumber,
        remarks: purchase.remarks,
        total: Number(t.amount),
        paid: paid / 100,
        editBlockedBy: await this.blockedBy(tx, t, purchase.id),
      };
    });
  }

  // saves an edit
  async edit(rawInput: EditPurchaseInputModel, actor: ActorModel): Promise<SavedPurchaseModel> {
    const input = editPurchaseInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      const { t, purchase, parts: oldParts, supplier, due, settlements } = await this.load(tx, input.transactionId, true);
      const blocked = await this.blockedBy(tx, t, purchase.id);
      if (blocked === "cancelled") throw new TRPCError({ code: "CONFLICT", message: "This purchase is cancelled." });
      if (blocked === "gstFiled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That month's GSTR-3B is filed. Use a purchase return instead." });
      if (blocked === "returned") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Goods went back on this purchase; it can't be edited now." });
      if (blocked === "replacement") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A replacement's purchase can't be edited." });
      if (indiaMonth(input.dateTime) !== indiaMonth(t.dateTime)) throw new TRPCError({ code: "BAD_REQUEST", message: "The date stays in the purchase's own month." });

      // every item, once: the same pack sizes as before
      const ids = [...new Set(oldParts.map((p) => p.productId))];
      if (input.lines.length !== ids.length || ids.some((id) => !input.lines.some((l) => l.productId === id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The items stay as they were; only their rates change." });
      }
      // the new parts: each item's rate on every godown part, its discount shared over them by quantity
      const parts: Part[] = [];
      for (const l of input.lines) {
        const mine = oldParts.filter((p) => p.productId === l.productId);
        const quantity = mine.reduce((a, p) => a + p.quantity, 0);
        if (toPaise(l.discount) > quantity * toPaise(l.rateBeforeGst)) throw new TRPCError({ code: "BAD_REQUEST", message: "The discount can't be more than the item's value." });
        let left = toPaise(l.discount);
        for (const [j, p] of mine.entries()) {
          const share = j === mine.length - 1 ? left : Math.round((toPaise(l.discount) * p.quantity) / quantity);
          left -= share;
          parts.push({ ...p, gross: p.quantity * toPaise(l.rateBeforeGst), off: share });
        }
      }
      // in the purchase's own order, so the charges spread the same way as when saved
      parts.sort((a, b) => oldParts.findIndex((o) => o.id === a.id) - oldParts.findIndex((o) => o.id === b.id));
      const charges = toPaise(input.freightCharges) + toPaise(input.packingCharges) + toPaise(input.loadingCharges) + toPaise(input.otherCharges);
      const off = toPaise(input.discount);
      const now = figure(parts, charges, off);
      const was = figure(
        oldParts,
        toPaise(Number(purchase.freightAmount)) + toPaise(Number(purchase.packagingAmount)) + toPaise(Number(purchase.handlingAmount)) + toPaise(Number(purchase.otherAmount)),
        toPaise(Number(purchase.discountAmount)),
      );
      const total = now.total;
      const intra = purchase.supplyType === "intra";
      const cgst = intra ? Math.floor(now.gstAll / 2) : 0;
      const sgst = intra ? now.gstAll - cgst : 0;
      const igst = intra ? 0 : now.gstAll;

      // what was paid towards the bill, and what the edit leaves: more owed (plus) or paid over (minus)
      const money = await this.moneyNets(tx, t.id, supplier.id);
      const moneyAll = money.reduce((a, m) => a + m.paise, 0);
      const paid = due ? settlements.reduce((a, s) => a + toPaise(s.amount), 0) : -moneyAll;
      const balance = total - paid;
      const moved = toPaise(input.cashAmount) + input.bankParts.reduce((a, b) => a + toPaise(b.amount), 0);
      // cash: a bill up pays some of what's left now (no more); a bill down takes back what was paid over, in full;
      // credit: nothing moves
      let paidNow = 0;
      let takenBack = 0;
      if (input.kind === "cash") {
        if (balance > 0) {
          if (moved > balance) throw new TRPCError({ code: "BAD_REQUEST", message: "Pay some of what's left, and no more." });
          paidNow = moved;
        } else if (balance < 0) {
          if (moved !== -balance) throw new TRPCError({ code: "BAD_REQUEST", message: "Take back what was paid over, in full." });
          takenBack = moved;
        } else if (moved !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing is left to pay." });
      }

      // the money moving now: each part out of (or back into) cash and the bank accounts; paid out, never more than
      // they hold today
      const moneyLedgers: { ledgerId: string; part: (typeof input.bankParts)[number] | null; paise: number }[] = [];
      if (toPaise(input.cashAmount) > 0) moneyLedgers.push({ ledgerId: await settleLedger(tx, this.accounts, "cash", null), part: null, paise: toPaise(input.cashAmount) });
      for (const b of input.bankParts) moneyLedgers.push({ ledgerId: await settleLedger(tx, this.accounts, "bank", b.bankDetailsId), part: b, paise: toPaise(b.amount) });
      if (paidNow > 0) {
        const held = await this.accounts.balances(moneyLedgers.map((m) => m.ledgerId));
        for (const m of moneyLedgers) {
          if (m.paise > heldPaise(held.get(m.ledgerId)?.today)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: m.part ? "That's more than there is in one of the bank accounts." : "That's more than there is in cash." });
          }
        }
      }

      // the ledgers again: the old effect reversed (on its own day), the new one posted on the purchase's day
      await this.engine.reverse(tx, { transactionId: t.id, dateTime: t.dateTime });
      const raw: { ledgerId: string; paise: number }[] = [...money];
      const newMoney = moneyLedgers.reduce((a, m) => a + (takenBack > 0 ? m.paise : -m.paise), 0);
      for (const m of moneyLedgers) raw.push({ ledgerId: m.ledgerId, paise: takenBack > 0 ? m.paise : -m.paise });
      // the supplier: owed the bill, less what was paid through this purchase (before and now), plus what's taken back
      raw.push({ ledgerId: supplier.id, paise: -(total + moneyAll + newMoney) });
      raw.push({ ledgerId: await this.accounts.ledgerId(tx, "purchase"), paise: now.itemsValue + now.chargeTaxable + now.roundOff });
      if (cgst > 0) raw.push({ ledgerId: await this.accounts.ledgerId(tx, "inputCgst"), paise: cgst });
      if (sgst > 0) raw.push({ ledgerId: await this.accounts.ledgerId(tx, "inputSgst"), paise: sgst });
      if (igst > 0) raw.push({ ledgerId: await this.accounts.ledgerId(tx, "inputIgst"), paise: igst });
      if (off > 0) raw.push({ ledgerId: await this.accounts.ledgerId(tx, "discountReceived"), paise: -off });
      await this.engine.post(tx, { transactionId: t.id, dateTime: input.dateTime, lines: netLines(raw) });

      // each pack's cost moves by what its packs' value (with their share of the charges) changed, over what's held
      // now; a cost history row only when it changed
      const landed = (priced: ReturnType<typeof figure>["priced"], productId: string) => priced.filter((p) => p.productId === productId).reduce((a, p) => a + p.value + p.charge, 0);
      const held = await tx.select({ id: productsTable.id, quantity: productsTable.quantity, cost: productsTable.weightedAverageCost }).from(productsTable).where(inArray(productsTable.id, ids)).for("update");
      for (const h of held) {
        const change = landed(now.priced, h.id) - landed(was.priced, h.id);
        if (change === 0 || h.quantity <= 0 || h.cost === null) continue;
        const cost = weightedCost({ quantity: h.quantity, cost: toPaise(Number(h.cost)) }, { quantity: 0, value: change });
        if (cost === toPaise(Number(h.cost))) continue;
        await tx.update(productsTable).set({ weightedAverageCost: fromPaise(cost) }).where(eq(productsTable.id, h.id));
        await tx.insert(productCostHistoryTable).values({ productId: h.id, weightedAverageCost: fromPaise(cost), quantityAfter: h.quantity, transactionId: t.id });
      }

      // its parts in place, at the new figures
      for (const p of now.priced) {
        await tx
          .update(purchaseProductsTable)
          .set({ grossProductPrice: fromPaise(p.gross), discountAmount: fromPaise(p.off), gstAmount: fromPaise(p.gst) })
          .where(eq(purchaseProductsTable.id, p.id));
      }

      // the purchase as it now reads
      await tx
        .update(purchasesTable)
        .set({
          vehicleNumber: input.vehicleNumber,
          subtotal: fromPaise(now.itemsValue),
          discountAmount: fromPaise(off),
          gstAmount: fromPaise(now.gstAll),
          freightAmount: fromPaise(toPaise(input.freightCharges)),
          packagingAmount: fromPaise(toPaise(input.packingCharges)),
          handlingAmount: fromPaise(toPaise(input.loadingCharges)),
          otherAmount: fromPaise(toPaise(input.otherCharges)),
          transactedIn: input.kind,
          remarks: input.remarks,
          supplierInvoiceNumber: input.supplierInvoiceNumber,
          invoiceDate: indiaDay(input.dateTime),
        })
        .where(eq(purchasesTable.id, purchase.id));
      await tx.update(transactionsTable).set({ dateTime: input.dateTime, amount: fromPaise(total), remarks: input.remarks }).where(eq(transactionsTable.id, t.id));

      // each bank account's part of what was paid now, or taken back
      const bankMoved = moneyLedgers.filter((m) => m.part);
      if (bankMoved.length > 0) {
        const accs = await tx
          .select({ id: bankDetailsTable.id, bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
          .from(bankDetailsTable)
          .where(inArray(bankDetailsTable.id, bankMoved.map((b) => b.part!.bankDetailsId)));
        const savedAt = Date.now();
        for (const [i, b] of bankMoved.entries()) {
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

      // the due follows the new total: what was settled past it is let go (the newest first: it's their advance now,
      // or what was taken back); credit: due after its period (none: no set day)
      const dueOn = input.kind === "credit" && input.creditPeriodDays !== null ? daysOn(indiaDay(input.dateTime), input.creditPeriodDays) : null;
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
      }
      // what's paid now settles what we owe them, the oldest first, as a purchase's payment does
      if (paidNow > 0) await this.dues.settleOldestIn(tx, { kind: "creditor", partyId: purchase.partyId!, transactionId: t.id, amount: paidNow / 100 });

      // the credit period kept with the purchase: credit with one has it, anything else has none
      const [creditBefore] = await tx
        .select({ days: salePurchaseCreditDetailsTable.creditPeriodInDays })
        .from(salePurchaseCreditDetailsTable)
        .where(eq(salePurchaseCreditDetailsTable.transactionId, t.id));
      await tx.delete(salePurchaseCreditDetailsTable).where(eq(salePurchaseCreditDetailsTable.transactionId, t.id));
      if (input.kind === "credit" && input.creditPeriodDays !== null)
        await tx.insert(salePurchaseCreditDetailsTable).values({ transactionId: t.id, creditPeriodInDays: input.creditPeriodDays });

      // the edit log: what changed, from what to what (the items in one order)
      const itemsOf = (ps: Part[]) =>
        ids
          .slice()
          .sort()
          .map((id) => {
            const mine = ps.filter((p) => p.productId === id);
            const q = mine.reduce((a, p) => a + p.quantity, 0);
            return { productId: id, quantity: q, rate: Math.round(mine.reduce((a, p) => a + p.gross, 0) / q) / 100, discount: mine.reduce((a, p) => a + p.off, 0) / 100 };
          });
      const changes = [
        { field: "date", old: indiaDay(t.dateTime), new: indiaDay(input.dateTime) },
        { field: "billNumber", old: purchase.supplierInvoiceNumber, new: input.supplierInvoiceNumber },
        { field: "kind", old: purchase.transactedIn, new: input.kind },
        { field: "creditPeriodDays", old: creditBefore?.days ?? null, new: input.kind === "credit" ? input.creditPeriodDays : null },
        { field: "total", old: Number(t.amount), new: total / 100 },
        { field: "items", old: itemsOf(oldParts), new: itemsOf(parts) },
        { field: "discount", old: Number(purchase.discountAmount), new: off / 100 },
        {
          field: "charges",
          old: [purchase.freightAmount, purchase.packagingAmount, purchase.handlingAmount, purchase.otherAmount].map(Number),
          new: [input.freightCharges, input.packingCharges, input.loadingCharges, input.otherCharges],
        },
        { field: "vehicleNumber", old: purchase.vehicleNumber, new: input.vehicleNumber },
        { field: "remarks", old: purchase.remarks, new: input.remarks },
        ...(paidNow > 0 ? [{ field: "paid", old: null, new: paidNow / 100 }] : []),
        ...(takenBack > 0 ? [{ field: "takenBack", old: null, new: takenBack / 100 }] : []),
      ].filter((c) => JSON.stringify(c.old) !== JSON.stringify(c.new));
      if (changes.length > 0) await tx.insert(transactionEditLogsTable).values({ transactionId: t.id, editedById: actor.id, editedByName: actor.name.slice(0, 30), changes });

      return { transactionId: t.id, assignedId: t.assignedId, total: total / 100 };
    });
  }
}
