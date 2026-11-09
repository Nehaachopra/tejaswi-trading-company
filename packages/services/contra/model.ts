import { z } from "zod";

import { amountModel, ledgerSummaryModel } from "../accounts/model";
import { remarksModel } from "../transaction/model";

const idModel = z.string().uuid();

// a deposit slip's or the bank's reference: letters, digits, - and /, in capitals, up to 30 (contras.reference_number)
export const contraReferenceModel = z
  .string()
  .trim()
  .toUpperCase()
  .max(30)
  .regex(/^[A-Z0-9/-]*$/, "Letters, digits, - and / only.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

// a deposit: cash put into one of our active bank accounts, dated today or before (one forgotten can be put in the
// next day), never more than the cash held; the slip's reference and remarks if any
export const createDepositInputModel = z.object({
  // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
  saveKey: z.string().uuid().nullable().default(null),
  dateTime: z.coerce.date(),
  bankDetailsId: idModel,
  amount: amountModel,
  referenceNumber: contraReferenceModel,
  remarks: remarksModel,
});

export type CreateDepositInputModel = z.infer<typeof createDepositInputModel>;

export const depositIdInputModel = z.object({ transactionId: idModel });

export type DepositIdInputModel = z.infer<typeof depositIdInputModel>;

// a deposit's own details, for its page after a save and /history/[id] (no balances: staff open it too)
export const depositModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  status: z.enum(["active", "cancelled"]),
  amount: z.number(),
  // the account it went into: its bank, the last 4 digits and IFSC
  bank: z.object({ id: idModel, name: z.string(), last4: z.string(), ifsc: z.string().nullable() }),
  referenceNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  createdByName: z.string(),
});

export type DepositModel = z.infer<typeof depositModel>;

// what a saved deposit gives back: the deposit, and cash and the account with their balances now (the admin's only)
export const savedDepositModel = depositModel.extend({ balances: z.array(ledgerSummaryModel).nullable() });

export type SavedDepositModel = z.infer<typeof savedDepositModel>;
