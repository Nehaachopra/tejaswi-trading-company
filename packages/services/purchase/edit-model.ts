import { z } from "zod";

import { moreBankPartModel } from "../payment/model";
import { imageUrlModel } from "../product/model";
import { partyUpiIdModel } from "../party/model";
import { appOfUpi } from "../bank/upi-handles";

const idModel = z.string().uuid();
const rupeesModel = z.number().min(0).max(9_999_999_999_999).multipleOf(0.01);

// a purchase edited (the admin's): each item's rate before GST (every item kept; quantities, godowns, discounts and
// charges as they are), the supplier's bill number and day (within its month), the vehicle and remarks. What the edit leaves (the new total less what was paid towards the bill) is settled by `kind`:
// cash pays some of it now (or takes back what was paid over, in full, when the bill went down), credit leaves it owed
// (or as an advance with the supplier)
export const editPurchaseInputModel = z
  .object({
    transactionId: idModel,
    saveKey: z.string().uuid().nullable().default(null),
    // the supplier's bill date
    dateTime: z.coerce.date(),
    supplierInvoiceNumber: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Give the bill number.")
      .max(16)
      .regex(/^[A-Z0-9/-]+$/, "A bill number has only letters, digits, / and -."),
    lines: z
      .array(
        z
          .object({ productId: idModel, rateBeforeGst: rupeesModel.max(9_999_999.99) })
          .refine((l) => l.rateBeforeGst > 0, { message: "Give the rate.", path: ["rateBeforeGst"] }),
      )
      .min(1)
      .max(100),
    kind: z.enum(["cash", "credit"]),
    // cash: what's paid now (or taken back, when the bill went down), from cash and bank accounts
    cashAmount: rupeesModel.default(0),
    bankParts: z.array(moreBankPartModel).max(5).default([]),
    // cash, the bill up: an advance already with the supplier set off against it (as much as it takes)
    advanceSetOff: z.boolean().default(false),
    // a part paid by UPI to a supplier with no UPI ID saved: the one typed for it, kept on them for next time
    supplierUpiId: partyUpiIdModel
      .refine((u) => appOfUpi(u) !== null, "That isn't a UPI handle (the part after @).")
      .nullable()
      .default(null),
    // credit: days until it's due (none: no set period)
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
    // the supplier's bill's photo or PDF (none: taken off, or never attached)
    invoiceUrl: imageUrlModel.nullable().default(null),
  })
  .refine((p) => new Set(p.lines.map((l) => l.productId)).size === p.lines.length, { message: "Each pack size once.", path: ["lines"] })
  .refine((p) => new Set(p.bankParts.map((b) => b.bankDetailsId)).size === p.bankParts.length, { message: "An account is in twice.", path: ["bankParts"] })
  .refine((p) => p.kind === "cash" || (p.cashAmount === 0 && p.bankParts.length === 0), { message: "Credit pays no money now.", path: ["cashAmount"] })
  .refine((p) => p.kind === "credit" || p.creditPeriodDays === null, { message: "Only credit has a credit period.", path: ["creditPeriodDays"] });

export type EditPurchaseInputModel = z.input<typeof editPurchaseInputModel>;

// a purchase as the edit form opens it: what it was saved with, what was paid towards it, and why it can't be edited,
// if it can't
export const purchaseForEditModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  supplierInvoiceNumber: z.string(),
  kind: z.enum(["cash", "credit"]),
  creditPeriodDays: z.number().int().nullable(),
  supplier: z.object({ ledgerId: idModel, partyId: idModel, name: z.string(), upiIds: z.array(z.string()) }),
  supplyType: z.enum(["intra", "inter"]),
  // each item once: how many (fixed), a pack's rate before GST, the discount off the line, its GST %
  lines: z.array(z.object({ productId: idModel, name: z.string(), quantity: z.number().int(), rateBeforeGst: z.number(), discount: z.number(), gstRate: z.number() })),
  freightCharges: z.number(),
  packingCharges: z.number(),
  loadingCharges: z.number(),
  otherCharges: z.number(),
  discount: z.number(),
  vehicleNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  invoiceUrl: z.string().nullable(),
  total: z.number(),
  // paid towards this bill so far (with it, an advance set off, and later payments)
  paid: z.number(),
  // the supplier's account now: what we owe them (plus) or hold with them as an advance (minus)
  supplierBalance: z.number(),
  // returns still in place: the items that can't change and why (refunded, or a replacement still pending), and the
  // first return's day (the date can't move past it; none: null)
  lockedLines: z.array(z.object({ productId: idModel, why: z.enum(["refunded", "pending"]) })),
  firstReturnDate: z.string().nullable(),
  editBlockedBy: z.enum(["cancelled", "gstFiled", "replacement", "returned"]).nullable(),
});

export type PurchaseForEditModel = z.infer<typeof purchaseForEditModel>;
