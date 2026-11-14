import { z } from "zod";

import { stateCodeModel } from "../party/model";
import { createPartyInputModel } from "../party/model";
import { moreBankPartModel } from "../payment/model";
import { companyModel } from "../setting/model";

const idModel = z.string().uuid();

// rupees with at most 2 decimals, within the money columns
const rupeesModel = z.number().min(0).max(9_999_999_999_999).multipleOf(0.01);

// one godown's part of an item: how many packs leave it
export const saleGodownPartModel = z.object({ godownId: idModel, quantity: z.number().int().min(1).max(99_999) });

// one item sold: a pack size, its rate per pack before GST (the GST % comes from the product, never sent) and where its
// packs leave from: one or more godowns, their quantities adding up to the item's
export const saleLineInputModel = z
  .object({
    productId: idModel,
    quantity: z.number().int().min(1).max(99_999),
    rateBeforeGst: rupeesModel.max(9_999_999.99),
    godowns: z.array(saleGodownPartModel).min(1, "Pick a godown.").max(20),
  })
  .refine((l) => l.godowns.reduce((a, g) => a + g.quantity, 0) === l.quantity, { message: "The godowns must add up to the quantity.", path: ["godowns"] })
  .refine((l) => new Set(l.godowns.map((g) => g.godownId)).size === l.godowns.length, { message: "Each godown once.", path: ["godowns"] });

export type SaleLineInputModel = z.infer<typeof saleLineInputModel>;

// an address typed on the sale (where it goes, or a cash buyer's): the line and landmark optional; the town, district,
// state and PIN not
export const saleAddressInputModel = z.object({
  addressLine1: z.string().trim().max(200).default(""),
  landmark: z.string().trim().max(150).default(""),
  city: z.string().trim().min(1).max(100).regex(/^\D*$/, "A town has no numbers."),
  district: z.string().trim().min(1).max(100).regex(/^\D*$/, "A district has no numbers."),
  state: z.string().trim().min(1).max(100),
  stateCode: stateCodeModel,
  postalCode: z.string().trim().regex(/^\d{6}$/, "A PIN code is 6 digits."),
  // a cash buyer's GSTIN, when they give one
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^$|^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "A GSTIN is 15 letters and digits.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
});

export type SaleAddressInputModel = z.infer<typeof saleAddressInputModel>;

// where the goods go: one of the customer's saved addresses, or one typed here
export const shipToInputModel = z.union([z.object({ addressId: idModel }), z.object({ address: saleAddressInputModel })]);

// a cash sale's taxable value from which the buyer's name and phone are needed on the invoice (an unregistered buyer,
// GST rule 46): ₹50,000
export const NAMED_BUYER_FROM = 50_000;

// a sale: its items; the transport, packing and loading charges (GST included, taxed at the goods' rate) and a cash
// discount off what's to be received (GST stays on the full value); then cash (received now, in cash and/or bank accounts adding up to
// the total) or credit (the customer owes it all). A cash sale makes no customer: an optional name and phone, and where
// it goes (our place of business unless changed). A credit sale is to a customer (picked, or added now) with their
// bill-to address and where it goes; an optional credit period. Then the day, vehicle and remarks
export const createSaleInputModel = z
  .object({
    // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
    saveKey: z.string().uuid().nullable().default(null),
    dateTime: z.coerce.date(),
    lines: z.array(saleLineInputModel).min(1, "Add an item.").max(100),
    // a cash discount, taken off what's received; it doesn't lower the GST
    discount: rupeesModel.default(0),
    // charges on top, each typed with its GST in it
    transportCharges: rupeesModel.default(0),
    packingCharges: rupeesModel.default(0),
    loadingCharges: rupeesModel.default(0),
    kind: z.enum(["cash", "credit"]),
    // cash: the cash part, and each bank account's part with how it came in
    cashAmount: rupeesModel.default(0),
    bankParts: z.array(moreBankPartModel).max(5).default([]),
    // cash: who bought it, both optional
    buyer: z
      .object({
        name: z.string().trim().max(150).regex(/^\D*$/, "A name has no numbers.").default(""),
        phone: z
          .string()
          .trim()
          .regex(/^$|^[6-9]\d{9}$/, "A 10-digit mobile number.")
          .default(""),
      })
      .nullable()
      .default(null),
    // credit: the customer, by their ledger, or added now
    customerLedgerId: idModel.nullable().default(null),
    newCustomer: createPartyInputModel.nullable().default(null),
    billToAddressId: idModel.nullable().default(null),
    creditPeriodDays: z.number().int().min(0).max(365).nullable().default(null),
    // where it goes: a credit sale to the customer's default address unless picked or typed; a cash sale's typed
    shipTo: shipToInputModel.nullable().default(null),
    // a cash sale's billing address, typed (none: the invoice has only where it goes)
    billToAddress: saleAddressInputModel.nullable().default(null),
    vehicleNumber: z
      .string()
      .trim()
      .toUpperCase()
      .max(15)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    remarks: z.string().trim().max(1000).nullable().default(null),
  })
  .refine((s) => new Set(s.lines.map((l) => l.productId)).size === s.lines.length, { message: "Each pack size once.", path: ["lines"] })
  .refine((s) => new Set(s.bankParts.map((b) => b.bankDetailsId)).size === s.bankParts.length, { message: "An account is in twice.", path: ["bankParts"] })
  // a cash sale may be to a customer already saved, but adds none and has no credit period; a credit sale has a
  // customer and takes no money now
  .refine((s) => s.kind === "credit" || (s.newCustomer === null && s.creditPeriodDays === null), {
    message: "A cash sale adds no customer.",
    path: ["newCustomer"],
  })
  .refine((s) => s.kind === "credit" || s.customerLedgerId === null || (s.buyer === null && s.billToAddress === null), {
    message: "A customer picked needs no buyer details.",
    path: ["buyer"],
  })
  .refine((s) => s.kind === "cash" || (s.customerLedgerId === null) !== (s.newCustomer === null), { message: "Pick the customer, or add one.", path: ["customerLedgerId"] })
  .refine((s) => s.kind === "credit" || s.customerLedgerId !== null || s.shipTo !== null, { message: "Type where it goes.", path: ["shipTo"] })
  .refine((s) => s.kind === "cash" || s.billToAddress === null, { message: "A credit sale bills the customer's address.", path: ["billToAddress"] })
  .refine((s) => s.kind === "cash" || (s.cashAmount === 0 && s.bankParts.length === 0 && s.buyer === null), { message: "A credit sale takes no money now.", path: ["cashAmount"] });

export type CreateSaleInputModel = z.infer<typeof createSaleInputModel>;

export const saleIdInputModel = z.object({ transactionId: idModel });

export type SaleIdInputModel = z.infer<typeof saleIdInputModel>;

// a saved sale as its success page shows it: its number, how many items, what it came to and how it was paid
export const saleSummaryModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  items: z.number().int(),
  total: z.number(),
  kind: z.enum(["cash", "credit"]),
});

export type SaleSummaryModel = z.infer<typeof saleSummaryModel>;

// an address as an invoice prints it
const invoiceAddressModel = z.object({
  line1: z.string().nullable(),
  line2: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  state: z.string().nullable(),
  stateCode: z.string().nullable(),
  postalCode: z.string().nullable(),
});

// a sale as its tax invoice (ours, and the customer's from a shared link): our details on top, its number and day, who
// it's billed to and where it goes, each item (a pack size once, whichever godowns it left), the charges with the GST
// taken out of them, the GST by tax, the cash discount and what it comes to
export const saleInvoiceModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  invoiceDate: z.string(),
  status: z.enum(["active", "cancelled"]),
  kind: z.enum(["cash", "credit"]),
  company: companyModel,
  buyer: z.object({ name: z.string(), shortName: z.string().nullable(), phone: z.string().nullable(), gstin: z.string().nullable() }),
  billTo: invoiceAddressModel.nullable(),
  shipTo: invoiceAddressModel,
  // where it's supplied: within our state (CGST + SGST) or outside it (IGST)
  supplyType: z.enum(["intra", "inter"]),
  vehicleNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  lines: z.array(
    z.object({
      productId: idModel,
      category: z.string(),
      title: z.string(),
      packSize: z.number(),
      packSizeCode: z.enum(["KGS", "LTR", "BOX", "PCS"]),
      hsn: z.string().nullable(),
      quantity: z.number().int(),
      // a pack's price before GST, the discount off the line, its value before GST, its GST % and GST
      rate: z.number(),
      discount: z.number(),
      taxable: z.number(),
      gstRate: z.number(),
      gst: z.number(),
    }),
  ),
  // each charge given: what was typed (GST in it), split into its value and the GST in it
  charges: z.array(z.object({ key: z.enum(["transport", "packing", "loading"]), taxable: z.number(), gst: z.number() })),
  taxable: z.number(),
  cgst: z.number(),
  sgst: z.number(),
  igst: z.number(),
  discount: z.number(),
  total: z.number(),
  createdByName: z.string(),
});

export type SaleInvoiceModel = z.infer<typeof saleInvoiceModel>;

export const saleShareKeyModel = z.object({ key: z.string() });
export const sharedSaleInputModel = z.object({ transactionId: idModel, key: z.string().min(1).max(64) });

// a sale saved: its number and what it came to
export const savedSaleModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  total: z.number(),
});

export type SavedSaleModel = z.infer<typeof savedSaleModel>;
