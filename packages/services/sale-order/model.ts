import { z } from "zod";

import { orderEditModel } from "../order-edit/model";

import { partyAddressInputModel } from "../party/model";
import { orderDeliveryModel, orderLineInputModel, orderStatusModel, sharedPurchaseOrderModel } from "../purchase-order/model";

const idModel = z.string().uuid();

// a calendar day as YYYY-MM-DD (the expected delivery)
const dayModel = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

// rupees with at most 2 decimals, within the money columns
const rupeesModel = z.number().min(0).max(9_999_999_999_999).multipleOf(0.01);

// a mobile as WhatsApp takes it: 10 digits, 6 to 9 first
const mobileModel = z.string().trim().regex(/^[6-9]\d{9}$/, "A 10-digit mobile number.");

// a party address's fields, as rules for a customer's delivery address on the order
const a = partyAddressInputModel.shape;

// someone not yet a customer: kept by name (no digits), an optional phone and where to deliver on the order itself; they
// become a customer only if the sale turns out to be on credit
export const orderCustomerInputModel = z.object({
  // as a party's address: the line and landmark optional; the town, district, state and PIN not
  address: z.object({
    addressLine1: a.addressLine1,
    landmark: a.landmark,
    city: a.city,
    district: a.district,
    state: a.state,
    stateCode: a.stateCode,
    postalCode: a.postalCode,
  }),
  name: z.string().trim().min(1).max(150).regex(/^\D*$/, "A name has no numbers."),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "A 10-digit mobile number.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
});

// a new sale order: a customer picked, or a name (and phone) given (one of the two), an optional expected delivery (on or
// after today, the order's own date), the items (each pack size once), one discount off the total after GST, and
// remarks. Its date is the day it's made, never typed
export const createSaleOrderInputModel = z
  .object({
    partyId: idModel.nullable().default(null),
    customer: orderCustomerInputModel.nullable().default(null),
    expectedDeliveryDate: dayModel.nullable().default(null),
    lines: z.array(orderLineInputModel).min(1, "Add an item.").max(100),
    orderDiscount: rupeesModel.default(0),
    remarks: z.string().trim().max(1000).nullable().default(null),
    // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
    saveKey: z.string().uuid().nullable().default(null),
  })
  .superRefine((o, ctx) => {
    const ids = o.lines.map((l) => l.productId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each pack size once.", path: ["lines"] });
  })
  .refine((o) => (o.partyId === null) !== (o.customer === null), { message: "Pick the customer, or give a name.", path: ["partyId"] });

export type CreateSaleOrderInputModel = z.infer<typeof createSaleOrderInputModel>;

// a pending order changed: its items, discount, expected day and remarks, and which order. The customer (and their
// details, or the name, phone and address kept on the order) stays as it was made
export const updateSaleOrderInputModel = z
  .object({
    id: idModel,
    expectedDeliveryDate: dayModel.nullable().default(null),
    lines: z.array(orderLineInputModel).min(1, "Add an item.").max(100),
    orderDiscount: rupeesModel.default(0),
    remarks: z.string().trim().max(1000).nullable().default(null),
  })
  .superRefine((o, ctx) => {
    const ids = o.lines.map((l) => l.productId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each pack size once.", path: ["lines"] });
  });

export type UpdateSaleOrderInputModel = z.infer<typeof updateSaleOrderInputModel>;

export const saleOrderIdInputModel = z.object({ id: idModel });

export type SaleOrderIdInputModel = z.infer<typeof saleOrderIdInputModel>;

// one item as saved: the pack size as it reads and the figures
export const saleOrderLineModel = z.object({
  productId: idModel,
  title: z.string(),
  packSize: z.number(),
  packSizeCode: z.enum(["KGS", "LTR", "BOX", "PCS"]),
  quantity: z.number(),
  rateBeforeGst: z.number(),
  discount: z.number(),
  // this line's share of the whole-order discount
  orderDiscountShare: z.number(),
  gstRate: z.number(),
  gstAmount: z.number(),
  // with GST, less its share of the order discount
  total: z.number(),
  // how many have gone out through sales made from the order
  delivered: z.number(),
});

// who it's for: a customer (their party) or a name kept on the order, with the phone known for either
export const saleOrderCustomerModel = z.object({ partyId: idModel.nullable(), name: z.string(), phone: z.string().nullable() });

// the list: by status, customer and the days ordered (from and to, either open), newest first
export const listSaleOrdersInputModel = z
  .object({
    status: orderStatusModel.optional(),
    partyId: idModel.optional(),
    from: dayModel.optional(),
    to: dayModel.optional(),
  })
  .default({});

export type ListSaleOrdersInputModel = z.infer<typeof listSaleOrdersInputModel>;

// one order in the list: its number, status, who it's for, when it was ordered and how many products
export const saleOrderSummaryModel = z.object({
  id: idModel,
  orderId: z.string(),
  orderDate: z.string(),
  expectedDeliveryDate: z.string().nullable(),
  status: orderStatusModel,
  customer: saleOrderCustomerModel,
  itemCount: z.number(),
  totalAmount: z.number(),
});

export type SaleOrderSummaryModel = z.infer<typeof saleOrderSummaryModel>;

export const saleOrderModel = z.object({
  id: idModel,
  orderId: z.string(),
  orderDate: z.string(),
  expectedDeliveryDate: z.string().nullable(),
  status: orderStatusModel,
  customer: saleOrderCustomerModel,
  itemCount: z.number(),
  totalAmount: z.number(),
  lines: z.array(saleOrderLineModel),
  // before the order discount and GST
  subtotal: z.number(),
  orderDiscount: z.number(),
  gstAmount: z.number(),
  remarks: z.string().nullable(),
  orderedByName: z.string(),
  // the sales made from the order, each one dispatch
  deliveries: z.array(orderDeliveryModel),
  // when it was made, and when it was cancelled (if it was)
  // each save of a change to it, oldest first
  edits: z.array(orderEditModel),
  createdAt: z.date(),
  cancelledAt: z.date().nullable(),
});

export type SaleOrderModel = z.infer<typeof saleOrderModel>;

// the order as a document (ours, and the customer's from a shared link): the order, our details it's headed with, and
// the customer's short name, phone and default address (none for a name kept on the order)
export const sharedSaleOrderModel = z.object({
  order: saleOrderModel,
  company: sharedPurchaseOrderModel.shape.company,
  customer: sharedPurchaseOrderModel.shape.supplier,
});

export type SharedSaleOrderModel = z.infer<typeof sharedSaleOrderModel>;

// the customer's WhatsApp number, typed when the order is shared: kept on the customer (or on the order, for a name)
export const customerPhoneInputModel = z.object({ id: idModel, phone: mobileModel });

export type CustomerPhoneInputModel = z.infer<typeof customerPhoneInputModel>;

// an order opened from a shared link: its id and the key from that link
export const sharedSaleOrderInputModel = z.object({ id: idModel, key: z.string().max(64) });
