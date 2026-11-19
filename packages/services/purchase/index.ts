import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray } from "@repo/database";
import {
  bankDetailsTable,
  categoriesTable,
  godownsTable,
  ledgerEntriesTable,
  ledgersTable,
  partiesTable,
  partyAddressesTable,
  productCostHistoryTable,
  productGodownsTable,
  productPricesTable,
  productsTable,
  purchaseOrderProductsTable,
  purchaseOrdersTable,
  purchaseProductsTable,
  purchasesTable,
  salePurchaseCreditDetailsTable,
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
import ProductService from "../product";
import SettingService from "../setting";
import StockEngine, { type Tx } from "../stock/engine";
import { productNameSnapshot } from "../stock/index";
import TransactionService from "../transaction";
import { settleLedger } from "../transaction/settle";
import { weightedCost } from "./cost";
import {
  type AttachBillInputModel,
  attachBillInputModel,
  type CreatePurchaseInputModel,
  createPurchaseInputModel,
  type PurchaseIdInputModel,
  type PurchaseModel,
  ROUND_OFF_UNDER,
  type SavedPurchaseModel,
} from "./model";

// the day a moment falls on in India, as YYYY-MM-DD
const indiaDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);
// a day so many days on
const daysOn = (day: string, n: number) => new Date(new Date(`${day}T12:00:00+05:30`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
// what a ledger holds today, debit as plus (cash and bank accounts hold a debit balance), in paise
const heldPaise = (b: { amount: number; side: "debit" | "credit" } | undefined) => (b ? (b.side === "debit" ? 1 : -1) * toPaise(b.amount) : 0);

// Purchases: goods coming in from a supplier, for cash now (any part from cash and/or bank accounts, never more than
// they hold, the rest owed) or on credit (all of it owed). Each item goes into one or more godowns; its GST % is the
// product's, CGST + SGST when the bill is from within our state and IGST from outside it. Charges on the bill are taxed
// at the goods' rate and go into the packs' cost; a cash discount comes off what's paid (income, the GST stays on the
// full value); a rounded bill total books the difference to Round off. New products can be added with it (admin), and
// a new supplier. An arrival on a purchase order completes the order once everything ordered has come. The month locks
// once its GSTR-3B is filed. Stock, each pack's weighted average cost, ledgers, the due and the purchase are saved
// together or not at all
export default class PurchaseService {
  constructor(
    private readonly accounts = new AccountsService(),
    private readonly transactions = new TransactionService(),
    private readonly parties = new PartyService(accounts),
    private readonly dues = new DueService(accounts, transactions, parties),
    private readonly settings = new SettingService(),
    private readonly stock = new StockEngine(),
    private readonly products = new ProductService(),
  ) {}

  // the supplier: their ledger picked (a party's, active), or a party added now; either way a supplier from here on
  private async supplierIn(tx: Tx, input: ReturnType<typeof createPurchaseInputModel.parse>) {
    let ledgerId = input.supplierLedgerId;
    if (input.newSupplier) ledgerId = (await this.parties.createIn(tx, input.newSupplier, "supplier", true)).ledgerId;
    const [ledger] = await tx.select().from(ledgersTable).where(eq(ledgersTable.id, ledgerId!));
    if (!ledger || ledger.referenceTable !== "parties" || !ledger.referenceId) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found." });
    const [party] = await tx.select().from(partiesTable).where(eq(partiesTable.id, ledger.referenceId));
    if (!party) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found." });
    if (!party.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${party.name} is inactive.` });
    await this.parties.addRoleIn(tx, party.id, "supplier");
    // an advance already with them: their account in debit (we paid before the goods came)
    const balance = toPaise(Number(ledger.balance));
    return { ledgerId: ledger.id, party, advance: ledger.balanceType === "debit" ? balance : 0 };
  }

  // the address the bill is from: one of theirs (in use), their default unless picked
  private async billFromIn(tx: Tx, partyId: string, addressId: string | null) {
    const [a] = await tx
      .select()
      .from(partyAddressesTable)
      .where(
        and(
          eq(partyAddressesTable.partyId, partyId),
          eq(partyAddressesTable.isActive, true),
          addressId ? eq(partyAddressesTable.id, addressId) : eq(partyAddressesTable.isDefault, true),
        ),
      );
    if (!a) throw new TRPCError({ code: addressId ? "NOT_FOUND" : "BAD_REQUEST", message: addressId ? "Address not found." : "Add the supplier's address first." });
    return a;
  }

  // each item's pack size (one on the list, active, with a GST %; or one added now), with its name as the purchase
  // keeps it
  private async productsIn(tx: Tx, input: ReturnType<typeof createPurchaseInputModel.parse>, added: string[][]) {
    const idOf = (l: (typeof input.lines)[number]) => l.productId ?? added[l.newPack!.product]![l.newPack!.pack]!;
    const ids = input.lines.map(idOf);
    const rows = await tx
      .select({ p: productsTable, gst: productPricesTable.gstPercent, categoryName: categoriesTable.name, subCategoryName: subCategoriesTable.name })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .innerJoin(subCategoriesTable, eq(subCategoriesTable.id, productsTable.subCategoryId))
      .leftJoin(productPricesTable, eq(productPricesTable.productId, productsTable.id))
      .where(inArray(productsTable.id, ids));
    const byId = new Map(rows.map((r) => [r.p.id, r]));
    return input.lines.map((l) => {
      const id = idOf(l);
      const r = byId.get(id);
      if (!r || r.p.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      if (!r.p.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "An item is inactive." });
      if (r.gst == null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Set the GST % for every item first." });
      return { id, gstRate: Number(r.gst), name: productNameSnapshot({ ...r.p, categoryName: r.categoryName, subCategoryName: r.subCategoryName }) };
    });
  }

  async create(rawInput: CreatePurchaseInputModel, actor: ActorModel): Promise<SavedPurchaseModel> {
    const input = createPurchaseInputModel.parse(rawInput);
    try {
      return await db.transaction((tx) => this.createIn(tx, input, actor));
    } catch (error) {
      const code = ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code;
      if (code === "23505") throw new TRPCError({ code: "CONFLICT", message: "One of the new pack sizes already exists for this product." });
      throw error;
    }
  }

  private async createIn(tx: Tx, input: ReturnType<typeof createPurchaseInputModel.parse>, actor: ActorModel): Promise<SavedPurchaseModel> {
    // a month whose GSTR-3B is filed takes no more purchases
    await this.transactions.assertOpen(tx, "gstr3b", input.dateTime);
    const company = await this.settings.get("company", tx);

    // who it's from and the address on the bill: its state against ours decides the GST
    const supplier = await this.supplierIn(tx, input);
    const billFrom = await this.billFromIn(tx, supplier.party.id, input.billFromAddressId);
    const intra = billFrom.stateCode === company.stateCode;

    // new products bought with it, then every item's pack size
    const added: string[][] = [];
    for (const np of input.newProducts) added.push(await this.products.createIn(tx, np, actor));
    const products = await this.productsIn(tx, input, added);

    // each godown's part of each item is a line of its own: the item's discount is shared over its parts by quantity,
    // the last part taking what rounding leaves
    const parts = input.lines.flatMap((l, i) => {
      const off = toPaise(l.discount);
      let left = off;
      return l.godowns.map((g, j) => {
        const share = j === l.godowns.length - 1 ? left : Math.round((off * g.quantity) / l.quantity);
        left -= share;
        const value = g.quantity * toPaise(l.rateBeforeGst) - share;
        return { product: products[i]!, godownId: g.godownId, quantity: g.quantity, gross: g.quantity * toPaise(l.rateBeforeGst), off: share, value };
      });
    });
    const itemsValue = parts.reduce((a, p) => a + p.value, 0);
    // the charges, before GST: spread over the parts by value and taxed at each part's rate; they go into the cost
    const charges = toPaise(input.freightCharges) + toPaise(input.packingCharges) + toPaise(input.loadingCharges) + toPaise(input.otherCharges);
    let chargeLeft = charges;
    const priced = parts.map((p, i) => {
      const charge = i === parts.length - 1 ? chargeLeft : itemsValue === 0 ? 0 : Math.round((charges * p.value) / itemsValue);
      chargeLeft -= charge;
      return { ...p, charge, gst: Math.round((p.value * p.product.gstRate) / 100), chargeGst: Math.round((charge * p.product.gstRate) / 100) };
    });
    const gstAll = priced.reduce((a, p) => a + p.gst + p.chargeGst, 0);
    const cgst = intra ? Math.floor(gstAll / 2) : 0;
    const sgst = intra ? gstAll - cgst : 0;
    const igst = intra ? 0 : gstAll;
    // the cash discount: never more than the bill
    const gross = itemsValue + charges + gstAll;
    const off = toPaise(input.discount);
    if (off > gross) throw new TRPCError({ code: "BAD_REQUEST", message: "The discount can't be more than the bill." });
    // the bill's own total, when it's rounded: under a rupee off our figures, the difference to Round off
    const figured = gross - off;
    const total = input.billTotal === null ? figured : toPaise(input.billTotal);
    const roundOff = total - figured;
    if (Math.abs(roundOff) >= ROUND_OFF_UNDER * 100) throw new TRPCError({ code: "BAD_REQUEST", message: "The bill's total is a rupee or more off the items. Check the rates." });

    // what it posts: Purchase up by the items' and charges' value, the GST we can claim up, the cash discount as
    // income, the round off; the supplier owed the total. Cash: what's paid now off the supplier, out of cash and banks
    const lines: PostingLine[] = [
      { ledgerId: await this.accounts.ledgerId(tx, "purchase"), side: "debit", amount: (itemsValue + charges) / 100 },
      { ledgerId: supplier.ledgerId, side: "credit", amount: total / 100 },
    ];
    if (cgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "inputCgst"), side: "debit", amount: cgst / 100 });
    if (sgst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "inputSgst"), side: "debit", amount: sgst / 100 });
    if (igst > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "inputIgst"), side: "debit", amount: igst / 100 });
    if (off > 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "discountReceived"), side: "credit", amount: off / 100 });
    if (roundOff !== 0) lines.push({ ledgerId: await this.accounts.ledgerId(tx, "roundOff"), side: roundOff > 0 ? "debit" : "credit", amount: Math.abs(roundOff) / 100 });

    // cash: any part of the bill paid now (an advance with them set off first, as much as the bill takes), each part
    // no more than cash or that account holds today
    const banks: { part: (typeof input.bankParts)[number]; ledgerId: string }[] = [];
    let paid = 0;
    let setOff = 0;
    if (input.kind === "cash") {
      setOff = input.advanceSetOff ? Math.min(supplier.advance, total) : 0;
      const cash = toPaise(input.cashAmount);
      const cashLedger = cash > 0 ? await settleLedger(tx, this.accounts, "cash", null) : null;
      for (const b of input.bankParts) banks.push({ part: b, ledgerId: await settleLedger(tx, this.accounts, "bank", b.bankDetailsId) });
      paid = cash + banks.reduce((a, b) => a + toPaise(b.part.amount), 0);
      if (paid <= 0 && setOff === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A cash purchase pays some money now." });
      if (paid > total - setOff) throw new TRPCError({ code: "BAD_REQUEST", message: "That's more than the bill." });
      const now = await this.accounts.balances([...(cashLedger ? [cashLedger] : []), ...banks.map((b) => b.ledgerId)]);
      if (cashLedger && cash > heldPaise(now.get(cashLedger)?.today)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That's more than there is in cash." });
      for (const b of banks) {
        if (toPaise(b.part.amount) > heldPaise(now.get(b.ledgerId)?.today)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That's more than there is in one of the bank accounts." });
        }
      }
      if (paid > 0) lines.push({ ledgerId: supplier.ledgerId, side: "debit", amount: paid / 100 });
      if (cashLedger) lines.push({ ledgerId: cashLedger, side: "credit", amount: cash / 100 });
      for (const b of banks) lines.push({ ledgerId: b.ledgerId, side: "credit", amount: toPaise(b.part.amount) / 100 });
    }

    const t = await this.transactions.create(tx, { type: "purchase", dateTime: input.dateTime, amount: total / 100, remarks: input.remarks, lines }, actor);

    // the purchase as it reads: the supplier, their bill, the figures
    const [purchase] = await tx
      .insert(purchasesTable)
      .values({
        orderId: input.purchaseOrderId,
        transactionId: t.id,
        partyId: supplier.party.id,
        partyNameSnapshot: supplier.party.name.slice(0, 150),
        partyPhoneSnapshot: supplier.party.phone,
        partyEmailSnapshot: supplier.party.email,
        billFromAddressId: billFrom.id,
        billFromGstinSnapshot: billFrom.gstin,
        billFromAddressLine1Snapshot: billFrom.addressLine1,
        billFromAddressLine2Snapshot: billFrom.addressLine2,
        billFromCitySnapshot: billFrom.city,
        billFromDistrictSnapshot: billFrom.district,
        billFromStateSnapshot: billFrom.state,
        billFromStateCodeSnapshot: billFrom.stateCode,
        billFromPostalCodeSnapshot: billFrom.postalCode,
        supplyType: intra ? "intra" : "inter",
        vehicleNumber: input.vehicleNumber,
        subtotal: fromPaise(itemsValue),
        discountAmount: fromPaise(off),
        gstAmount: fromPaise(gstAll),
        // the charges as typed, before GST
        freightAmount: fromPaise(toPaise(input.freightCharges)),
        packagingAmount: fromPaise(toPaise(input.packingCharges)),
        handlingAmount: fromPaise(toPaise(input.loadingCharges)),
        otherAmount: fromPaise(toPaise(input.otherCharges)),
        transactedIn: input.kind,
        remarks: input.remarks,
        supplierInvoiceNumber: input.supplierInvoiceNumber,
        invoiceDate: indiaDay(input.dateTime),
        invoiceUrl: input.invoiceUrl,
      })
      .returning({ id: purchasesTable.id });

    // each pack's cost after it: what was held at the old cost, and what came in at the item's value and its share of
    // the charges (GST is claimed back, so it isn't a cost). Read before the stock moves
    const ids = [...new Set(priced.map((p) => p.product.id))];
    const before = await tx
      .select({ id: productsTable.id, quantity: productsTable.quantity, cost: productsTable.weightedAverageCost })
      .from(productsTable)
      .where(inArray(productsTable.id, ids));
    await this.stock.apply(tx, priced.map((p) => ({ productId: p.product.id, godownId: p.godownId, delta: p.quantity })));
    for (const b of before) {
      const mine = priced.filter((p) => p.product.id === b.id);
      const moved = { quantity: mine.reduce((a, p) => a + p.quantity, 0), value: mine.reduce((a, p) => a + p.value + p.charge, 0) };
      const cost = weightedCost({ quantity: b.quantity, cost: b.cost === null ? null : toPaise(Number(b.cost)) }, moved);
      await tx.update(productsTable).set({ weightedAverageCost: fromPaise(cost) }).where(eq(productsTable.id, b.id));
      await tx.insert(productCostHistoryTable).values({ productId: b.id, weightedAverageCost: fromPaise(cost), quantityAfter: b.quantity + moved.quantity, transactionId: t.id });
    }

    // each item's part in each godown, with the godown as it was named
    const godowns = await tx
      .select({ id: godownsTable.id, name: godownsTable.godownName })
      .from(godownsTable)
      .where(inArray(godownsTable.id, [...new Set(priced.map((p) => p.godownId))]));
    const holds = await tx
      .select({ id: productGodownsTable.id, productId: productGodownsTable.productId, godownId: productGodownsTable.godownId })
      .from(productGodownsTable)
      .where(inArray(productGodownsTable.productId, ids));
    await tx.insert(purchaseProductsTable).values(
      priced.map((p) => ({
        purchaseId: purchase!.id,
        productId: p.product.id,
        productNameSnapshot: p.product.name.slice(0, 200),
        quantity: p.quantity,
        productGodownId: holds.find((h) => h.productId === p.product.id && h.godownId === p.godownId)?.id ?? null,
        godownName: (godowns.find((g) => g.id === p.godownId)?.name ?? "").slice(0, 20),
        grossProductPrice: fromPaise(p.gross),
        discountAmount: fromPaise(p.off),
        gstRate: Math.round(p.product.gstRate),
        gstAmount: fromPaise(p.gst),
      })),
    );

    // each bank account's part, how it was paid and the account as it is now
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

    // we owe the supplier the bill (after the credit period, when there is one); what's paid now and an advance set
    // off settle it, their oldest dues first
    const day = indiaDay(input.dateTime);
    await this.dues.createIn(tx, {
      kind: "creditor",
      party: { id: supplier.party.id, name: supplier.party.name, phone: supplier.party.phone },
      transactionId: t.id,
      amount: total / 100,
      dueOn: input.creditPeriodDays !== null ? daysOn(day, input.creditPeriodDays) : null,
      terms: null,
    });
    if (paid + setOff > 0) await this.dues.settleOldestIn(tx, { kind: "creditor", partyId: supplier.party.id, transactionId: t.id, amount: (paid + setOff) / 100 });
    if (input.creditPeriodDays !== null) await tx.insert(salePurchaseCreditDetailsTable).values({ transactionId: t.id, creditPeriodInDays: input.creditPeriodDays });

    // an arrival on a purchase order: the order (pending, this supplier's) completes once everything ordered has come
    if (input.purchaseOrderId) await this.arrivedOn(tx, input.purchaseOrderId, supplier.party.id);

    return { transactionId: t.id, assignedId: t.assignedId, total: total / 100 };
  }

  // a purchase order an arrival is recorded on: pending and the supplier's own; done once every item has fully come
  // (this purchase counted, as it's saved already)
  private async arrivedOn(tx: Tx, orderId: string, partyId: string) {
    const [order] = await tx.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, orderId)).for("update");
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
    if (order.status !== "pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `This order is ${order.status}.` });
    if (order.partyId !== partyId) throw new TRPCError({ code: "BAD_REQUEST", message: "This order is from another supplier." });
    const ordered = await tx
      .select({ productId: purchaseOrderProductsTable.productId, quantity: purchaseOrderProductsTable.quantityOrdered })
      .from(purchaseOrderProductsTable)
      .where(eq(purchaseOrderProductsTable.purchaseOrderId, orderId));
    const came = await arrivedFor(tx, orderId);
    if (ordered.every((o) => (came.get(o.productId) ?? 0) >= o.quantity)) {
      await tx.update(purchaseOrdersTable).set({ status: "completed" }).where(eq(purchaseOrdersTable.id, orderId));
    }
  }

  // the supplier's bill attached (or changed) after the purchase was saved
  async attachBill(rawInput: AttachBillInputModel) {
    const input = attachBillInputModel.parse(rawInput);
    const [row] = await db.update(purchasesTable).set({ invoiceUrl: input.invoiceUrl }).where(eq(purchasesTable.transactionId, input.transactionId)).returning({ id: purchasesTable.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found." });
    return this.get({ transactionId: input.transactionId });
  }

  // a purchase as it was recorded
  async get(input: PurchaseIdInputModel): Promise<PurchaseModel> {
    const [row] = await db
      .select({ p: purchasesTable, t: transactionsTable, shortName: partiesTable.shortName })
      .from(purchasesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, purchasesTable.transactionId))
      .leftJoin(partiesTable, eq(partiesTable.id, purchasesTable.partyId))
      .where(eq(purchasesTable.transactionId, input.transactionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found." });
    const { p, t } = row;
    const items = await db
      .select()
      .from(purchaseProductsTable)
      .where(eq(purchaseProductsTable.purchaseId, p.id))
      .orderBy(asc(purchaseProductsTable.createdAt), asc(purchaseProductsTable.id));
    // a pack size once, its godown parts added up, in the order it was added
    const byProduct = new Map<string, { name: string; quantity: number; gross: number; off: number; gstRate: number; gst: number; godowns: { godownName: string; quantity: number }[] }>();
    for (const i of items) {
      const l = byProduct.get(i.productId) ?? { name: i.productNameSnapshot, quantity: 0, gross: 0, off: 0, gstRate: i.gstRate, gst: 0, godowns: [] };
      l.quantity += i.quantity;
      l.gross += toPaise(Number(i.grossProductPrice));
      l.off += toPaise(Number(i.discountAmount));
      l.gst += toPaise(Number(i.gstAmount));
      l.godowns.push({ godownName: i.godownName, quantity: i.quantity });
      byProduct.set(i.productId, l);
    }
    const lines = [...byProduct.entries()].map(([productId, l]) => ({
      productId,
      name: l.name,
      quantity: l.quantity,
      rate: Math.round(l.gross / l.quantity) / 100,
      discount: l.off / 100,
      taxable: (l.gross - l.off) / 100,
      gstRate: l.gstRate,
      gst: l.gst / 100,
      godowns: l.godowns,
    }));
    const charges = (
      [
        { key: "freight", amount: Number(p.freightAmount) },
        { key: "packing", amount: Number(p.packagingAmount) },
        { key: "loading", amount: Number(p.handlingAmount) },
        { key: "other", amount: Number(p.otherAmount) },
      ] as const
    ).filter((c) => c.amount > 0);
    const chargesAll = charges.reduce((a, c) => a + toPaise(c.amount), 0);
    const gstAll = toPaise(Number(p.gstAmount));
    const intra = p.supplyType === "intra";
    const cgst = intra ? Math.floor(gstAll / 2) : 0;
    const figured = toPaise(Number(p.subtotal)) + chargesAll + gstAll - toPaise(Number(p.discountAmount));
    const paidNow = await this.paidWith(t.id, p.partyId);
    return {
      transactionId: t.id,
      assignedId: t.assignedId,
      status: t.status === "cancelled" ? "cancelled" : "active",
      kind: p.transactedIn === "credit" ? "credit" : "cash",
      invoiceDate: p.invoiceDate,
      supplierInvoiceNumber: p.supplierInvoiceNumber,
      invoiceUrl: p.invoiceUrl || null,
      supplier: { partyId: p.partyId, name: p.partyNameSnapshot, shortName: row.shortName ?? null, phone: p.partyPhoneSnapshot, gstin: p.billFromGstinSnapshot },
      billFrom: {
        line1: p.billFromAddressLine1Snapshot,
        line2: p.billFromAddressLine2Snapshot,
        city: p.billFromCitySnapshot,
        district: p.billFromDistrictSnapshot,
        state: p.billFromStateSnapshot,
        stateCode: p.billFromStateCodeSnapshot,
        postalCode: p.billFromPostalCodeSnapshot,
      },
      supplyType: intra ? "intra" : "inter",
      purchaseOrderId: p.orderId,
      vehicleNumber: p.vehicleNumber,
      remarks: p.remarks,
      lines,
      charges: charges.map((c) => ({ key: c.key, amount: c.amount })),
      taxable: (toPaise(Number(p.subtotal)) + chargesAll) / 100,
      cgst: cgst / 100,
      sgst: (intra ? gstAll - cgst : 0) / 100,
      igst: (intra ? 0 : gstAll) / 100,
      discount: Number(p.discountAmount),
      roundOff: (toPaise(Number(t.amount)) - figured) / 100,
      total: Number(t.amount),
      paid: paidNow,
      createdByName: t.createdByName ?? "",
    };
  }

  // what was paid with the purchase itself: the supplier's debit in it (what left cash and the banks for them)
  private async paidWith(transactionId: string, partyId: string | null) {
    if (!partyId) return 0;
    const rows = await db
      .select({ amount: ledgerEntriesTable.amount })
      .from(ledgerEntriesTable)
      .innerJoin(ledgersTable, eq(ledgersTable.id, ledgerEntriesTable.ledgerId))
      .where(
        and(
          eq(ledgerEntriesTable.transactionId, transactionId),
          eq(ledgerEntriesTable.transactionType, "debit"),
          eq(ledgerEntriesTable.isReversal, false),
          eq(ledgersTable.referenceTable, "parties"),
          eq(ledgersTable.referenceId, partyId),
        ),
      );
    return rows.reduce((a, r) => a + toPaise(Number(r.amount)), 0) / 100;
  }
}

// how many of each item have come on a purchase order, from its purchases that still stand
export async function arrivedFor(q: Pick<Tx, "select">, orderId: string) {
  const rows = await q
    .select({ productId: purchaseProductsTable.productId, quantity: purchaseProductsTable.quantity })
    .from(purchaseProductsTable)
    .innerJoin(purchasesTable, eq(purchasesTable.id, purchaseProductsTable.purchaseId))
    .innerJoin(transactionsTable, eq(transactionsTable.id, purchasesTable.transactionId))
    .where(and(eq(purchasesTable.orderId, orderId), eq(transactionsTable.status, "active")));
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.productId, (out.get(r.productId) ?? 0) + r.quantity);
  return out;
}
