import { z } from "zod";

import { amountModel, ledgerNameModel, ledgerSummaryModel, PARTY_RECEIPT_KINDS, type ReceiptKind, receiptKindModel } from "../accounts/model";
import { loanTermsInputModel } from "../loan/model";
import { createPartyInputModel } from "../party/model";
import { remarksModel } from "../transaction/model";

const idModel = z.string().uuid();

// a TDS rate: up to 100, two decimals
const rateModel = z.number().positive().max(100).multipleOf(0.01);

// where a plain ledger made from a receipt goes: a refund to an asset, other income to income. A payment or a loan
// comes from a party (newParty when they're not in the app yet), and Capital is built in, so those never make one
export const NEW_LEDGER_FOR: Partial<Record<ReceiptKind, { head: "asset" | "income" }>> = {
  refund: { head: "asset" },
  otherIncome: { head: "income" },
};

// the kinds as the database keeps them
export const RECEIVED_FOR_DB = {
  customer: "customer",
  loanTaken: "loan_received",
  loanReturned: "loan_repaid",
  capital: "capital",
  refund: "refund",
  otherIncome: "other_income",
} as const satisfies Record<ReceiptKind, string>;

// money received: what it was for, from a ledger of that kind (or a new one made in the same save, its place set by
// the kind), into cash or one bank account, on any date. A customer that deducted TDS gives its rate; lengths
// follow receipts: reference 30, remarks 100
export const createReceiptInputModel = z
  .object({
    dateTime: z.coerce.date(),
    receivedFor: receiptKindModel,
    receivedFromLedgerId: idModel.nullable().default(null),
    newLedger: z.object({ name: ledgerNameModel }).nullable().default(null),
    // someone not in the app yet (an old customer paying, someone lending or repaying), made as a party in the same
    // save with the type picked for them. Every loan received also gives its terms
    newParty: createPartyInputModel.nullable().default(null),
    loan: loanTermsInputModel.nullable().default(null),
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
  .refine((r) => [r.receivedFromLedgerId, r.newLedger, r.newParty].filter((v) => v !== null).length === 1, {
    message: "Pick who it came from, or add a new one.",
    path: ["receivedFromLedgerId"],
  })
  .refine((r) => r.newParty === null || r.newParty.addresses.length > 0, {
    message: "A new party needs an address.",
    path: ["newParty"],
  })
  .refine((r) => r.newParty === null || PARTY_RECEIPT_KINDS.includes(r.receivedFor), {
    message: "Only a payment or a loan comes from a new party.",
    path: ["newParty"],
  })
  .refine((r) => (r.receivedFor === "loanTaken") === (r.loan !== null), { message: "A loan received needs its terms.", path: ["loan"] })
  .refine((r) => r.newLedger === null || !!NEW_LEDGER_FOR[r.receivedFor], { message: "That comes from a party, not a new ledger.", path: ["newLedger"] })
  .refine((r) => r.settledIn === "cash" || r.bankDetailsId !== null, { message: "Pick the bank account.", path: ["bankDetailsId"] });

export type CreateReceiptInputModel = z.infer<typeof createReceiptInputModel>;

// the TDS a party deducted, worked out on what it owed: received is what's left after the TDS, so
// owed = received ÷ (1 − rate), and the TDS is the difference
export const tdsOn = (received: number, rate: number) => Math.round((received / (1 - rate / 100) - received) * 100) / 100;

// a receipt's own details, for /history/[id] and its voucher (no balances: staff open vouchers too)
export const receiptModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  remarks: z.string().nullable(),
  status: z.enum(["active", "cancelled"]),
  // what it was for
  receivedFor: receiptKindModel,
  createdByName: z.string(),
  // the bank account it went into: its bank, the last 4 digits and IFSC, as they were when received
  bank: z.object({ name: z.string(), last4: z.string(), ifsc: z.string().nullable() }).nullable(),
  receivedFromLedgerId: idModel,
  // as it was named when received (a party's short name or full name, or the ledger's name)
  receivedFromName: z.string(),
  partyPhone: z.string().nullable(),
  // the party it came from, for the voucher's Received from block: full name, short name and its default address, as
  // they were when received
  party: z
    .object({
      name: z.string(),
      shortName: z.string().nullable(),
      address: z
        .object({
          line1: z.string(),
          line2: z.string().nullable(),
          city: z.string(),
          postalCode: z.string(),
          state: z.string(),
          stateCode: z.string(),
          gstin: z.string().nullable(),
        })
        .nullable(),
    })
    .nullable(),
  // a loan received: its interest
  loan: z.object({ interestRate: z.number(), frequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly"]) }).nullable(),
  // our own details the voucher is headed with, as they were when it was saved
  company: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string(),
    email: z.string(),
    state: z.string(),
    stateCode: z.string(),
    gstin: z.string(),
    fssai: z.string(),
    jurisdiction: z.string(),
  }),
  settledIn: z.enum(["cash", "bank"]),
  bankDetailsId: idModel.nullable(),
  referenceNumber: z.string().nullable(),
  amount: z.number(),
  tdsRate: z.number().nullable(),
  tdsAmount: z.number().nullable(),
});

export type ReceiptModel = z.infer<typeof receiptModel>;

export const receiptIdInputModel = z.object({ transactionId: idModel });

// a voucher opened from a link shared with the customer: the receipt and the key in its link
export const sharedReceiptInputModel = z.object({ transactionId: idModel, key: z.string().min(1).max(64) });

export type SharedReceiptInputModel = z.infer<typeof sharedReceiptInputModel>;

export const receiptShareKeyModel = z.object({ key: z.string() });

export type ReceiptIdInputModel = z.infer<typeof receiptIdInputModel>;

// what a saved receipt gives back: the receipt, and the ledgers it moved with their balances now (the admin's only;
// staff never see balances)
export const savedReceiptModel = receiptModel.extend({ balances: z.array(ledgerSummaryModel).nullable() });

export type SavedReceiptModel = z.infer<typeof savedReceiptModel>;
