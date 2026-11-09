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

// the contras built so far: a deposit (cash into a bank account) and a withdrawal (cash out of one); a transfer follows
export const contraKindModel = z.enum(["deposit", "withdrawal"]);

export type ContraKind = z.infer<typeof contraKindModel>;

// a deposit or a withdrawal: one of our active bank accounts, dated today or before (one forgotten can be put in the
// next day), never more than what it comes out of holds (the cash for a deposit, the account for a withdrawal); its
// reference and remarks if any
export const createContraInputModel = z.object({
  // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
  saveKey: z.string().uuid().nullable().default(null),
  dateTime: z.coerce.date(),
  bankDetailsId: idModel,
  amount: amountModel,
  referenceNumber: contraReferenceModel,
  remarks: remarksModel,
});

export type CreateContraInputModel = z.infer<typeof createContraInputModel>;

export const contraIdInputModel = z.object({ transactionId: idModel });

export type ContraIdInputModel = z.infer<typeof contraIdInputModel>;

// a deposit's or withdrawal's own details, for its page after a save and /history/[id] (no balances: staff open it too)
export const contraModel = z.object({
  transactionId: idModel,
  kind: contraKindModel,
  assignedId: z.string(),
  dateTime: z.date(),
  status: z.enum(["active", "cancelled"]),
  amount: z.number(),
  // the account it went into (a deposit) or came out of (a withdrawal): its bank, the last 4 digits and IFSC
  bank: z.object({ id: idModel, name: z.string(), last4: z.string(), ifsc: z.string().nullable() }),
  referenceNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  createdByName: z.string(),
});

export type ContraModel = z.infer<typeof contraModel>;

// what a saved one gives back: it, and cash and the account with their balances now (the admin's only)
export const savedContraModel = contraModel.extend({ balances: z.array(ledgerSummaryModel).nullable() });

export type SavedContraModel = z.infer<typeof savedContraModel>;
