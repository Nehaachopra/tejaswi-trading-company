import { TRPCError } from "@trpc/server";
import { and, asc, count, db, desc, eq, gte, inArray, lte, sql } from "@repo/database";
import { partiesTable, partyAddressesTable, productPricesTable, productsTable, saleOrderProductsTable, saleOrdersTable } from "@repo/database/schema";

import type { ActorModel } from "../accounts/model";
import { fromPaise, toPaise } from "../accounts/money";
import PartyService from "../party";
import { priceLines } from "../purchase-order";
import type { OrderLineInputModel } from "../purchase-order/model";
import SettingService from "../setting";
import type { Tx } from "../stock/engine";
import AssignedIdCounter from "../transaction/assigned-id";
import {
  type CreateSaleOrderInputModel,
  createSaleOrderInputModel,
  type CustomerPhoneInputModel,
  type ListSaleOrdersInputModel,
  type SaleOrderIdInputModel,
  type SaleOrderModel,
  type SaleOrderSummaryModel,
  type SharedSaleOrderModel,
} from "./model";

// the day it is in India, as YYYY-MM-DD
const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

// Sale orders (admin and staff): what a customer has asked us for. The ordered quantities are held back (reserved) from
// stock so they can't be promised twice; a cancel gives them back. The customer is a party picked from the list, or
// someone kept by name (and phone) on the order, who becomes a customer only if the sale is on credit
export default class SaleOrderService {
  constructor(
    private readonly ids = new AssignedIdCounter(),
    private readonly settings = new SettingService(),
    private readonly parties = new PartyService(),
  ) {}

  // the customer: an active party
  private async customerIn(tx: Tx, partyId: string) {
    const [party] = await tx.select().from(partiesTable).where(eq(partiesTable.id, partyId));
    if (!party) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
    if (!party.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${party.name} is inactive.` });
    return party;
  }

  // each item's product, locked in id order (so two saves never wait on each other): active, not deleted, with a GST %
  // set, and enough of it free (not held for another order) for the quantity asked
  private async productsIn(tx: Tx, lines: OrderLineInputModel[]) {
    const ids = [...lines.map((l) => l.productId)].sort();
    const rows = await tx
      .select({ id: productsTable.id, brand: productsTable.brand, isActive: productsTable.isActive, deletedAt: productsTable.deletedAt, free: productsTable.unreservedQuantity })
      .from(productsTable)
      .where(inArray(productsTable.id, ids))
      .orderBy(asc(productsTable.id))
      .for("update");
    const gst = await tx
      .select({ productId: productPricesTable.productId, gst: productPricesTable.gstPercent })
      .from(productPricesTable)
      .where(inArray(productPricesTable.productId, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const gstOf = new Map(gst.map((g) => [g.productId, g.gst]));
    return lines.map((l) => {
      const row = byId.get(l.productId);
      if (!row || row.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      if (!row.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "An item is inactive." });
      const rate = gstOf.get(l.productId);
      if (rate == null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Set the GST % for every item first." });
      if (l.quantity > row.free) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Only ${row.free} of an item are free to order.` });
      return Number(rate);
    });
  }

  // hold the ordered quantities back from stock, or (give back) return them
  private async hold(tx: Tx, lines: { productId: string; quantity: number }[], give: 1 | -1) {
    for (const l of lines) {
      const n = l.quantity * give;
      await tx
        .update(productsTable)
        .set({ reservedQuantity: sql`${productsTable.reservedQuantity} + ${n}`, unreservedQuantity: sql`${productsTable.unreservedQuantity} - ${n}` })
        .where(eq(productsTable.id, l.productId));
    }
  }

  async create(rawInput: CreateSaleOrderInputModel, actor: ActorModel): Promise<SaleOrderModel> {
    const input = createSaleOrderInputModel.parse(rawInput);
    // dated the day it's made (India), never typed
    const orderDate = indiaToday();
    if (input.expectedDeliveryDate && input.expectedDeliveryDate < orderDate) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Delivery can't be before the order date." });
    }
    const id = await db.transaction(async (tx) => {
      if (input.partyId) await this.customerIn(tx, input.partyId);
      const rates = await this.productsIn(tx, input.lines);
      const p = priceLines(
        input.lines.map((l, i) => ({ quantity: l.quantity, rate: l.rateBeforeGst, discount: l.discount, gstRate: rates[i]! })),
        input.orderDiscount,
      );
      const [order] = await tx
        .insert(saleOrdersTable)
        .values({
          orderId: await this.ids.next(tx, "SO", new Date(`${orderDate}T12:00:00+05:30`)),
          partyId: input.partyId,
          customerName: input.customer?.name ?? null,
          customerPhone: input.customer?.phone ?? null,
          // where to deliver, for someone kept by name
          ...(input.customer
            ? {
                customerAddressLine1: input.customer.address.addressLine1 || null,
                customerLandmark: input.customer.address.landmark,
                customerCity: input.customer.address.city,
                customerDistrict: input.customer.address.district,
                customerState: input.customer.address.state,
                customerStateCode: input.customer.address.stateCode,
                customerPostalCode: input.customer.address.postalCode,
              }
            : {}),
          orderedById: actor.id,
          orderedByName: actor.name.slice(0, 255),
          orderDate,
          expectedDeliveryDate: input.expectedDeliveryDate,
          remarks: input.remarks || null,
          subtotal: fromPaise(p.subtotal),
          discountAmount: fromPaise(p.off),
          gstAmount: fromPaise(p.gst),
          totalAmount: fromPaise(p.total),
        })
        .returning({ id: saleOrdersTable.id });
      await tx.insert(saleOrderProductsTable).values(
        input.lines.map((l, i) => ({
          saleOrderId: order!.id,
          productId: l.productId,
          quantityOrdered: l.quantity,
          rateBeforeGst: fromPaise(toPaise(l.rateBeforeGst)),
          discountAmount: fromPaise(toPaise(l.discount)),
          gstRate: String(rates[i]),
          gstAmount: fromPaise(p.priced[i]!.gst),
        })),
      );
      await this.hold(tx, input.lines, 1);
      return order!.id;
    });
    return this.get({ id });
  }

  // a pending order called off: what it held back goes back to stock
  async cancel(input: SaleOrderIdInputModel): Promise<SaleOrderModel> {
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, input.id)).for("update");
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      if (order.status !== "pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `This order is ${order.status}.` });
      const lines = await tx
        .select({ productId: saleOrderProductsTable.productId, quantity: saleOrderProductsTable.quantityOrdered })
        .from(saleOrderProductsTable)
        .where(eq(saleOrderProductsTable.saleOrderId, order.id))
        .orderBy(asc(saleOrderProductsTable.productId));
      await tx.select({ id: productsTable.id }).from(productsTable).where(inArray(productsTable.id, lines.map((l) => l.productId))).orderBy(asc(productsTable.id)).for("update");
      await this.hold(tx, lines, -1);
      await tx.update(saleOrdersTable).set({ status: "cancelled" }).where(eq(saleOrdersTable.id, order.id));
    });
    return this.get(input);
  }

  // the customer's WhatsApp number, typed when the order is shared: kept on the customer if they have no phone yet, or
  // on the order for someone kept by name
  async saveCustomerPhone(input: CustomerPhoneInputModel) {
    await db.transaction(async (tx) => {
      const [order] = await tx.select({ partyId: saleOrdersTable.partyId, phone: saleOrdersTable.customerPhone }).from(saleOrdersTable).where(eq(saleOrdersTable.id, input.id));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      if (order.partyId) return this.parties.addPhoneIn(tx, order.partyId, input.phone);
      if (!order.phone) await tx.update(saleOrdersTable).set({ customerPhone: input.phone }).where(eq(saleOrdersTable.id, input.id));
    });
  }

  // the order as a document: the order, our details on top, and the customer's short name, phone and address (a
  // customer's default one, or where to deliver kept on the order for someone kept by name)
  async document(input: SaleOrderIdInputModel): Promise<SharedSaleOrderModel> {
    const order = await this.get(input);
    const [kept] = await db.select().from(saleOrdersTable).where(eq(saleOrdersTable.id, input.id));
    const partyId = order.customer.partyId;
    const [party] = partyId ? await db.select({ shortName: partiesTable.shortName }).from(partiesTable).where(eq(partiesTable.id, partyId)) : [];
    const [a] = partyId
      ? await db
          .select()
          .from(partyAddressesTable)
          .where(and(eq(partyAddressesTable.partyId, partyId), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)))
      : [];
    return {
      order,
      company: await this.settings.get("company"),
      customer: {
        shortName: party?.shortName ?? null,
        phone: order.customer.phone,
        address: a
          ? { line1: a.addressLine1, line2: a.addressLine2, landmark: a.landmark, city: a.city, state: a.state, stateCode: a.stateCode, postalCode: a.postalCode, gstin: a.gstin }
          : kept?.customerCity && kept.customerState && kept.customerStateCode && kept.customerPostalCode
            ? { line1: kept.customerAddressLine1 ?? "", line2: null, landmark: kept.customerLandmark, city: kept.customerCity, state: kept.customerState, stateCode: kept.customerStateCode, postalCode: kept.customerPostalCode, gstin: null }
            : null,
      },
    };
  }

  // the orders, newest first (by status, customer and days ordered): number, status, who it's for and how many products
  async list(input: ListSaleOrdersInputModel): Promise<SaleOrderSummaryModel[]> {
    const items = db
      .select({ saleOrderId: saleOrderProductsTable.saleOrderId, n: count().as("n") })
      .from(saleOrderProductsTable)
      .groupBy(saleOrderProductsTable.saleOrderId)
      .as("items");
    const rows = await db
      .select({ o: saleOrdersTable, partyName: partiesTable.name, partyPhone: partiesTable.phone, n: items.n })
      .from(saleOrdersTable)
      .leftJoin(partiesTable, eq(partiesTable.id, saleOrdersTable.partyId))
      .leftJoin(items, eq(items.saleOrderId, saleOrdersTable.id))
      .where(
        and(
          input.status ? eq(saleOrdersTable.status, input.status) : undefined,
          input.partyId ? eq(saleOrdersTable.partyId, input.partyId) : undefined,
          input.from ? gte(saleOrdersTable.orderDate, input.from) : undefined,
          input.to ? lte(saleOrdersTable.orderDate, input.to) : undefined,
        ),
      )
      .orderBy(desc(saleOrdersTable.orderDate), desc(saleOrdersTable.orderId));
    return rows.map(({ o, partyName, partyPhone, n }) => ({
      id: o.id,
      orderId: o.orderId,
      orderDate: o.orderDate,
      expectedDeliveryDate: o.expectedDeliveryDate,
      status: o.status,
      customer: {
        partyId: o.partyId,
        name: o.partyId ? (partyName ?? "") : (o.customerName ?? ""),
        phone: o.partyId ? (partyPhone ?? null) : o.customerPhone,
      },
      itemCount: Number(n ?? 0),
      totalAmount: Number(o.totalAmount),
    }));
  }

  // one order in full: who it's for and its items with their figures
  async get(input: SaleOrderIdInputModel): Promise<SaleOrderModel> {
    const [row] = await db
      .select({ o: saleOrdersTable, partyName: partiesTable.name, partyPhone: partiesTable.phone })
      .from(saleOrdersTable)
      .leftJoin(partiesTable, eq(partiesTable.id, saleOrdersTable.partyId))
      .where(eq(saleOrdersTable.id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
    const { o } = row;
    const lines = await db
      .select({ l: saleOrderProductsTable, brand: productsTable.brand, name: productsTable.name, packSize: productsTable.packSize, packSizeCode: productsTable.packSizeCode })
      .from(saleOrderProductsTable)
      .innerJoin(productsTable, eq(productsTable.id, saleOrderProductsTable.productId))
      .where(eq(saleOrderProductsTable.saleOrderId, o.id))
      .orderBy(saleOrderProductsTable.createdAt, saleOrderProductsTable.id);
    // the figures again, for each line's share of the order discount
    const p = priceLines(
      lines.map(({ l }) => ({ quantity: l.quantityOrdered, rate: Number(l.rateBeforeGst), discount: Number(l.discountAmount), gstRate: Number(l.gstRate) })),
      Number(o.discountAmount),
    );
    const items = lines.map(({ l, brand, name, packSize, packSizeCode }, i) => ({
      productId: l.productId,
      title: [brand, name].filter(Boolean).join(" "),
      packSize,
      packSizeCode,
      quantity: l.quantityOrdered,
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
      customer: {
        partyId: o.partyId,
        name: o.partyId ? (row.partyName ?? "") : (o.customerName ?? ""),
        phone: o.partyId ? (row.partyPhone ?? null) : o.customerPhone,
      },
      itemCount: items.length,
      totalAmount: Number(o.totalAmount),
      lines: items,
      subtotal: Number(o.subtotal),
      orderDiscount: Number(o.discountAmount),
      gstAmount: Number(o.gstAmount),
      remarks: o.remarks,
      orderedByName: o.orderedByName,
    };
  }
}
