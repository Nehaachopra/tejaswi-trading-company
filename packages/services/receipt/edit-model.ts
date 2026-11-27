import { z } from "zod";

import { amountModel, receiptKindModel } from "../accounts/model";
import { BANK_MODE_REFERENCE, bankModeModel, moreBankPartModel, settledInModel } from "../payment/model";
import { remarksModel } from "../transaction/model";

const idModel = z.string().uuid();

// a UTR, IMPS reference, cheque number, or a cash bill or voucher number, up to 30 (as a new receipt's)
const referenceModel = z
  .string()
  .trim()
  .max(30)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

// a receipt edited (the admin's): how much came in, where it came into (cash, bank accounts or both, each with how and
// its reference), whether the party deducted TDS, the day (within its month) and the remarks. What it was received for
// and who it came from stay as saved
export const editReceiptInputModel = z
  .object({
    transactionId: idModel,
    // made when the form opened: a second save with it gets the first one's result
    saveKey: z.string().uuid().nullable().default(null),
    dateTime: z.coerce.date(),
    amount: amountModel,
    settledIn: settledInModel,
    // cash and bank together: the part that came in cash (the bank took the rest)
    cashAmount: amountModel.nullable().default(null),
    bankDetailsId: idModel.nullable().default(null),
    bankMode: bankModeModel.nullable().default(null),
    referenceNumber: referenceModel,
    cashReferenceNumber: referenceModel,
    moreBankParts: z.array(moreBankPartModel).max(4).default([]),
    // the party deducted TDS (the law's rate, never typed)
    tdsDeducted: z.boolean().default(false),
    remarks: remarksModel,
  })
  // where it came into, checked as a new receipt's
  .refine((r) => r.settledIn === "cash" || r.bankDetailsId !== null, { message: "Pick the bank account.", path: ["bankDetailsId"] })
  .refine((r) => (r.settledIn === "cash") === (r.bankMode === null), { message: "Pick how it came in.", path: ["bankMode"] })
  .refine((r) => r.bankMode === null || r.referenceNumber === null || BANK_MODE_REFERENCE[r.bankMode].test(r.referenceNumber), {
    message: "That reference doesn't fit how it came in.",
    path: ["referenceNumber"],
  })
  .refine((r) => r.settledIn !== "bank" || r.cashReferenceNumber === null, { message: "A bank receipt has no cash part.", path: ["cashReferenceNumber"] })
  .refine((r) => (r.settledIn === "cashAndBank") === (r.cashAmount !== null), { message: "Enter the cash part.", path: ["cashAmount"] })
  .refine((r) => r.cashAmount === null || Math.round(r.cashAmount * 100) < Math.round(r.amount * 100), { message: "The cash part must be less than the amount.", path: ["cashAmount"] })
  .refine((r) => r.settledIn !== "cash" || r.moreBankParts.length === 0, { message: "Cash uses no bank account.", path: ["moreBankParts"] })
  .refine((r) => new Set([r.bankDetailsId, ...r.moreBankParts.map((b) => b.bankDetailsId)]).size === r.moreBankParts.length + 1, {
    message: "An account is in twice.",
    path: ["moreBankParts"],
  })
  .refine(
    (r) =>
      r.settledIn === "cash" ||
      Math.round(r.amount * 100) - Math.round((r.cashAmount ?? 0) * 100) - r.moreBankParts.reduce((sum, b) => sum + Math.round(b.amount * 100), 0) > 0,
    { message: "The other accounts take more than the bank's part.", path: ["moreBankParts"] },
  );

export type EditReceiptInputModel = z.infer<typeof editReceiptInputModel>;

// a receipt as its edit form opens it: what it was saved with, what can't change (shown only), the limits the amount
// has, and why it can't be edited, if it can't
export const receiptForEditModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  // shown, never changed
  receivedFor: receiptKindModel,
  receivedFromName: z.string(),
  // a scrap sale: GST is taken out of the amount again
  scrap: z.boolean(),
  amount: z.number(),
  settledIn: settledInModel,
  cashAmount: z.number(),
  // where it came into, from its ledger entries: the first bank account and its part, then the others; how each came
  // in and its reference where kept (an older bank receipt kept none: asked again)
  bankDetailsId: idModel.nullable(),
  bankAmount: z.number(),
  bankMode: bankModeModel.nullable(),
  referenceNumber: z.string().nullable(),
  cashReferenceNumber: z.string().nullable(),
  moreBankParts: z.array(z.object({ bankDetailsId: idModel, amount: z.number(), mode: bankModeModel.nullable(), referenceNumber: z.string().nullable() })),
  // TDS: whether it can be deducted here (a party paying as a customer or interest), its rate, and whether it was
  tdsRate: z.number().nullable(),
  tdsDeducted: z.boolean(),
  // a bank or NBFC's loan comes into a bank account only
  bankOnly: z.boolean(),
  remarks: z.string().nullable(),
  // the amount's limits: a loan taken no lower than we've repaid of it, a loan given back no higher than is left of it
  minAmount: z.number().nullable(),
  maxAmount: z.number().nullable(),
  // what cash and each bank account would hold without this receipt: below zero, at least that much must still come
  // into it (the money is spent)
  heldWithout: z.object({ cash: z.number(), banks: z.array(z.object({ bankDetailsId: idModel, amount: z.number() })) }),
  editBlockedBy: z.enum(["cancelled", "gstFiled"]).nullable(),
});

export type ReceiptForEditModel = z.infer<typeof receiptForEditModel>;
