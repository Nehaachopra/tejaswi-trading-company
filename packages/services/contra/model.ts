import { z } from "zod";

import { amountModel, ledgerSummaryModel } from "../accounts/model";
import { remarksModel } from "../transaction/model";

const idModel = z.string().uuid();

// a slip's, cheque's or the bank's reference: letters, digits, - and /, in capitals, up to 30 (contras.reference_number)
export const contraReferenceModel = z
  .string()
  .trim()
  .toUpperCase()
  .max(30)
  .regex(/^[A-Z0-9/-]*$/, "Letters, digits, - and / only.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

// money between cash and our bank accounts: a deposit (cash into a bank account), a withdrawal (cash out of one), a
// transfer (from one account to another)
export const contraKindModel = z.enum(["deposit", "withdrawal", "transfer"]);

export type ContraKind = z.infer<typeof contraKindModel>;

// what every one carries: when (today or before; one forgotten can be put in the next day), how much, its reference
// and remarks if any
const contraFields = {
  // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
  saveKey: z.string().uuid().nullable().default(null),
  dateTime: z.coerce.date(),
  amount: amountModel,
  referenceNumber: contraReferenceModel,
  remarks: remarksModel,
};

// a deposit or a withdrawal: the one active bank account it goes into or comes out of; never more than what it comes out
// of holds (the cash for a deposit, the account for a withdrawal)
export const createContraInputModel = z.object({ ...contraFields, bankDetailsId: idModel });

export type CreateContraInputModel = z.infer<typeof createContraInputModel>;

// a transfer: from one active account to another, never more than the first holds
export const createTransferInputModel = z
  .object({ ...contraFields, fromBankDetailsId: idModel, toBankDetailsId: idModel })
  .refine((t) => t.fromBankDetailsId !== t.toBankDetailsId, { message: "Pick two different accounts.", path: ["toBankDetailsId"] });

export type CreateTransferInputModel = z.infer<typeof createTransferInputModel>;

export const contraIdInputModel = z.object({ transactionId: idModel });

export type ContraIdInputModel = z.infer<typeof contraIdInputModel>;

// a bank account on one side: its bank, the last 4 digits and IFSC
const sideModel = z.object({ id: idModel, name: z.string(), last4: z.string(), ifsc: z.string().nullable() });

// one's own details, for its page after a save and /history/[id] (no balances: staff open it too): the account it came
// out of and the one it went into, null for cash
export const contraModel = z.object({
  transactionId: idModel,
  kind: contraKindModel,
  assignedId: z.string(),
  dateTime: z.date(),
  status: z.enum(["active", "cancelled"]),
  amount: z.number(),
  from: sideModel.nullable(),
  to: sideModel.nullable(),
  referenceNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  createdByName: z.string(),
});

export type ContraModel = z.infer<typeof contraModel>;

// what a saved one gives back: it, and the cash and accounts it moved with their balances now (the admin's only)
export const savedContraModel = contraModel.extend({ balances: z.array(ledgerSummaryModel).nullable() });

export type SavedContraModel = z.infer<typeof savedContraModel>;
