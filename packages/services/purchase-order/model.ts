import { z } from "zod";

import { createPayeeInputModel } from "../party/model";

const idModel = z.string().uuid();

// a calendar day as YYYY-MM-DD (the order's own date, the expected delivery)
const dayModel = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

// rupees with at most 2 decimals, within the money columns
const rupeesModel = z.number().min(0).max(9_999_999_999_999).multipleOf(0.01);

// one item on the order: a pack size, how many, the agreed rate per pack before GST and this line's own discount in
// rupees (for the whole quantity). GST % is never sent: the server takes it from the product
export const orderLineInputModel = z
  .object({
    productId: idModel,
    quantity: z.number().int().min(1).max(99_999),
    rateBeforeGst: rupeesModel.max(9_999_999.99),
    discount: rupeesModel.default(0),
  })
  .refine((l) => l.discount <= l.quantity * l.rateBeforeGst, { message: "The discount can't be more than the item's value.", path: ["discount"] });

export type OrderLineInputModel = z.infer<typeof orderLineInputModel>;

// what a purchase order is made of, new or edited: the supplier, an optional expected delivery (on or after the
// order's date, which is always the day it was made, never typed), the items (each pack size once), one discount on
// the whole order and remarks
const orderFieldsModel = z.object({
  partyId: idModel,
  expectedDeliveryDate: dayModel.nullable().default(null),
  lines: z.array(orderLineInputModel).min(1, "Add an item.").max(100),
  orderDiscount: rupeesModel.default(0),
  remarks: z.string().trim().max(1000).nullable().default(null),
});

const orderChecks = (o: { lines: { productId: string }[] }, ctx: z.RefinementCtx) => {
  const ids = o.lines.map((l) => l.productId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each pack size once.", path: ["lines"] });
};

// a supplier added while ordering, as a payment adds one: its details (no phone needed; it's asked when the order is
// shared) and its first address, which it must have
export const newSupplierInputModel = createPayeeInputModel.refine((p) => p.addresses.length > 0, { message: "A new supplier needs an address.", path: ["addresses"] });

export type NewSupplierInputModel = z.infer<typeof newSupplierInputModel>;

export const createPurchaseOrderInputModel = orderFieldsModel
  .extend({
    // a supplier on the list, or a new one added with the order (one of the two)
    partyId: idModel.nullable().default(null),
    newSupplier: newSupplierInputModel.nullable().default(null),
    // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
    saveKey: z.string().uuid().nullable().default(null),
  })
  .superRefine(orderChecks)
  .refine((o) => (o.partyId === null) !== (o.newSupplier === null), { message: "Pick the supplier, or add a new one.", path: ["partyId"] });

export type CreatePurchaseOrderInputModel = z.infer<typeof createPurchaseOrderInputModel>;

export const updatePurchaseOrderInputModel = orderFieldsModel.extend({ id: idModel }).superRefine(orderChecks);

export type UpdatePurchaseOrderInputModel = z.infer<typeof updatePurchaseOrderInputModel>;

export const purchaseOrderIdInputModel = z.object({ id: idModel });

export type PurchaseOrderIdInputModel = z.infer<typeof purchaseOrderIdInputModel>;

export const orderStatusModel = z.enum(["pending", "completed", "cancelled"]);

// the list: by status and supplier, newest first
export const listPurchaseOrdersInputModel = z
  .object({
    status: orderStatusModel.optional(),
    partyId: idModel.optional(),
  })
  .default({});

export type ListPurchaseOrdersInputModel = z.infer<typeof listPurchaseOrdersInputModel>;

// one item as saved: the pack size as it reads, the figures, and how many have arrived through purchases so far
export const purchaseOrderLineModel = z.object({
  productId: idModel,
  title: z.string(),
  packSize: z.number(),
  packSizeCode: z.enum(["KGS", "LTR", "BOX", "PCS"]),
  quantity: z.number(),
  received: z.number(),
  rateBeforeGst: z.number(),
  discount: z.number(),
  // this line's share of the whole-order discount
  orderDiscountShare: z.number(),
  gstRate: z.number(),
  gstAmount: z.number(),
  // after both discounts, with GST
  total: z.number(),
});

// a purchase made from the order: one delivery
export const orderDeliveryModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  quantity: z.number(),
});

export const purchaseOrderSummaryModel = z.object({
  id: idModel,
  orderId: z.string(),
  orderDate: z.string(),
  expectedDeliveryDate: z.string().nullable(),
  status: orderStatusModel,
  party: z.object({ id: idModel, name: z.string() }),
  itemCount: z.number(),
  totalAmount: z.number(),
  // every item fully arrived
  quantity: z.number(),
  received: z.number(),
});

export type PurchaseOrderSummaryModel = z.infer<typeof purchaseOrderSummaryModel>;

export const purchaseOrderModel = purchaseOrderSummaryModel.extend({
  lines: z.array(purchaseOrderLineModel),
  // before the order discount and GST, after each item's own discount
  subtotal: z.number(),
  orderDiscount: z.number(),
  // CGST + SGST from a supplier in our state, IGST from outside it (none known until the supplier has an address)
  gst: z.object({ cgst: z.number(), sgst: z.number(), igst: z.number(), total: z.number() }),
  remarks: z.string().nullable(),
  orderedByName: z.string(),
  deliveries: z.array(orderDeliveryModel),
});

export type PurchaseOrderModel = z.infer<typeof purchaseOrderModel>;

// the key for an order's link, to share it with its supplier on WhatsApp
export const purchaseOrderShareKeyModel = z.object({ key: z.string() });

// the supplier's WhatsApp number, typed when the order is shared and kept on the supplier (a mobile: 10 digits, 6 to 9
// first)
export const supplierPhoneInputModel = z.object({ id: idModel, phone: z.string().trim().regex(/^[6-9]\d{9}$/, "A 10-digit mobile number.") });

export type SupplierPhoneInputModel = z.infer<typeof supplierPhoneInputModel>;

// an order opened from a shared link: its id and the key from that link
export const sharedPurchaseOrderInputModel = z.object({ id: idModel, key: z.string().max(64) });

// the order as a document (the admin's view, and the supplier's from a shared link): the order, our details it's headed
// with, and the supplier's phone and default address
export const sharedPurchaseOrderModel = z.object({
  order: purchaseOrderModel,
  company: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string(),
    email: z.string(),
    state: z.string(),
    stateCode: z.string(),
    gstin: z.string(),
    fssai: z.string(),
    jurisdiction: z.string(),
  }),
  supplier: z.object({
    shortName: z.string().nullable(),
    phone: z.string().nullable(),
    address: z
      .object({
        line1: z.string(),
        line2: z.string().nullable(),
        landmark: z.string().nullable(),
        city: z.string(),
        state: z.string(),
        stateCode: z.string(),
        postalCode: z.string(),
        gstin: z.string().nullable(),
      })
      .nullable(),
  }),
});

export type SharedPurchaseOrderModel = z.infer<typeof sharedPurchaseOrderModel>;
