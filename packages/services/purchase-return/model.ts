import { z } from "zod";

import { moreBankPartModel } from "../payment/model";
import { companyModel } from "../setting/model";

const idModel = z.string().uuid();

// rupees with at most 2 decimals, within the money columns
const rupeesModel = z.number().min(0).max(9_999_999_999_999).multipleOf(0.01);

// why goods went back (a sale return's reasons)
export const PURCHASE_RETURN_REASONS = ["damaged", "shortage", "wrong_item", "other"] as const;
export const purchaseReturnReasonModel = z.enum(PURCHASE_RETURN_REASONS);

// one godown's part of an item: how many packs leave it (or, for a replacement, come into it)
const godownPartModel = z.object({ godownId: idModel, quantity: z.number().int().min(1).max(99_999) });

// godowns' parts adding up to a quantity, each godown once
const partsFit = (parts: { godownId: string; quantity: number }[], quantity: number) =>
  parts.reduce((a, g) => a + g.quantity, 0) === quantity && new Set(parts.map((g) => g.godownId)).size === parts.length;

// one item going back: a pack size the purchase had, how many, and the godowns they leave from (adding up to it).
// Replaced: the supplier sends as many of the same pack size again, into the godowns given (a new purchase at the rate
// it was first bought at); otherwise refunded
export const purchaseReturnLineInputModel = z
  .object({
    productId: idModel,
    quantity: z.number().int().min(1).max(99_999),
    godowns: z.array(godownPartModel).min(1, "Pick a godown.").max(20),
    replaceInto: z.array(godownPartModel).min(1, "Pick a godown.").max(20).nullable().default(null),
  })
  .refine((l) => partsFit(l.godowns, l.quantity), { message: "The godowns must add up to the quantity.", path: ["godowns"] })
  .refine((l) => l.replaceInto === null || partsFit(l.replaceInto, l.quantity), { message: "The godowns must add up to the quantity.", path: ["replaceInto"] });

export type PurchaseReturnLineInputModel = z.infer<typeof purchaseReturnLineInputModel>;

// a purchase return saved: the purchase, the day, the items, why, remarks, the supplier's credit note when they gave one,
// then the refund: cash (the supplier pays it all back now, into cash and bank accounts) or credit (it comes off what
// we owe them, the rest an advance with them)
export const createPurchaseReturnInputModel = z
  .object({
    // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
    saveKey: z.string().uuid().nullable().default(null),
    purchaseTransactionId: idModel,
    dateTime: z.coerce.date(),
    lines: z.array(purchaseReturnLineInputModel).min(1, "Add an item.").max(100),
    reasonKind: purchaseReturnReasonModel,
    // typed only for Other
    reason: z.string().trim().max(500).nullable().default(null),
    remarks: z.string().trim().max(500).nullable().default(null),
    // the supplier's credit note, when they give one: its number (as a bill number) and day
    supplierCreditNoteNumber: z
      .string()
      .trim()
      .toUpperCase()
      .max(16)
      .regex(/^[A-Z0-9/-]*$/, "A credit note number has only letters, digits, / and -.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    supplierCreditNoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    refundIn: z.enum(["cash", "credit"]).default("credit"),
    cashAmount: rupeesModel.default(0),
    bankParts: z.array(moreBankPartModel).max(5).default([]),
  })
  .refine((r) => new Set(r.lines.map((l) => l.productId)).size === r.lines.length, { message: "Each pack size once.", path: ["lines"] })
  .refine((r) => new Set(r.bankParts.map((b) => b.bankDetailsId)).size === r.bankParts.length, { message: "An account is in twice.", path: ["bankParts"] })
  .refine((r) => (r.reasonKind === "other") === !!r.reason, { message: "Say why, for Other only.", path: ["reason"] });

export type CreatePurchaseReturnInputModel = z.infer<typeof createPurchaseReturnInputModel>;

export const purchaseReturnIdInputModel = z.object({ transactionId: idModel });

export type PurchaseReturnIdInputModel = z.infer<typeof purchaseReturnIdInputModel>;

// a purchase as the return form opens it: who it's from, how GST went, and each item once with what was bought, what's
// gone back before and what can still go back, at the rate it was bought at (GST in it), and where it went in
export const purchaseForReturnModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  kind: z.enum(["cash", "credit"]),
  // the supplier, what we owe them now and what they hold of ours as advance
  supplier: z.object({ ledgerId: idModel, partyId: idModel, name: z.string(), owed: z.number(), held: z.number() }),
  supplyType: z.enum(["intra", "inter"]),
  total: z.number(),
  // the bill as it stands (after earlier returns) and what has been paid towards it; the charges (GST in them) and
  // the cash discount as the purchase had them, which a return never changes
  billNow: z.number(),
  paid: z.number(),
  freightCharges: z.number(),
  packingCharges: z.number(),
  loadingCharges: z.number(),
  otherCharges: z.number(),
  discount: z.number(),
  lines: z.array(
    z.object({
      productId: idModel,
      name: z.string(),
      bought: z.number().int(),
      returned: z.number().int(),
      canReturn: z.number().int(),
      // a pack's rate with GST and before it, and its GST %
      price: z.number(),
      rate: z.number(),
      gstRate: z.number(),
      godowns: z.array(z.object({ godownId: idModel, name: z.string(), quantity: z.number().int() })),
    }),
  ),
  // the last day a debit note can be issued for it (30 November after its financial year)
  lastDay: z.string(),
  returnBlockedBy: z.enum(["cancelled", "allReturned", "tooLate"]).nullable(),
});

export type PurchaseForReturnModel = z.infer<typeof purchaseForReturnModel>;

// a saved return: its number and what it came to, and the replacement purchase when items were replaced
export const savedPurchaseReturnModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  total: z.number(),
  purchase: z.object({ transactionId: idModel, assignedId: z.string(), total: z.number() }).nullable(),
});

export type SavedPurchaseReturnModel = z.infer<typeof savedPurchaseReturnModel>;

// a return as our debit note: our details, its number and day, the purchase it's against, the supplier, each item
// back, the GST by tax, the cash discount given back and what it came to; the supplier's credit note when they gave one;
// how it was settled
export const debitNoteModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  noteDate: z.string(),
  status: z.enum(["active", "cancelled"]),
  company: companyModel,
  purchase: z.object({ transactionId: idModel, assignedId: z.string(), invoiceDate: z.string(), supplierInvoiceNumber: z.string() }),
  supplier: z.object({ name: z.string(), phone: z.string().nullable(), gstin: z.string().nullable() }),
  supplierCreditNote: z.object({ number: z.string().nullable(), date: z.string().nullable() }).nullable(),
  supplyType: z.enum(["intra", "inter"]),
  reasonKind: purchaseReturnReasonModel,
  reason: z.string().nullable(),
  remarks: z.string().nullable(),
  lines: z.array(
    z.object({
      productId: idModel,
      title: z.string(),
      hsn: z.string().nullable(),
      quantity: z.number().int(),
      rate: z.number(),
      discount: z.number(),
      taxable: z.number(),
      gstRate: z.number(),
      gst: z.number(),
    }),
  ),
  taxable: z.number(),
  cgst: z.number(),
  sgst: z.number(),
  igst: z.number(),
  discount: z.number(),
  roundOff: z.number(),
  total: z.number(),
  // off what we owed them (or left as advance with them), paid back to us now, or taken by the replacement purchase
  settled: z.object({ onAccount: z.number(), refunded: z.number(), replaced: z.number() }),
  replacementPurchase: z.object({ transactionId: idModel, assignedId: z.string() }).nullable(),
  createdByName: z.string(),
});

export type DebitNoteModel = z.infer<typeof debitNoteModel>;
