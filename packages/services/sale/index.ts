import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray } from "@repo/database";
import {
  bankDetailsTable,
  categoriesTable,
  godownsTable,
  ledgersTable,
  partiesTable,
  partyAddressesTable,
  productGodownsTable,
  productPricesTable,
  productsTable,
  salePurchaseCreditDetailsTable,
  saleOrderProductsTable,
  saleOrdersTable,
  saleProductsTable,
  salesTable,
  subCategoriesTable,
  transactionBankDetailsTable,
  transactionsTable,
} from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel, PostingLine } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import DueService from "../due";
import PartyService from "../party";
import { BANK_MODE_DB } from "../payment/model";
import { priceLines } from "../purchase-order";
import SettingService from "../setting";
import StockEngine, { type Tx } from "../stock/engine";
import { productNameSnapshot } from "../stock/index";
import TransactionService from "../transaction";
import { settleLedger } from "../transaction/settle";
import { tdsOn } from "../receipt/model";
import { saleOrderDelivered } from "../sale-order/delivered";
import { type CreateSaleInputModel, createSaleInputModel, NAMED_BUYER_FROM, SALE_TDS_RATE, type SaleAddressInputModel, type SaleIdInputModel, type SaleInvoiceModel, type SaleSummaryModel, type SavedSaleModel } from "./model";

// the day a moment falls on in India, as YYYY-MM-DD
const indiaDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);
// a day so many days on
const daysOn = (day: string, n: number) => new Date(new Date(`${day}T12:00:00+05:30`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// an address as a sale keeps it, from a party's saved one or one typed on the sale
type Place = { id: string | null; line1: string; line2: string | null; city: string; district: string; state: string; stateCode: SaleAddressInputModel["stateCode"]; postalCode: string; gstin: string | null };

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

// Sales: goods going out, for cash now (into cash and/or bank accounts) or on credit (the customer owes it). Each item
// leaves from one or more godowns; its GST % is the product's, CGST + SGST when it goes within our state and IGST
// outside it; one discount comes off the total. A cash sale has no customer (an optional name and phone); a credit sale's
// customer is picked or added, becomes a customer if they weren't, and owes it as a due. The month locks once its
// GSTR-1 is filed. Stock, ledgers, the due and the sale are saved together or not at all
export default class SaleService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly settings = new SettingService(),
    private readonly stock = new StockEngine(),
  ) {}

  // a party's saved address, which must be theirs and in use
  private async addressOf(tx: Tx, partyId: string, addressId: string): Promise<Place> {
    const [a] = await tx
      .select()
      .from(partyAddressesTable)
      .where(and(eq(partyAddressesTable.id, addressId), eq(partyAddressesTable.partyId, partyId), eq(partyAddressesTable.isActive, true)));
    if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Address not found." });
    return { id: a.id, line1: a.addressLine1, line2: a.addressLine2, city: a.city, district: a.district, state: a.state, stateCode: a.stateCode as Place["stateCode"], postalCode: a.postalCode, gstin: a.gstin };
  }

  // a party's default address, if it has one
  private async defaultAddressOf(tx: Tx, partyId: string) {
    const [a] = await tx
      .select({ id: partyAddressesTable.id })
      .from(partyAddressesTable)
      .where(and(eq(partyAddressesTable.partyId, partyId), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)));
    return a ? this.addressOf(tx, partyId, a.id) : null;
  }

  // the credit sale's customer: their ledger picked (a party's, active), or a party added now; either way a customer
  private async customerIn(tx: Tx, input: CreateSaleInputModel) {
    let ledgerId = input.customerLedgerId;
    if (input.newCustomer) ledgerId = (await this.parties.createIn(tx, input.newCustomer, "customer")).ledgerId;
    const [ledger] = await tx.select().from(ledgersTable).where(eq(ledgersTable.id, ledgerId!));
    if (!ledger || ledger.referenceTable !== "parties" || !ledger.referenceId) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
    const [party] = await tx.select().from(partiesTable).where(eq(partiesTable.id, ledger.referenceId));
    if (!party) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
    if (!party.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${party.name} is inactive.` });
    // their first sale makes them a customer (their ledger moves to Debtors)
    await this.parties.addRoleIn(tx, party.id, "customer");
    // what they owed before this sale, in paise (nothing when their account is in credit)
    // and the advance they have with us (their account in credit)
    const balance = toPaise(Number(ledger.balance));
    return { ledgerId: ledger.id, party, owed: ledger.balanceType === "debit" ? balance : 0, held: ledger.balanceType === "credit" ? balance : 0 };
  }

  // each item's product, active and priced, with its GST %, cost and name as the sale keeps it
  private async productsIn(tx: Tx, input: CreateSaleInputModel) {
    const ids = input.lines.map((l) => l.productId);
    const rows = await tx
      .select({
        p: productsTable,
        gst: productPricesTable.gstPercent,
        listRate: productPricesTable.priceBeforeGst,
        categoryName: categoriesTable.name,
        subCategoryName: subCategoriesTable.name,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .innerJoin(subCategoriesTable, eq(subCategoriesTable.id, productsTable.subCategoryId))
      .leftJoin(productPricesTable, eq(productPricesTable.productId, productsTable.id))
      .where(inArray(productsTable.id, ids));
    const byId = new Map(rows.map((r) => [r.p.id, r]));
    return input.lines.map((l) => {
      const r = byId.get(l.productId);
      if (!r || r.p.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      if (!r.p.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "An item is inactive." });
      if (r.gst == null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Set the GST % for every item first." });
      // never below what a pack costs us
      if (r.p.weightedAverageCost != null && toPaise(l.rateBeforeGst) < toPaise(Number(r.p.weightedAverageCost))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An item's price is below what it costs." });
      }
      return { gstRate: Number(r.gst), listRate: toPaise(Number(r.listRate ?? 0)), name: productNameSnapshot({ ...r.p, categoryName: r.categoryName, subCategoryName: r.subCategoryName }) };
    });
  }

  async create(rawInput: CreateSaleInputModel, actor: ActorModel): Promise<SavedSaleModel> {
    const input = createSaleInputModel.parse(rawInput);
    return db.transaction(async (tx) => {
      // a month whose GSTR-1 is filed takes no more sales
      await this.transactions.assertOpen(tx, "gstr1", input.dateTime);
      const company = await this.settings.get("company", tx);
      const products = await this.productsIn(tx, input);

      // each godown's part of each item is a line of its own, so the discount's share and GST fall on each part
      const parts = input.lines.flatMap((l, i) => l.godowns.map((g) => ({ line: l, product: products[i]!, godownId: g.godownId, quantity: g.quantity })));
      // the items' value and GST (the cash discount doesn't lower either)
      const priced = priceLines(
        parts.map((p) => ({ quantity: p.quantity, rate: p.line.rateBeforeGst, discount: 0, gstRate: p.product.gstRate })),
        0,
      );
      // the charges, each typed with GST in it: spread over the parts by value and taxed at each part's rate, so
      // their GST is taken out at the goods' rate
      const charges = toPaise(input.transportCharges) + toPaise(input.packingCharges) + toPaise(input.loadingCharges);
      let chargeLeft = charges;
      let chargeTaxable = 0;
      priced.priced.forEach((pp, i) => {
        const share = i === parts.length - 1 ? chargeLeft : priced.subtotal === 0 ? 0 : Math.round((charges * pp.value) / priced.subtotal);
        chargeLeft -= share;
        chargeTaxable += Math.round((share * 100) / (100 + parts[i]!.product.gstRate));
      });
      const chargeGst = charges - chargeTaxable;
      const gstAll = priced.gst + chargeGst;
      // the cash discount: never more than the bill
      const gross = priced.subtotal + priced.gst + charges;
      const off = toPaise(input.discount);
      if (off > gross) throw new TRPCError({ code: "BAD_REQUEST", message: "The discount can't be more than the bill." });
      const total = gross - off;
      // a cash sale from ₹50,000 taxable value names its buyer (name and phone)
      if (input.kind === "cash" && input.customerLedgerId === null && priced.subtotal + chargeTaxable >= NAMED_BUYER_FROM * 100 && (!input.buyer?.name || !input.buyer.phone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Give the buyer's name and phone from ₹50,000." });
      }

      // who it's to and where it goes: a credit sale's customer with their bill-to (their default unless picked) and
      // ship-to (one of theirs, or typed); a cash sale's typed address (our place of business unless changed)
      const customer = input.kind === "credit" || input.customerLedgerId ? await this.customerIn(tx, input) : null;
      const billTo = customer
        ? input.billToAddressId
          ? await this.addressOf(tx, customer.party.id, input.billToAddressId)
          : await this.defaultAddressOf(tx, customer.party.id)
        : input.billToAddress
          ? typed(input.billToAddress)
          : null;
      let shipTo: Place;
      if (input.shipTo === null) {
        // a credit sale goes to the customer's default address
        const home = customer ? await this.defaultAddressOf(tx, customer.party.id) : null;
        if (!home) throw new TRPCError({ code: "BAD_REQUEST", message: "Add the customer's address first." });
        shipTo = home;
      } else if ("addressId" in input.shipTo) {
        if (!customer) throw new TRPCError({ code: "BAD_REQUEST", message: "Type where it goes." });
        shipTo = await this.addressOf(tx, customer.party.id, input.shipTo.addressId);
      } else shipTo = typed(input.shipTo.address);
      // GST by where it goes: within our state CGST + SGST, outside it IGST
      const intra = shipTo.stateCode === company.stateCode;
      const cgst = intra ? Math.floor(gstAll / 2) : 0;
      const sgst = intra ? gstAll - cgst : 0;
      const igst = intra ? 0 : gstAll;

      // the money in: cash and each bank account's part, adding up to the total; or the customer owes it all. A saved
      // customer paying cash goes through their account: the bill is owed, then what came in (and any TDS they
      // deducted) is taken off, so it may be part of the bill (the rest stays owed) or more: towards what they owe from
      // before, and past that an advance on their account, as a receipt's
      const lines: PostingLine[] = [];
      const banks: { part: (typeof input.bankParts)[number]; ledgerId: string }[] = [];
      // a saved customer's cash sale: what it settles of their account (what came in and the TDS), in paise
      let settles = 0;
      // and what of an advance of theirs is set off against this bill
      let setOff = 0;
      if (input.kind === "cash") {
        const cash = toPaise(input.cashAmount);
        const bank = input.bankParts.reduce((a, b) => a + toPaise(b.amount), 0);
        const received = cash + bank;
        if (!customer) {
          if (received !== total) throw new TRPCError({ code: "BAD_REQUEST", message: "Cash and bank must add up to the total." });
        } else {
          // the TDS on what came in; a paisa off the bill or all they owe from rounding is taken as exactly that
          setOff = input.advanceSetOff ? Math.min(customer.held, total) : 0;
          const most = total - setOff + customer.owed;
          let tds = input.tdsDeducted ? toPaise(tdsOn(received / 100, SALE_TDS_RATE)) : 0;
          if (input.tdsDeducted) for (const target of [total - setOff, most]) if (Math.abs(received + tds - target) <= 1) tds = target - received;
          settles = received + tds;
          // any part of what they owe, this bill included; nothing at all (and no advance set off) is a credit sale
          if (received <= 0 && setOff === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A cash sale takes some money now." });
          if (tds > 0) {
            // TDS is deducted against a PAN: theirs as saved, or given now and kept
            if (!customer.party.pan && !input.customerPan) throw new TRPCError({ code: "BAD_REQUEST", message: "Give the customer's PAN." });
            if (!customer.party.pan) await tx.update(partiesTable).set({ pan: input.customerPan }).where(eq(partiesTable.id, customer.party.id));
            lines.push({ ledgerId: await this.accounts.ledgerId(tx, "tdsReceivable"), side: "debit", amount: tds / 100 });
          }
          lines.push({ ledgerId: customer.ledgerId, side: "debit", amount: total / 100 });
          if (settles > 0) lines.push({ ledgerId: customer.ledgerId, side: "credit", amount: settles / 100 });
        }
        if (cash > 0) lines.push({ ledgerId: await settleLedger(tx, this.accounts, "cash", null), side: "debit", amount: cash / 100 });
        for (const b of input.bankParts) {
          const ledgerId = await settleLedger(tx, this.accounts, "bank", b.bankDetailsId);
          banks.push({ part: b, ledgerId });
          lines.push({ ledgerId, side: "debit", amount: toPaise(b.amount) / 100 });
        }
      } else {
        lines.push({ ledgerId: customer!.ledgerId, side: "debit", amount: total / 100 });
      }
      // Sale up by the items' and charges' value before GST, the GST owed up by the rest; the cash discount given is
      // an expense
      if (off > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "discountGiven"), side: "debit", amount: off / 100 });
      lines.push({ ledgerId: await this.accounts.ledgerId(tx, "sale"), side: "credit", amount: (priced.subtotal + chargeTaxable) / 100 });
      if (cgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputCgst"), side: "credit", amount: cgst / 100 });
      if (sgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputSgst"), side: "credit", amount: sgst / 100 });
      if (igst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "outputIgst"), side: "credit", amount: igst / 100 });

      const t = await this.transactions.create(tx, { type: "sale", dateTime: input.dateTime, amount: total / 100, remarks: input.remarks, lines }, actor);

      // a dispatch on a sale order: the order (still pending, and its own customer's), how many of each item it still
      // holds back, and whether this sale sends the last of it
      const held = new Map<string, number>();
      if (input.saleOrderId) {
        const [order] = await tx.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, input.saleOrderId)).for("update");
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        if (order.status !== "pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `This order is ${order.status}.` });
        if (order.partyId && customer && customer.party.id !== order.partyId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This order is for another customer." });
        }
        // an order kept by name: on credit the customer (added now, their name and phone as corrected, or one of ours
        // with that phone) becomes the order's own, so its later dispatches go to them; a cash buyer keeps the order's
        // name
        if (!order.partyId) {
          const same = (a: string | null | undefined, b: string | null | undefined) =>
            (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
          if (customer) {
            await tx.update(saleOrdersTable).set({ partyId: customer.party.id, customerName: null }).where(eq(saleOrdersTable.id, order.id));
          } else if (input.buyer?.name && !same(input.buyer.name, order.customerName)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "This order is for another customer." });
          }
        }
        const ordered = await tx
          .select({ productId: saleOrderProductsTable.productId, quantity: saleOrderProductsTable.quantityOrdered })
          .from(saleOrderProductsTable)
          .where(eq(saleOrderProductsTable.saleOrderId, order.id));
        const went = await saleOrderDelivered(tx, order.id);
        for (const o of ordered) held.set(o.productId, Math.max(0, o.quantity - (went.get(o.productId) ?? 0)));
        const now = new Map<string, number>();
        for (const l of input.lines) now.set(l.productId, (now.get(l.productId) ?? 0) + l.quantity);
        if (ordered.every((o) => (now.get(o.productId) ?? 0) >= (held.get(o.productId) ?? 0))) {
          await tx.update(saleOrdersTable).set({ status: "completed" }).where(eq(saleOrdersTable.id, order.id));
        }
      }

      // the stock leaves each godown: an order's dispatch takes what the order held back first (as much as it still
      // holds of that item), anything else comes from free stock
      await this.stock.apply(
        tx,
        parts.flatMap((p) => {
          const fromHeld = Math.min(p.quantity, held.get(p.line.productId) ?? 0);
          held.set(p.line.productId, (held.get(p.line.productId) ?? 0) - fromHeld);
          return [
            { productId: p.line.productId, godownId: p.godownId, delta: -fromHeld, reserved: true },
            { productId: p.line.productId, godownId: p.godownId, delta: -(p.quantity - fromHeld) },
          ];
        }),
      );

      // the sale as it reads: who, where, the figures
      const party = customer?.party ?? null;
      const [sale] = await tx
        .insert(salesTable)
        .values({
          orderId: input.saleOrderId,
          transactionId: t.id,
          partyId: party?.id ?? null,
          partyNameSnapshot: (party?.name ?? input.buyer?.name ?? "").slice(0, 150),
          partyPhoneSnapshot: party?.phone ?? (input.buyer?.phone || null),
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
          // the charges as typed, GST in them
          shippingAmount: fromPaise(toPaise(input.transportCharges)),
          packagingAmount: fromPaise(toPaise(input.packingCharges)),
          handlingAmount: fromPaise(toPaise(input.loadingCharges)),
          transactedIn: input.kind,
          remarks: input.remarks,
          invoiceDate: indiaDay(input.dateTime),
        })
        .returning({ id: salesTable.id });

      // each item's part from each godown, with the godown as it was named
      const godowns = await tx
        .select({ id: godownsTable.id, name: godownsTable.godownName })
        .from(godownsTable)
        .where(inArray(godownsTable.id, [...new Set(parts.map((p) => p.godownId))]));
      const holds = await tx
        .select({ id: productGodownsTable.id, productId: productGodownsTable.productId, godownId: productGodownsTable.godownId })
        .from(productGodownsTable)
        .where(inArray(productGodownsTable.productId, input.lines.map((l) => l.productId)));
      await tx.insert(saleProductsTable).values(
        parts.map((p, i) => ({
          saleId: sale!.id,
          productId: p.line.productId,
          productNameSnapshot: p.product.name,
          quantity: p.quantity,
          productGodownId: holds.find((h) => h.productId === p.line.productId && h.godownId === p.godownId)?.id ?? null,
          godownName: godowns.find((g) => g.id === p.godownId)?.name ?? "",
          // at the saved price, and what the price it sold at takes off that (nothing when it sold at or above it)
          grossProductPrice: fromPaise(Math.max(p.product.listRate * p.quantity, priced.priced[i]!.value)),
          discountAmount: fromPaise(Math.max(0, p.product.listRate * p.quantity - priced.priced[i]!.value)),
          gstRate: Math.round(p.product.gstRate),
          gstAmount: fromPaise(priced.priced[i]!.gst),
        })),
      );

      // each bank account's part, how it came in and the account as it is now
      if (banks.length > 0) {
        const accs = await tx
          .select({ id: bankDetailsTable.id, bankName: bankDetailsTable.bankName, accountNumber: bankDetailsTable.accountNumber, ifsc: bankDetailsTable.ifscCode })
          .from(bankDetailsTable)
          .where(inArray(bankDetailsTable.id, banks.map((b) => b.part.bankDetailsId)));
        const savedAt = Date.now();
        for (const [i, b] of banks.entries()) {
          const acc = accs.find((a) => a.id === b.part.bankDetailsId)!;
          await tx.insert(transactionBankDetailsTable).values({
            createdAt: new Date(savedAt + i),
            transactionId: t.id,
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

      // a saved customer's cash sale: the bill is a due, and what it settled goes to their dues oldest first (this
      // bill's last); anything past them stays on their account
      if (customer && input.kind === "cash") {
        await this.dues.createIn(tx, {
          kind: "debtor",
          party: { id: customer.party.id, name: customer.party.name, phone: customer.party.phone },
          transactionId: t.id,
          amount: total / 100,
          dueOn: null,
          terms: null,
        });
        // an advance set off settles this bill too (it's already on their account, so nothing more is posted for it)
        await this.dues.settleOldestIn(tx, { kind: "debtor", partyId: customer.party.id, transactionId: t.id, amount: (settles + setOff) / 100 });
      }

      // a credit sale: the customer owes it, due after the credit period when there is one
      if (customer && input.kind === "credit") {
        const day = indiaDay(input.dateTime);
        await this.dues.createIn(tx, {
          kind: "debtor",
          party: { id: customer.party.id, name: customer.party.name, phone: customer.party.phone },
          transactionId: t.id,
          amount: total / 100,
          dueOn: input.creditPeriodDays !== null ? daysOn(day, input.creditPeriodDays) : null,
          terms: null,
        });
        if (input.creditPeriodDays !== null) {
          await tx.insert(salePurchaseCreditDetailsTable).values({ transactionId: t.id, creditPeriodInDays: input.creditPeriodDays });
        }
      }

      return { transactionId: t.id, assignedId: t.assignedId, total: total / 100 };
    });
  }

  // a sale as its tax invoice: each pack size once (its godown parts added up), the charges with their GST taken out
  // (the sale's GST less the items'), and the GST by tax
  async invoice(input: SaleIdInputModel): Promise<SaleInvoiceModel> {
    const [row] = await db
      .select({ s: salesTable, t: transactionsTable, shortName: partiesTable.shortName })
      .from(salesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, salesTable.transactionId))
      .leftJoin(partiesTable, eq(partiesTable.id, salesTable.partyId))
      .where(eq(salesTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
    const { s, t } = row;
    const parts = await db
      .select({ sp: saleProductsTable, p: productsTable, categoryName: categoriesTable.name })
      .from(saleProductsTable)
      .innerJoin(productsTable, eq(productsTable.id, saleProductsTable.productId))
      .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .where(eq(saleProductsTable.saleId, s.id))
      .orderBy(asc(saleProductsTable.createdAt), asc(saleProductsTable.id));
    // a pack size once, in the order it was added
    const byProduct = new Map<string, { p: (typeof parts)[number]["p"]; categoryName: string; gstRate: number; quantity: number; gross: number; off: number; gst: number }>();
    for (const { sp, p, categoryName } of parts) {
      const line = byProduct.get(sp.productId) ?? { p, categoryName, gstRate: sp.gstRate, quantity: 0, gross: 0, off: 0, gst: 0 };
      line.quantity += sp.quantity;
      line.gross += toPaise(Number(sp.grossProductPrice));
      line.off += toPaise(Number(sp.discountAmount));
      line.gst += toPaise(Number(sp.gstAmount));
      byProduct.set(sp.productId, line);
    }
    const lines = [...byProduct.entries()].map(([productId, l]) => ({
      productId,
      category: l.categoryName,
      title: [l.p.brand, l.p.name].filter(Boolean).join(" "),
      packSize: l.p.packSize,
      packSizeCode: l.p.packSizeCode,
      hsn: l.p.hsn8Digit ?? l.p.hsn4Digit ?? null,
      quantity: l.quantity,
      // a pack's price before GST, what came off the line, and what's taxed
      rate: Math.round(l.gross / l.quantity) / 100,
      discount: l.off / 100,
      taxable: (l.gross - l.off) / 100,
      gstRate: l.gstRate,
      gst: l.gst / 100,
    }));
    // the charges: the GST in them is the sale's GST less the items', shared over them by what was typed
    const typedCharges = [
      { key: "transport" as const, amount: toPaise(Number(s.shippingAmount)) },
      { key: "packing" as const, amount: toPaise(Number(s.packagingAmount)) },
      { key: "loading" as const, amount: toPaise(Number(s.handlingAmount)) },
    ].filter((c) => c.amount > 0);
    const chargesAll = typedCharges.reduce((a, c) => a + c.amount, 0);
    const gstAll = toPaise(Number(s.gstAmount));
    const chargeGst = gstAll - lines.reduce((a, l) => a + toPaise(l.gst), 0);
    let gstLeft = chargeGst;
    const charges = typedCharges.map((c, i) => {
      const gst = i === typedCharges.length - 1 ? gstLeft : Math.round((chargeGst * c.amount) / chargesAll);
      gstLeft -= gst;
      return { key: c.key, taxable: (c.amount - gst) / 100, gst: gst / 100 };
    });
    const intra = s.supplyType === "intra";
    const cgst = intra ? Math.floor(gstAll / 2) : 0;
    const place = (line1: string | null, line2: string | null, city: string | null, district: string | null, state: string | null, stateCode: string | null, postalCode: string | null) => ({
      line1,
      line2,
      city,
      district,
      state,
      stateCode,
      postalCode,
    });
    return {
      transactionId: t.id,
      assignedId: t.assignedId,
      invoiceDate: s.invoiceDate,
      status: t.status === "cancelled" ? "cancelled" : "active",
      kind: s.transactedIn === "credit" ? "credit" : "cash",
      company: await this.settings.get("company"),
      buyer: { name: s.partyNameSnapshot, shortName: row.shortName ?? null, phone: s.partyPhoneSnapshot, gstin: s.billToGstinSnapshot },
      billTo: s.billToCitySnapshot
        ? place(s.billToAddressLine1Snapshot, s.billToAddressLine2Snapshot, s.billToCitySnapshot, s.billToDistrictSnapshot, s.billToStateSnapshot, s.billToStateCodeSnapshot, s.billToPostalCodeSnapshot)
        : null,
      shipTo: place(s.shipToAddressLine1Snapshot, s.shipToAddressLine2Snapshot, s.shipToCitySnapshot, s.shipToDistrictSnapshot, s.shipToStateSnapshot, s.shipToStateCodeSnapshot, s.shipToPostalCodeSnapshot),
      supplyType: intra ? "intra" : "inter",
      vehicleNumber: s.vehicleNumber,
      remarks: s.remarks,
      lines,
      charges,
      taxable: (toPaise(Number(s.subtotal)) + chargesAll - chargeGst) / 100,
      cgst: cgst / 100,
      sgst: (intra ? gstAll - cgst : 0) / 100,
      igst: (intra ? 0 : gstAll) / 100,
      discount: Number(s.discountAmount),
      total: Number(t.amount),
      createdByName: t.createdByName ?? "",
    };
  }

  // a saved sale for its success page: its number, how many items (pack sizes), what it came to and how it was paid
  async get(input: SaleIdInputModel): Promise<SaleSummaryModel> {
    const [row] = await db
      .select({ id: salesTable.id, assignedId: transactionsTable.assignedId, total: transactionsTable.amount, kind: salesTable.transactedIn })
      .from(salesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, salesTable.transactionId))
      .where(eq(salesTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
    const items = await db.selectDistinct({ productId: saleProductsTable.productId }).from(saleProductsTable).where(eq(saleProductsTable.saleId, row.id));
    return { transactionId: input.transactionId, assignedId: row.assignedId, items: items.length, total: Number(row.total), kind: row.kind as "cash" | "credit" };
  }
}
