import { z } from "zod";

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

// one item coming back: a pack size the sale had, how many, and the godowns they go back into (adding up to it)
export const returnLineInputModel = z
  .object({
    productId: idModel,
    quantity: z.number().int().min(1).max(99_999),
    godowns: z.array(returnGodownPartModel).min(1, "Pick a godown.").max(20),
  })
  .refine((l) => l.godowns.reduce((a, g) => a + g.quantity, 0) === l.quantity, { message: "The godowns must add up to the quantity.", path: ["godowns"] })
  .refine((l) => new Set(l.godowns.map((g) => g.godownId)).size === l.godowns.length, { message: "Each godown once.", path: ["godowns"] });

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

// a refund: the total comes off what the customer owes; what's over is paid back now from cash and bank accounts (a
// walk-in: all of it) or left as an advance
export const createSaleReturnInputModel = returnBaseModel
  .extend({
    cashAmount: rupeesModel.default(0),
    bankParts: z.array(moreBankPartModel).max(5).default([]),
  })
  .refine((r) => new Set(r.lines.map((l) => l.productId)).size === r.lines.length, { message: "Each pack size once.", path: ["lines"] })
  .refine((r) => new Set(r.bankParts.map((b) => b.bankDetailsId)).size === r.bankParts.length, { message: "An account is in twice.", path: ["bankParts"] })
  .refine(reasonGiven, reasonIssue);

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
  // the sale's cash discount, and what it was taken off (the items with GST and the charges), to share it out
  discount: z.number(),
  gross: z.number(),
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
