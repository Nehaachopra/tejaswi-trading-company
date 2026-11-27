import { z } from "zod";

import { createPartyInputModel } from "../party/model";
import { moreBankPartModel } from "../payment/model";
import { createSaleInputModel } from "../sale/model";
import { companyModel } from "../setting/model";

const idModel = z.string().uuid();

// rupees with at most 2 decimals, within the money columns
const rupeesModel = z.number().min(0).max(9_999_999_999_999).multipleOf(0.01);

// why goods came back
export const RETURN_REASONS = ["damaged", "shortage", "wrong_item", "other"] as const;
export const returnReasonModel = z.enum(RETURN_REASONS);

// one godown's part of an item coming back: how many packs go into it
const returnGodownPartModel = z.object({ godownId: idModel, quantity: z.number().int().min(1).max(99_999) });

// godowns' parts adding up to a quantity, each godown once
const partsFit = (parts: { godownId: string; quantity: number }[], quantity: number) =>
  parts.reduce((a, g) => a + g.quantity, 0) === quantity && new Set(parts.map((g) => g.godownId)).size === parts.length;

// one item coming back: a pack size the sale had, how many, and the godowns they go back into (adding up to it).
// Replaced now: as many of the same pack size go out to the buyer again, from the godowns given (a new sale at the price
// it first sold at). Replaced later (a saved customer's): its value waits on their account until the packs are sent.
// Otherwise refunded
export const returnLineInputModel = z
  .object({
    productId: idModel,
    quantity: z.number().int().min(1).max(99_999),
    godowns: z.array(returnGodownPartModel).min(1, "Pick a godown.").max(20),
    replaceFrom: z.array(returnGodownPartModel).min(1, "Pick a godown.").max(20).nullable().default(null),
    replaceLater: z.boolean().default(false),
  })
  .refine((l) => !(l.replaceLater && l.replaceFrom !== null), { message: "Replaced now or later, not both.", path: ["replaceLater"] })
  .refine((l) => l.godowns.reduce((a, g) => a + g.quantity, 0) === l.quantity, { message: "The godowns must add up to the quantity.", path: ["godowns"] })
  .refine((l) => new Set(l.godowns.map((g) => g.godownId)).size === l.godowns.length, { message: "Each godown once.", path: ["godowns"] })
  .refine((l) => l.replaceFrom === null || partsFit(l.replaceFrom, l.quantity), { message: "The godowns must add up to the quantity.", path: ["replaceFrom"] });

export type ReturnLineInputModel = z.infer<typeof returnLineInputModel>;

// what a return asks, whichever way it settles: the sale, the day, the items, why, remarks
const returnBaseModel = z.object({
  // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
  saveKey: z.string().uuid().nullable().default(null),
  saleTransactionId: idModel,
  dateTime: z.coerce.date(),
  lines: z.array(returnLineInputModel).min(1, "Add an item.").max(100),
  reasonKind: returnReasonModel,
  // typed only for Other
  reason: z.string().trim().max(500).nullable().default(null),
  remarks: z.string().trim().max(100).nullable().default(null),
});

const reasonGiven = (r: { reasonKind: string; reason: string | null }) => (r.reasonKind === "other") === !!r.reason;
const reasonIssue = { message: "Say why, for Other only.", path: ["reason"] };

// a refund, in cash or on credit: cash pays the whole total back now from cash and bank accounts; credit keeps it on
// the customer's account, off what they owe and the rest an advance (a walk-in's goes to a customer picked or added now)
export const createSaleReturnInputModel = returnBaseModel
  .extend({
    refundIn: z.enum(["cash", "credit"]).default("cash"),
    // a walk-in's refund on credit: the customer it goes to, picked or added now
    customerLedgerId: idModel.nullable().default(null),
    newCustomer: createPartyInputModel.nullable().default(null),
    cashAmount: rupeesModel.default(0),
    bankParts: z.array(moreBankPartModel).max(5).default([]),
  })
  .refine((r) => new Set(r.lines.map((l) => l.productId)).size === r.lines.length, { message: "Each pack size once.", path: ["lines"] })
  .refine((r) => new Set(r.bankParts.map((b) => b.bankDetailsId)).size === r.bankParts.length, { message: "An account is in twice.", path: ["bankParts"] })
  .refine(reasonGiven, reasonIssue)
  .refine((r) => r.customerLedgerId === null || r.newCustomer === null, { message: "Pick the customer, or add one.", path: ["customerLedgerId"] });

export type CreateSaleReturnInputModel = z.infer<typeof createSaleReturnInputModel>;

// an exchange: the return and a new sale to the same buyer, saved together. The return's total counts as received on
// the sale; a walk-in gets back what's over the new sale (cash and bank parts here), a customer keeps it as an advance
export const exchangeInputModel = z.object({
  saveKey: z.string().uuid().nullable().default(null),
  saleReturn: returnBaseModel
    .omit({ saveKey: true })
    .extend({ cashAmount: rupeesModel.default(0), bankParts: z.array(moreBankPartModel).max(5).default([]) })
    .refine((r) => new Set(r.lines.map((l) => l.productId)).size === r.lines.length, { message: "Each pack size once.", path: ["lines"] })
    .refine(reasonGiven, reasonIssue),
  sale: createSaleInputModel,
});

export type ExchangeInputModel = z.infer<typeof exchangeInputModel>;

export const saleReturnIdInputModel = z.object({ transactionId: idModel });

export type SaleReturnIdInputModel = z.infer<typeof saleReturnIdInputModel>;

// a sale as the return form opens it: who bought it, how GST went, and each item once with what was sold, what's come
// back before and what can still come back, at the price it sold at (GST in it), and where it left from
export const saleForReturnModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  kind: z.enum(["cash", "credit"]),
  // the customer and what they owe (or hold as advance) now; a walk-in: none, with the name and phone kept on the sale
  customer: z.object({ ledgerId: idModel, partyId: idModel, name: z.string(), owed: z.number(), held: z.number() }).nullable(),
  buyer: z.object({ name: z.string(), phone: z.string().nullable() }).nullable(),
  supplyType: z.enum(["intra", "inter"]),
  total: z.number(),
  // the bill as it stands (after earlier returns) and what has been paid towards it; the charges (GST in them) and
  // the cash discount as the sale had them, which a return never changes
  billNow: z.number(),
  paid: z.number(),
  transportCharges: z.number(),
  packingCharges: z.number(),
  loadingCharges: z.number(),
  discount: z.number(),
  lines: z.array(
    z.object({
      productId: idModel,
      name: z.string(),
      sold: z.number().int(),
      returned: z.number().int(),
      canReturn: z.number().int(),
      // a pack's price with GST and before it, and its GST %
      price: z.number(),
      rate: z.number(),
      gstRate: z.number(),
      godowns: z.array(z.object({ godownId: idModel, name: z.string(), quantity: z.number().int() })),
    }),
  ),
  // the last day a credit note can be issued for it (30 November after its financial year)
  lastDay: z.string(),
  returnBlockedBy: z.enum(["cancelled", "allReturned", "tooLate"]).nullable(),
});

export type SaleForReturnModel = z.infer<typeof saleForReturnModel>;

// a saved return: its number and what it came to (an exchange: and the new sale's)
export const savedSaleReturnModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  total: z.number(),
  sale: z.object({ transactionId: idModel, assignedId: z.string(), total: z.number() }).nullable(),
});

export type SavedSaleReturnModel = z.infer<typeof savedSaleReturnModel>;

// a return as its credit note: our details, its number and day, the sale it's against, who it's to, each item back, the
// GST by tax, the cash discount taken back and what it came to; how it was settled
export const creditNoteModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  noteDate: z.string(),
  status: z.enum(["active", "cancelled"]),
  company: companyModel,
  sale: z.object({ transactionId: idModel, assignedId: z.string(), invoiceDate: z.string() }),
  buyer: z.object({ name: z.string(), phone: z.string().nullable(), gstin: z.string().nullable() }),
  supplyType: z.enum(["intra", "inter"]),
  reasonKind: returnReasonModel,
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
  // off what the customer owed (or left as advance), paid back now, or counted on the exchange's sale
  settled: z.object({ onAccount: z.number(), refunded: z.number(), exchanged: z.number() }),
  exchangeSale: z.object({ transactionId: idModel, assignedId: z.string() }).nullable(),
  createdByName: z.string(),
});

export type CreditNoteModel = z.infer<typeof creditNoteModel>;

// a return's replaced items still to be sent: who they go to and each pack size owed, at the rate it first sold at
export const pendingSaleReplacementModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  returnDate: z.string(),
  sale: z.object({ transactionId: idModel, assignedId: z.string() }),
  customerName: z.string(),
  // the customer's party (a replacement later is a saved customer's)
  partyId: idModel.nullable(),
  lines: z.array(z.object({ productId: idModel, name: z.string(), quantity: z.number().int(), rate: z.number(), gstRate: z.number() })),
});

export type PendingSaleReplacementModel = z.infer<typeof pendingSaleReplacementModel>;

// replaced packs going out later: the return, the day, the vehicle, remarks, and each pack size with the godowns it
// leaves from (adding up to how many go)
export const sendReplacementInputModel = z.object({
  saveKey: z.string().uuid().nullable().default(null),
  returnTransactionId: idModel,
  dateTime: z.coerce.date(),
  vehicleNumber: z
    .string()
    .trim()
    .toUpperCase()
    .max(15)
    .regex(/^[A-Z0-9]*$/, "A vehicle number has only letters and digits.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  remarks: z.string().trim().max(100).nullable().default(null),
  lines: z
    .array(
      z
        .object({ productId: idModel, quantity: z.number().int().min(1).max(99_999), from: z.array(returnGodownPartModel).min(1, "Pick a godown.").max(20) })
        .refine((l) => partsFit(l.from, l.quantity), { message: "The godowns must add up to the quantity.", path: ["from"] }),
    )
    .min(1, "Add an item.")
    .max(100)
    .refine((ls) => new Set(ls.map((l) => l.productId)).size === ls.length, { message: "Each pack size once." }),
});

export type SendReplacementInputModel = z.infer<typeof sendReplacementInputModel>;
