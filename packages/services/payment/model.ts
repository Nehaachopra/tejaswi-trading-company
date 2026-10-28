import { z } from "zod";

import { amountModel, ledgerNameModel, ledgerSummaryModel, PARTY_PAYMENT_KINDS, type PaymentKind, paymentKindModel } from "../accounts/model";
import { loanTermsInputModel } from "../loan/model";
import { createPartyInputModel } from "../party/model";
import { remarksModel } from "../transaction/model";

const idModel = z.string().uuid();

// a TDS rate: up to 100, two decimals
const rateModel = z.number().positive().max(100).multipleOf(0.01);

// the kinds as the database keeps them
export const PAID_FOR_DB = {
  supplier: "supplier",
  loanRepaid: "loan_repaid",
  loanGiven: "loan_given",
  expense: "expense",
  taxPaid: "tax_paid",
  refund: "refund",
} as const satisfies Record<PaymentKind, string>;

// money paid out: what it was for, to a ledger of that kind (or a new one made in the same save: a party, or an
// expense head), from cash or one bank account, on any date. TDS we deducted is for a supplier only; the interest
// part only for a loan repaid; a loan given gives its terms. Lengths follow payments: reference 30, remarks 100
export const createPaymentInputModel = z
  .object({
    dateTime: z.coerce.date(),
    paidFor: paymentKindModel,
    paidToLedgerId: idModel.nullable().default(null),
    newLedger: z.object({ name: ledgerNameModel }).nullable().default(null),
    newParty: createPartyInputModel.nullable().default(null),
    loan: loanTermsInputModel.nullable().default(null),
    amount: amountModel,
    interestAmount: z.number().min(0).multipleOf(0.01).nullable().default(null),
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
  .refine((p) => [p.paidToLedgerId, p.newLedger, p.newParty].filter((v) => v !== null).length === 1, {
    message: "Pick who it was paid to, or add a new one.",
    path: ["paidToLedgerId"],
  })
  .refine((p) => p.newParty === null || p.newParty.addresses.length > 0, { message: "A new party needs an address.", path: ["newParty"] })
  .refine((p) => p.newParty === null || PARTY_PAYMENT_KINDS.includes(p.paidFor), { message: "Only a supplier, a loan or a refund goes to a new party.", path: ["newParty"] })
  .refine((p) => p.newLedger === null || p.paidFor === "expense", { message: "Only an expense makes a new ledger.", path: ["newLedger"] })
  .refine((p) => (p.paidFor === "loanGiven") === (p.loan !== null), { message: "A loan given needs its terms.", path: ["loan"] })
  .refine((p) => p.tdsRate === null || p.paidFor === "supplier", { message: "TDS is deducted from a supplier only.", path: ["tdsRate"] })
  .refine((p) => p.interestAmount === null || p.paidFor === "loanRepaid", { message: "Only a loan repaid has an interest part.", path: ["interestAmount"] })
  .refine((p) => p.interestAmount === null || p.interestAmount <= p.amount, { message: "The interest can't be more than the amount.", path: ["interestAmount"] })
  .refine((p) => p.settledIn === "cash" || p.bankDetailsId !== null, { message: "Pick the bank account.", path: ["bankDetailsId"] });

export type CreatePaymentInputModel = z.infer<typeof createPaymentInputModel>;

// the TDS we deducted from a supplier, on what we owed: paid is what's left after the TDS, so
// owed = paid ÷ (1 − rate), and the TDS is the difference
export const tdsOn = (paid: number, rate: number) => Math.round((paid / (1 - rate / 100) - paid) * 100) / 100;

// a payment's own details, for its page and voucher (no balances: staff open vouchers too); everything the voucher
// prints is as it was when paid
export const paymentModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  remarks: z.string().nullable(),
  status: z.enum(["active", "cancelled"]),
  paidFor: paymentKindModel,
  createdByName: z.string(),
  // the bank account it went from: its bank, the last 4 digits and IFSC
  bank: z.object({ name: z.string(), last4: z.string(), ifsc: z.string().nullable() }).nullable(),
  paidToLedgerId: idModel,
  // as it was named when paid (a party's short name or full name, or the ledger's name)
  paidToName: z.string(),
  partyPhone: z.string().nullable(),
  // the party it went to, for the voucher's Paid to block: full name, short name and its default address
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
  // a loan given: its interest
  loan: z.object({ interestRate: z.number(), frequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly"]) }).nullable(),
  // our own details the voucher is headed with
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
  // a loan repaid: the interest part of the amount
  interestAmount: z.number().nullable(),
  tdsRate: z.number().nullable(),
  tdsAmount: z.number().nullable(),
});

export type PaymentModel = z.infer<typeof paymentModel>;

export const paymentIdInputModel = z.object({ transactionId: idModel });

export type PaymentIdInputModel = z.infer<typeof paymentIdInputModel>;

// a voucher opened from a link shared with the party: the payment and the key in its link
export const sharedPaymentInputModel = z.object({ transactionId: idModel, key: z.string().min(1).max(64) });

export const paymentShareKeyModel = z.object({ key: z.string() });

// right after a save: the payment with the ledgers it moved and their balances (null for staff)
export const savedPaymentModel = paymentModel.extend({ balances: z.array(ledgerSummaryModel).nullable() });

export type SavedPaymentModel = z.infer<typeof savedPaymentModel>;
