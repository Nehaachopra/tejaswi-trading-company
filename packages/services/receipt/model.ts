import { z } from "zod";

import { amountModel, createLedgerInputModel } from "../accounts/model";
import { remarksModel } from "../transaction/model";

const idModel = z.string().uuid();

// a TDS rate: up to 100, two decimals
const rateModel = z.number().positive().max(100).multipleOf(0.01);

// money received: from a ledger (or a new one made in the same save), into cash or one bank account, on any date.
// A party that deducted TDS gives its rate; lengths follow receipts: reference 30, remarks 100
export const createReceiptInputModel = z
  .object({
    dateTime: z.coerce.date(),
    receivedFromLedgerId: idModel.nullable().default(null),
    newLedger: createLedgerInputModel.nullable().default(null),
    amount: amountModel,
    settledIn: z.enum(["cash", "bank"]),
    bankDetailsId: idModel.nullable().default(null),
    referenceNumber: z
      .string()
      .trim()
      .max(30)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    tdsRate: rateModel.nullable().default(null),
    remarks: remarksModel,
  })
  .refine((r) => (r.receivedFromLedgerId === null) !== (r.newLedger === null), { message: "Pick who it came from, or add a new ledger.", path: ["receivedFromLedgerId"] })
  .refine((r) => r.settledIn === "cash" || r.bankDetailsId !== null, { message: "Pick the bank account.", path: ["bankDetailsId"] });

export type CreateReceiptInputModel = z.infer<typeof createReceiptInputModel>;

// the TDS a party deducted, worked out on what it owed: received is what's left after the TDS, so
// owed = received ÷ (1 − rate), and the TDS is the difference
export const tdsOn = (received: number, rate: number) => Math.round((received / (1 - rate / 100) - received) * 100) / 100;

// a receipt's own details, for /history/[id]
export const receiptModel = z.object({
  transactionId: idModel,
  receivedFromLedgerId: idModel,
  receivedFromName: z.string(),
  partyPhone: z.string().nullable(),
  settledIn: z.enum(["cash", "bank"]),
  bankDetailsId: idModel.nullable(),
  referenceNumber: z.string().nullable(),
  amount: z.number(),
  tdsRate: z.number().nullable(),
  tdsAmount: z.number().nullable(),
});

export type ReceiptModel = z.infer<typeof receiptModel>;

export const receiptIdInputModel = z.object({ transactionId: idModel });

export type ReceiptIdInputModel = z.infer<typeof receiptIdInputModel>;

// what a saved receipt gives back: its number, and its details
export const savedReceiptModel = receiptModel.extend({ assignedId: z.string() });
