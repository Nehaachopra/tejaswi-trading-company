import { z } from "zod";

import { createPartyInputModel, stateCodeModel } from "../party/model";
import { moreBankPartModel } from "../payment/model";
import { saleAddressInputModel, saleLineInputModel, shipToInputModel } from "./model";

const idModel = z.string().uuid();
const rupeesModel = z.number().min(0).max(9_999_999_999_999).multipleOf(0.01);

// a sale edited (the admin's): its items (each one kept, quantities only up, prices free), charges and cash discount,
// the day (within its month), where it goes, vehicle and remarks. The customer stays; a walk-in may become a customer
// only when what's left is put on credit. What the edit leaves (the new total less what was paid towards the bill)
// is settled by `kind`: cash takes it now (or refunds it at once when the bill went down), credit leaves it owed (or as
// their advance)
export const editSaleInputModel = z
  .object({
    transactionId: idModel,
    saveKey: z.string().uuid().nullable().default(null),
    dateTime: z.coerce.date(),
    lines: z.array(saleLineInputModel).min(1, "Add an item.").max(100),
    discount: rupeesModel.default(0),
    transportCharges: rupeesModel.default(0),
    packingCharges: rupeesModel.default(0),
    loadingCharges: rupeesModel.default(0),
    kind: z.enum(["cash", "credit"]),
    // cash: what's received now (or refunded, when the bill went down), in cash and bank accounts
    cashAmount: rupeesModel.default(0),
    bankParts: z.array(moreBankPartModel).max(5).default([]),
    // a walk-in put on credit: the customer, picked or added now
    customerLedgerId: idModel.nullable().default(null),
    newCustomer: createPartyInputModel.nullable().default(null),
    // a walk-in's name and phone, as on a new sale
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
    billToAddressId: idModel.nullable().default(null),
    billToAddress: saleAddressInputModel.nullable().default(null),
    shipTo: shipToInputModel.nullable().default(null),
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
  })
  .refine((s) => new Set(s.lines.map((l) => l.productId)).size === s.lines.length, { message: "Each pack size once.", path: ["lines"] })
  .refine((s) => new Set(s.bankParts.map((b) => b.bankDetailsId)).size === s.bankParts.length, { message: "An account is in twice.", path: ["bankParts"] })
  .refine((s) => s.kind === "cash" || (s.cashAmount === 0 && s.bankParts.length === 0), { message: "Credit takes no money now.", path: ["cashAmount"] })
  .refine((s) => s.customerLedgerId === null || s.newCustomer === null, { message: "Pick the customer, or add one.", path: ["customerLedgerId"] });

export type EditSaleInputModel = z.infer<typeof editSaleInputModel>;

// an address as the edit form starts from it: one of the customer's saved ones, or typed (plain fields: an output
// can't carry the input's trims and transforms)
const typedPlaceModel = z.object({
  addressLine1: z.string(),
  landmark: z.string(),
  city: z.string(),
  district: z.string(),
  state: z.string(),
  stateCode: stateCodeModel,
  postalCode: z.string(),
  gstin: z.string().nullable(),
});
const placeModel = z.union([z.object({ addressId: idModel }), z.object({ address: typedPlaceModel })]);

// a sale as the edit form opens it: what it was saved with, what was paid towards it (and how it came in), and why it
// can't be edited, if it can't
export const saleForEditModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  kind: z.enum(["cash", "credit"]),
  // the customer (a walk-in: none, with the name and phone typed)
  customer: z.object({ ledgerId: idModel, partyId: idModel, name: z.string() }).nullable(),
  buyer: z.object({ name: z.string(), phone: z.string() }).nullable(),
  saleOrderId: idModel.nullable(),
  lines: z.array(
    z.object({
      productId: idModel,
      quantity: z.number().int(),
      rateBeforeGst: z.number(),
      godowns: z.array(z.object({ godownId: idModel, quantity: z.number().int() })),
    }),
  ),
  discount: z.number(),
  transportCharges: z.number(),
  packingCharges: z.number(),
  loadingCharges: z.number(),
  billTo: placeModel.nullable(),
  shipTo: placeModel,
  vehicleNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  total: z.number(),
  // paid towards this bill so far: a customer's settled on it, a walk-in's received
  paid: z.number(),
  // how the money came in when it was saved and since (each edit's), for Amount paid ›
  received: z.object({
    cash: z.number(),
    tds: z.number(),
    banks: z.array(z.object({ bankName: z.string(), last4: z.string(), mode: z.string(), amount: z.number() })),
    // a customer's: an advance set off against the bill when it was saved, and each later receipt's part of it
    setOff: z.number(),
    receipts: z.array(z.object({ assignedId: z.string(), amount: z.number() })),
  }),
  editBlockedBy: z.enum(["cancelled", "gstFiled"]).nullable(),
});

export type SaleForEditModel = z.infer<typeof saleForEditModel>;
