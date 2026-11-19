import { z } from "zod";

import { moreBankPartModel } from "../payment/model";
import { createProductInputModel, imageUrlModel } from "../product/model";
import { createPartyInputModel, partyUpiIdModel } from "../party/model";
import { appOfUpi } from "../bank/upi-handles";

const idModel = z.string().uuid();

// a supplier added with a purchase, as a customer added with a sale: their phone, name and the rest, and an address
// (the bill is from it)
const newSupplierInputModel = createPartyInputModel.refine((p) => p.addresses.length > 0, { message: "A new supplier needs an address.", path: ["addresses"] });

// rupees with at most 2 decimals, within the money columns
const rupeesModel = z.number().min(0).max(9_999_999_999_999).multipleOf(0.01);

// one godown's part of an item: how many packs go into it
export const purchaseGodownPartModel = z.object({ godownId: idModel, quantity: z.number().int().min(1).max(99_999) });

// one item bought: a pack size already on the list, or one of the new products added with this purchase (which of
// them, and which of its pack sizes); how many, the supplier's rate per pack before GST (the GST % comes from the
// product, never sent), a discount off the item's value, and where its packs go: one or more godowns, their quantities
// adding up to the item's
export const purchaseLineInputModel = z
  .object({
    productId: idModel.nullable().default(null),
    newPack: z.object({ product: z.number().int().min(0).max(19), pack: z.number().int().min(0).max(19) }).nullable().default(null),
    quantity: z.number().int().min(1).max(99_999),
    rateBeforeGst: rupeesModel.max(9_999_999.99),
    discount: rupeesModel.default(0),
    godowns: z.array(purchaseGodownPartModel).min(1, "Pick a godown.").max(20),
  })
  .refine((l) => (l.productId === null) !== (l.newPack === null), { message: "Pick the product, or add a new one.", path: ["productId"] })
  .refine((l) => l.rateBeforeGst > 0, { message: "Give the rate.", path: ["rateBeforeGst"] })
  .refine((l) => l.discount <= l.quantity * l.rateBeforeGst, { message: "The discount can't be more than the item's value.", path: ["discount"] })
  .refine((l) => l.godowns.reduce((a, g) => a + g.quantity, 0) === l.quantity, { message: "The godowns must add up to the quantity.", path: ["godowns"] })
  .refine((l) => new Set(l.godowns.map((g) => g.godownId)).size === l.godowns.length, { message: "Each godown once.", path: ["godowns"] });

export type PurchaseLineInputModel = z.infer<typeof purchaseLineInputModel>;

// a purchase: the supplier (picked, or added now) and the bill it's from (its number and day; the day dates the
// purchase); the items, each into its godowns; new products added with it; the charges on the bill (with GST in
// them, at the highest rate among the goods) and a cash discount off what's to be paid (GST stays on the full value);
// the total rounded to the rupee (the difference to Round off); then cash (any part paid now from cash and/or
// bank accounts, never more than they hold, the rest staying owed; an advance already with the supplier can be set
// off) or credit (all of it owed, with an optional credit period). An arrival on a purchase order names the order.
// Then the vehicle, remarks and the bill's photo or PDF
export const createPurchaseInputModel = z
  .object({
    // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
    saveKey: z.string().uuid().nullable().default(null),
    // the supplier's bill date
    dateTime: z.coerce.date(),
    // the supplier, by their ledger, or added now
    supplierLedgerId: idModel.nullable().default(null),
    newSupplier: newSupplierInputModel.nullable().default(null),
    // the address the bill is from (its state and GSTIN decide the GST): one of theirs, their default unless picked
    billFromAddressId: idModel.nullable().default(null),
    // the supplier's own bill number: up to 16 letters, digits, / and -, as GST allows
    supplierInvoiceNumber: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Give the bill number.")
      .max(16)
      .regex(/^[A-Z0-9/-]+$/, "A bill number has only letters, digits, / and -."),
    // products added with this purchase, each with its pack sizes, GST % and selling price, as on the Products page
    newProducts: z.array(createProductInputModel).max(20).default([]),
    lines: z.array(purchaseLineInputModel).min(1, "Add an item.").max(100),
    // charges on the bill, each with GST in it (taken out at the highest GST rate among the items)
    freightCharges: rupeesModel.default(0),
    packingCharges: rupeesModel.default(0),
    loadingCharges: rupeesModel.default(0),
    otherCharges: rupeesModel.default(0),
    // a cash discount, taken off what's paid; it doesn't lower the GST
    discount: rupeesModel.default(0),
    kind: z.enum(["cash", "credit"]),
    // an arrival on a purchase order: the purchase is kept on the order, which completes once everything ordered
    // has arrived
    purchaseOrderId: idModel.nullable().default(null),
    // cash: the cash part, and each bank account's part with how it was paid
    cashAmount: rupeesModel.default(0),
    bankParts: z.array(moreBankPartModel).max(5).default([]),
    // a part paid by UPI to a supplier with no UPI ID saved: the one typed for it, kept on them for next time
    supplierUpiId: partyUpiIdModel
      .refine((u) => appOfUpi(u) !== null, "That isn't a UPI handle (the part after @).")
      .nullable()
      .default(null),
    // cash: an advance already with the supplier is set off against this bill (as much as the bill takes)
    advanceSetOff: z.boolean().default(false),
    creditPeriodDays: z.number().int().min(0).max(365).nullable().default(null),
    vehicleNumber: z
      .string()
      .trim()
      .toUpperCase()
      .max(15)
      .regex(/^[A-Z0-9]*$/, "A vehicle number has only letters and digits.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    remarks: z.string().trim().max(1000).nullable().default(null),
    // the bill's photo or PDF, when it's attached now
    invoiceUrl: imageUrlModel.nullable().default(null),
  })
  .refine((p) => (p.supplierLedgerId === null) !== (p.newSupplier === null), { message: "Pick the supplier, or add one.", path: ["supplierLedgerId"] })
  .refine((p) => p.newSupplier === null || p.billFromAddressId === null, { message: "A new supplier's bill is from the address typed.", path: ["billFromAddressId"] })
  .refine((p) => new Set(p.lines.filter((l) => l.productId).map((l) => l.productId)).size === p.lines.filter((l) => l.productId).length, {
    message: "Each pack size once.",
    path: ["lines"],
  })
  // every new pack size is bought here, once, and each line's new pack is one that was added
  .superRefine((p, ctx) => {
    const added = p.newProducts.flatMap((np, i) => np.packs.map((_, j) => `${i}:${j}`));
    const bought = p.lines.filter((l) => l.newPack).map((l) => `${l.newPack!.product}:${l.newPack!.pack}`);
    if (bought.some((b) => !added.includes(b))) ctx.addIssue({ code: "custom", message: "A new product is missing.", path: ["lines"] });
    if (new Set(bought).size !== bought.length) ctx.addIssue({ code: "custom", message: "Each pack size once.", path: ["lines"] });
    if (added.some((a) => !bought.includes(a))) ctx.addIssue({ code: "custom", message: "Buy every new pack size, or take it out.", path: ["newProducts"] });
  })
  .refine((p) => new Set(p.bankParts.map((b) => b.bankDetailsId)).size === p.bankParts.length, { message: "An account is in twice.", path: ["bankParts"] })
  .refine((p) => p.kind === "cash" || (p.cashAmount === 0 && p.bankParts.length === 0 && !p.advanceSetOff), {
    message: "A credit purchase pays no money now.",
    path: ["cashAmount"],
  })
  .refine((p) => p.kind === "credit" || p.creditPeriodDays === null, { message: "Only a credit purchase has a credit period.", path: ["creditPeriodDays"] });

export type CreatePurchaseInputModel = z.input<typeof createPurchaseInputModel>;

export const purchaseIdInputModel = z.object({ transactionId: idModel });

export type PurchaseIdInputModel = z.infer<typeof purchaseIdInputModel>;

// the bill's photo or PDF attached (or changed) after the purchase was saved
export const attachBillInputModel = z.object({ transactionId: idModel, invoiceUrl: imageUrlModel });

export type AttachBillInputModel = z.infer<typeof attachBillInputModel>;

// a purchase saved: its number and what it came to
export const savedPurchaseModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  total: z.number(),
});

export type SavedPurchaseModel = z.infer<typeof savedPurchaseModel>;

// an address as the purchase kept it
const purchaseAddressModel = z.object({
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  district: z.string(),
  state: z.string(),
  stateCode: z.string(),
  postalCode: z.string(),
});

// a purchase as it was recorded: its number, the supplier and their bill, each item (a pack size once, whichever
// godowns it went into), the charges, the GST by tax, the cash discount, the round off, what it came to, and how much
// of it was paid then
export const purchaseModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  status: z.enum(["active", "cancelled"]),
  kind: z.enum(["cash", "credit"]),
  // the bill's day
  invoiceDate: z.string(),
  supplierInvoiceNumber: z.string(),
  invoiceUrl: z.string().nullable(),
  supplier: z.object({ partyId: idModel.nullable(), name: z.string(), shortName: z.string().nullable(), phone: z.string().nullable(), gstin: z.string().nullable() }),
  billFrom: purchaseAddressModel,
  // where it's supplied from: within our state (CGST + SGST) or outside it (IGST)
  supplyType: z.enum(["intra", "inter"]),
  // the purchase order it arrived on, if any
  purchaseOrderId: idModel.nullable(),
  vehicleNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  lines: z.array(
    z.object({
      productId: idModel,
      name: z.string(),
      quantity: z.number().int(),
      // a pack's rate before GST, the discount off the line, its value before GST, its GST % and GST
      rate: z.number(),
      discount: z.number(),
      taxable: z.number(),
      gstRate: z.number(),
      gst: z.number(),
      godowns: z.array(z.object({ godownName: z.string(), quantity: z.number().int() })),
    }),
  ),
  // each charge on the bill, as typed (GST in it)
  charges: z.array(z.object({ key: z.enum(["freight", "packing", "loading", "other"]), amount: z.number() })),
  taxable: z.number(),
  cgst: z.number(),
  sgst: z.number(),
  igst: z.number(),
  discount: z.number(),
  // what the bill's total is above (or, negative, below) what the figures come to
  roundOff: z.number(),
  total: z.number(),
  // what was paid with it, from cash and from bank accounts
  paid: z.number(),
  createdByName: z.string(),
});

export type PurchaseModel = z.infer<typeof purchaseModel>;
