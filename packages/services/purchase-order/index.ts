import { TRPCError } from "@trpc/server";
import { and, db, desc, eq, gte, inArray, lte } from "@repo/database";
import {
  partiesTable,
  partyAddressesTable,
  productPricesTable,
  productsTable,
  purchaseOrderProductsTable,
  purchaseOrdersTable,
  purchaseProductsTable,
  purchasesTable,
  transactionsTable,
} from "@repo/database/schema";

import type { ActorModel } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import PartyService from "../party";
import SettingService from "../setting";
import type { Tx } from "../stock/engine";
import AssignedIdCounter from "../transaction/assigned-id";
import {
  type CreatePurchaseOrderInputModel,
  createPurchaseOrderInputModel,
  type ListPurchaseOrdersInputModel,
  type NewSupplierInputModel,
  type OrderLineInputModel,
  type PurchaseOrderIdInputModel,
  type PurchaseOrderModel,
  type PurchaseOrderSummaryModel,
  type SharedPurchaseOrderModel,
  type SupplierPhoneInputModel,
  type UpdatePurchaseOrderInputModel,
  updatePurchaseOrderInputModel,
} from "./model";

type Query = Pick<Tx, "select">;

// the day it is in India, as YYYY-MM-DD
const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

// the figures of each item, all in paise: its value after its own discount, GST on that value, and its share of the
// whole-order discount (spread by value, the last item taking what rounding leaves). The order discount comes off the
// total after GST, so GST is on each item's full value; it can't be more than the items' value before GST
export function priceLines(lines: { quantity: number; rate: number; discount: number; gstRate: number }[], orderDiscount: number) {
  const values = lines.map((l) => l.quantity * toPaise(l.rate) - toPaise(l.discount));
  const subtotal = values.reduce((a, b) => a + b, 0);
  const off = toPaise(orderDiscount);
  if (off > subtotal) throw new TRPCError({ code: "BAD_REQUEST", message: "The order discount can't be more than the items' value." });
  let left = off;
  const priced = values.map((value, i) => {
    const share = i === values.length - 1 ? left : subtotal === 0 ? 0 : Math.round((off * value) / subtotal);
    left -= share;
    const gst = Math.round((value * lines[i]!.gstRate) / 100);
    return { value, share, gst };
  });
  const gst = priced.reduce((a, p) => a + p.gst, 0);
  return { priced, subtotal, off, gst, total: subtotal - off + gst };
}

// Purchase orders (admin only): what we've asked a supplier for. No money or stock moves here; each delivery is a
// purchase linked to the order, and what has arrived is added up from those purchases. Editable and cancellable while
// pending; done once every item has fully arrived
export default class PurchaseOrderService {
  constructor(
    private readonly ids = new AssignedIdCounter(),
    private readonly settings = new SettingService(),
    private readonly parties = new PartyService(),
  ) {}

  // the supplier: an active party marked as a supplier
  private async supplierIn(tx: Tx, partyId: string) {
    const [party] = await tx.select().from(partiesTable).where(eq(partiesTable.id, partyId));
    if (!party) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found." });
    if (!party.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${party.name} is inactive.` });
    if (!party.types.includes("supplier")) throw new TRPCError({ code: "BAD_REQUEST", message: `${party.name} isn't a supplier.` });
    return party;
  }

  // a supplier added with the order, as a payment adds one: a party marked supplier, with its own ledger; its phone
  // may be left out
  private async addSupplier(tx: Tx, s: NewSupplierInputModel) {
    return (await this.parties.createIn(tx, s, "supplier", true)).partyId;
  }

  // each item's GST %, from its product: active, not deleted, with a GST % set
  private async gstRatesIn(tx: Tx, lines: OrderLineInputModel[]) {
    const ids = lines.map((l) => l.productId);
    const rows = await tx
      .select({ id: productsTable.id, isActive: productsTable.isActive, deletedAt: productsTable.deletedAt, gst: productPricesTable.gstPercent })
      .from(productsTable)
      .leftJoin(productPricesTable, eq(productPricesTable.productId, productsTable.id))
      .where(inArray(productsTable.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return lines.map((l) => {
      const row = byId.get(l.productId);
      if (!row || row.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      if (!row.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "An item is inactive." });
      if (row.gst == null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Set the GST % for every item first." });
      return Number(row.gst);
    });
  }

  // the order's items and totals, written fresh (a new order, or an edit replacing the old items)
  private async writeLines(tx: Tx, orderId: string, input: UpdatePurchaseOrderInputModel | CreatePurchaseOrderInputModel) {
    const rates = await this.gstRatesIn(tx, input.lines);
    const p = priceLines(
      input.lines.map((l, i) => ({ quantity: l.quantity, rate: l.rateBeforeGst, discount: l.discount, gstRate: rates[i]! })),
      input.orderDiscount,
    );
    await tx.insert(purchaseOrderProductsTable).values(
      input.lines.map((l, i) => ({
        purchaseOrderId: orderId,
        productId: l.productId,
        quantityOrdered: l.quantity,
        rateBeforeGst: fromPaise(toPaise(l.rateBeforeGst)),
        discountAmount: fromPaise(toPaise(l.discount)),
        gstRate: String(rates[i]),
        gstAmount: fromPaise(p.priced[i]!.gst),
      })),
    );
    return { subtotal: fromPaise(p.subtotal), discountAmount: fromPaise(p.off), gstAmount: fromPaise(p.gst), totalAmount: fromPaise(p.total) };
  }

  // what has arrived for each order and item, from its purchases that still stand (a cancelled one doesn't count)
  private async received(q: Query, orderIds: string[]) {
    const out = new Map<string, Map<string, number>>();
    if (orderIds.length === 0) return out;
    const rows = await q
      .select({ orderId: purchasesTable.orderId, productId: purchaseProductsTable.productId, quantity: purchaseProductsTable.quantity })
      .from(purchaseProductsTable)
      .innerJoin(purchasesTable, eq(purchasesTable.id, purchaseProductsTable.purchaseId))
      .innerJoin(transactionsTable, eq(transactionsTable.id, purchasesTable.transactionId))
      .where(and(inArray(purchasesTable.orderId, orderIds), eq(transactionsTable.status, "active")));
    for (const r of rows) {
      const items = out.get(r.orderId!) ?? new Map<string, number>();
      items.set(r.productId, (items.get(r.productId) ?? 0) + r.quantity);
      out.set(r.orderId!, items);
    }
    return out;
  }

  // a pending order, locked for this save
  private async pendingIn(tx: Tx, id: string) {
    const [order] = await tx.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).for("update");
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
    if (order.status !== "pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `This order is ${order.status}.` });
    return order;
  }

  // delivery expected on the order's date or later
  private checkExpected(expected: string | null, orderDate: string) {
    if (expected && expected < orderDate) throw new TRPCError({ code: "BAD_REQUEST", message: "Delivery can't be before the order date." });
  }

  async create(rawInput: CreatePurchaseOrderInputModel, actor: ActorModel): Promise<PurchaseOrderModel> {
    const input = createPurchaseOrderInputModel.parse(rawInput);
    // dated the day it's made (India), never typed
    const orderDate = indiaToday();
    this.checkExpected(input.expectedDeliveryDate, orderDate);
    const id = await db.transaction(async (tx) => {
      // a new supplier: a party marked supplier with its own ledger and its address
      const partyId = input.newSupplier
        ? await this.addSupplier(tx, input.newSupplier)
        : (await this.supplierIn(tx, input.partyId!)).id;
      const [order] = await tx
        .insert(purchaseOrdersTable)
        .values({
          orderId: await this.ids.next(tx, "PO", new Date(`${orderDate}T12:00:00+05:30`)),
          partyId,
          orderedById: actor.id,
          orderedByName: actor.name.slice(0, 255),
          orderDate,
          expectedDeliveryDate: input.expectedDeliveryDate,
          remarks: input.remarks || null,
        })
        .returning({ id: purchaseOrdersTable.id });
      const totals = await this.writeLines(tx, order!.id, input);
      await tx.update(purchaseOrdersTable).set(totals).where(eq(purchaseOrdersTable.id, order!.id));
      return order!.id;
    });
    return this.get({ id });
  }

  // a pending order's supplier, dates, items and discounts; once anything has arrived, the supplier stays and no item
  // goes below what came
  async update(rawInput: UpdatePurchaseOrderInputModel): Promise<PurchaseOrderModel> {
    const input = updatePurchaseOrderInputModel.parse(rawInput);
    await db.transaction(async (tx) => {
      const order = await this.pendingIn(tx, input.id);
      // its date stays the day it was made
      this.checkExpected(input.expectedDeliveryDate, order.orderDate);
      const came = (await this.received(tx, [order.id])).get(order.id) ?? new Map<string, number>();
      if (came.size > 0 && input.partyId !== order.partyId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Goods have arrived on this order, so the supplier can't change." });
      }
      for (const [productId, quantity] of came) {
        const line = input.lines.find((l) => l.productId === productId);
        if (!line || line.quantity < quantity) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${quantity} of an item have already arrived; order at least that many.` });
        }
      }
      await this.supplierIn(tx, input.partyId);
      await tx.delete(purchaseOrderProductsTable).where(eq(purchaseOrderProductsTable.purchaseOrderId, order.id));
      // totals to zero first, so the totals check holds while the items are rewritten
      await tx
        .update(purchaseOrdersTable)
        .set({ subtotal: "0", discountAmount: "0", gstAmount: "0", totalAmount: "0" })
        .where(eq(purchaseOrdersTable.id, order.id));
      const totals = await this.writeLines(tx, order.id, input);
      await tx
        .update(purchaseOrdersTable)
        .set({
          ...totals,
          partyId: input.partyId,
          expectedDeliveryDate: input.expectedDeliveryDate,
          remarks: input.remarks || null,
          // already fully arrived (items cut to what came): done
          status: input.lines.every((l) => (came.get(l.productId) ?? 0) >= l.quantity) ? "completed" : "pending",
        })
        .where(eq(purchaseOrdersTable.id, order.id));
    });
    return this.get({ id: input.id });
  }

  // a pending order called off; what already arrived stays bought
  async cancel(input: PurchaseOrderIdInputModel): Promise<PurchaseOrderModel> {
    await db.transaction(async (tx) => {
      await this.pendingIn(tx, input.id);
      await tx.update(purchaseOrdersTable).set({ status: "cancelled" }).where(eq(purchaseOrdersTable.id, input.id));
    });
    return this.get({ id: input.id });
  }

  // the orders, newest first (by status, supplier and days ordered), each with how much of it has arrived
  async list(input: ListPurchaseOrdersInputModel): Promise<PurchaseOrderSummaryModel[]> {
    const orders = await db
      .select({ o: purchaseOrdersTable, partyName: partiesTable.name })
      .from(purchaseOrdersTable)
      .innerJoin(partiesTable, eq(partiesTable.id, purchaseOrdersTable.partyId))
      .where(
        and(
          input.status ? eq(purchaseOrdersTable.status, input.status) : undefined,
          input.partyId ? eq(purchaseOrdersTable.partyId, input.partyId) : undefined,
          input.from ? gte(purchaseOrdersTable.orderDate, input.from) : undefined,
          input.to ? lte(purchaseOrdersTable.orderDate, input.to) : undefined,
        ),
      )
      .orderBy(desc(purchaseOrdersTable.orderDate), desc(purchaseOrdersTable.orderId));
    const ids = orders.map((r) => r.o.id);
    const [lines, came] = await Promise.all([
      ids.length
        ? db
            .select({ orderId: purchaseOrderProductsTable.purchaseOrderId, productId: purchaseOrderProductsTable.productId, quantity: purchaseOrderProductsTable.quantityOrdered })
            .from(purchaseOrderProductsTable)
            .where(inArray(purchaseOrderProductsTable.purchaseOrderId, ids))
        : [],
      this.received(db, ids),
    ]);
    return orders.map(({ o, partyName }) => {
      const mine = lines.filter((l) => l.orderId === o.id);
      const arrived = came.get(o.id);
      return {
        id: o.id,
        orderId: o.orderId,
        orderDate: o.orderDate,
        expectedDeliveryDate: o.expectedDeliveryDate,
        status: o.status,
        party: { id: o.partyId, name: partyName },
        itemCount: mine.length,
        totalAmount: Number(o.totalAmount),
        quantity: mine.reduce((a, l) => a + l.quantity, 0),
        received: mine.reduce((a, l) => a + Math.min(arrived?.get(l.productId) ?? 0, l.quantity), 0),
      };
    });
  }

  // the supplier's WhatsApp number, typed when the order is shared: kept on the supplier if they have no phone yet
  async saveSupplierPhone(input: SupplierPhoneInputModel) {
    await db.transaction(async (tx) => {
      const [order] = await tx.select({ partyId: purchaseOrdersTable.partyId }).from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, input.id));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      await this.parties.addPhoneIn(tx, order.partyId, input.phone);
    });
  }

  // the order as a document: the order, our details on top, and the supplier's phone and default address
  async document(input: PurchaseOrderIdInputModel): Promise<SharedPurchaseOrderModel> {
    const order = await this.get(input);
    const [party] = await db.select({ shortName: partiesTable.shortName, phone: partiesTable.phone }).from(partiesTable).where(eq(partiesTable.id, order.party.id));
    const [a] = await db
      .select()
      .from(partyAddressesTable)
      .where(and(eq(partyAddressesTable.partyId, order.party.id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)));
    return {
      order,
      company: await this.settings.get("company"),
      supplier: {
        shortName: party?.shortName ?? null,
        phone: party?.phone ?? null,
        address: a
          ? { line1: a.addressLine1, line2: a.addressLine2, landmark: a.landmark, city: a.city, state: a.state, stateCode: a.stateCode, postalCode: a.postalCode, gstin: a.gstin }
          : null,
      },
    };
  }

  // one order in full: its items with what has arrived, the GST split by the supplier's state, and its deliveries
  async get(input: PurchaseOrderIdInputModel): Promise<PurchaseOrderModel> {
    const [row] = await db
      .select({ o: purchaseOrdersTable, partyName: partiesTable.name })
      .from(purchaseOrdersTable)
      .innerJoin(partiesTable, eq(partiesTable.id, purchaseOrdersTable.partyId))
      .where(eq(purchaseOrdersTable.id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
    const { o, partyName } = row;

    const [lines, came, deliveries, [address], company] = await Promise.all([
      db
        .select({ l: purchaseOrderProductsTable, brand: productsTable.brand, name: productsTable.name, packSize: productsTable.packSize, packSizeCode: productsTable.packSizeCode })
        .from(purchaseOrderProductsTable)
        .innerJoin(productsTable, eq(productsTable.id, purchaseOrderProductsTable.productId))
        .where(eq(purchaseOrderProductsTable.purchaseOrderId, o.id))
        .orderBy(purchaseOrderProductsTable.createdAt, purchaseOrderProductsTable.id),
      this.received(db, [o.id]),
      db
        .select({ transactionId: transactionsTable.id, assignedId: transactionsTable.assignedId, dateTime: transactionsTable.dateTime, purchaseId: purchasesTable.id, vehicleNumber: purchasesTable.vehicleNumber })
        .from(purchasesTable)
        .innerJoin(transactionsTable, eq(transactionsTable.id, purchasesTable.transactionId))
        .where(and(eq(purchasesTable.orderId, o.id), eq(transactionsTable.status, "active")))
        .orderBy(transactionsTable.dateTime),
      db
        .select({ stateCode: partyAddressesTable.stateCode })
        .from(partyAddressesTable)
        .where(and(eq(partyAddressesTable.partyId, o.partyId), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true))),
      this.settings.get("company"),
    ]);

    // each delivery's quantity, from its purchase's items
    const deliveryItems = deliveries.length
      ? await db
          .select({ purchaseId: purchaseProductsTable.purchaseId, productId: purchaseProductsTable.productId, quantity: purchaseProductsTable.quantity })
          .from(purchaseProductsTable)
          .where(inArray(purchaseProductsTable.purchaseId, deliveries.map((d) => d.purchaseId)))
      : [];

    // the figures again, for each line's share of the order discount
    const p = priceLines(
      lines.map(({ l }) => ({ quantity: l.quantityOrdered, rate: Number(l.rateBeforeGst), discount: Number(l.discountAmount), gstRate: Number(l.gstRate) })),
      Number(o.discountAmount),
    );
    const arrived = came.get(o.id);
    const gst = Number(o.gstAmount);
    const sameState = !address || address.stateCode === company.stateCode;
    const cgst = sameState ? Math.floor(toPaise(gst) / 2) / 100 : 0;

    const items = lines.map(({ l, brand, name, packSize, packSizeCode }, i) => ({
      productId: l.productId,
      title: [brand, name].filter(Boolean).join(" "),
      packSize,
      packSizeCode,
      quantity: l.quantityOrdered,
      received: arrived?.get(l.productId) ?? 0,
      rateBeforeGst: Number(l.rateBeforeGst),
      discount: Number(l.discountAmount),
      orderDiscountShare: p.priced[i]!.share / 100,
      gstRate: Number(l.gstRate),
      gstAmount: Number(l.gstAmount),
      total: (p.priced[i]!.value - p.priced[i]!.share + p.priced[i]!.gst) / 100,
    }));

    return {
      id: o.id,
      orderId: o.orderId,
      orderDate: o.orderDate,
      expectedDeliveryDate: o.expectedDeliveryDate,
      status: o.status,
      party: { id: o.partyId, name: partyName },
      itemCount: items.length,
      totalAmount: Number(o.totalAmount),
      quantity: items.reduce((a, l) => a + l.quantity, 0),
      received: items.reduce((a, l) => a + Math.min(l.received, l.quantity), 0),
      lines: items,
      subtotal: Number(o.subtotal),
      orderDiscount: Number(o.discountAmount),
      gst: { cgst, sgst: sameState ? Math.round((gst - cgst) * 100) / 100 : 0, igst: sameState ? 0 : gst, total: gst },
      remarks: o.remarks,
      orderedByName: o.orderedByName,
      deliveries: deliveries.map((d) => {
        const items = deliveryItems.filter((x) => x.purchaseId === d.purchaseId);
        return {
          transactionId: d.transactionId,
          assignedId: d.assignedId,
          dateTime: d.dateTime,
          quantity: items.reduce((a, x) => a + x.quantity, 0),
          vehicleNumber: d.vehicleNumber,
          items: items.map((x) => ({ productId: x.productId, quantity: x.quantity })),
        };
      }),
      createdAt: o.createdAt,
      // a cancel is the order's last change
      cancelledAt: o.status === "cancelled" ? o.updatedAt : null,
    };
  }
}
