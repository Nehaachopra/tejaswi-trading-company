import { z } from "zod";

import { amountModel, ledgerNameModel, ledgerSummaryModel, LOAN_RECEIPT_KINDS, PARTY_RECEIPT_KINDS, type ReceiptKind, receiptKindModel } from "../accounts/model";
import { lenderLoanInputModel, loanTermsInputModel } from "../due/model";
import { appOfUpi } from "../bank/upi-handles";
import { createPartyInputModel, partyUpiIdModel } from "../party/model";
import { BANK_MODE_REFERENCE, bankModeModel, moreBankPartModel, settledInModel } from "../payment/model";
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
  interestReceived: "interest_received",
  capital: "capital",
  refund: "refund",
  otherIncome: "other_income",
} as const satisfies Record<ReceiptKind, string>;

// a UTR, IMPS reference, cheque number, or a cash bill or voucher number, up to 30
const referenceModel = z
  .string()
  .trim()
  .max(30)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

// money received: what it was for, from a ledger of that kind (or a new one made in the same save, its place set by
// the kind), into cash, one bank account or both (cashAmount is the cash part), split over more accounts if it came
// into several, each with how it came in and its reference; on any date. A loan given back or the interest on one names the loan
// (dueId) instead, and comes from its borrower. A customer that deducted TDS gives its rate; lengths follow receipts:
// reference 30, remarks 100
export const createReceiptInputModel = z
  .object({
    // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
    saveKey: z.string().uuid().nullable().default(null),
    dateTime: z.coerce.date(),
    receivedFor: receiptKindModel,
    receivedFromLedgerId: idModel.nullable().default(null),
    dueId: idModel.nullable().default(null),
    newLedger: z.object({ name: ledgerNameModel }).nullable().default(null),
    // someone not in the app yet (an old customer paying, someone lending or repaying), made as a party in the same
    // save with the type picked for them. Every loan received also gives its terms
    newParty: createPartyInputModel.nullable().default(null),
    loan: loanTermsInputModel.nullable().default(null),
    // a loan from a bank or NBFC comes from a lender, never a party
    lender: lenderLoanInputModel.nullable().default(null),
    amount: amountModel,
    settledIn: settledInModel,
    // cash and bank together: the part that came in cash (the bank took the rest)
    cashAmount: amountModel.nullable().default(null),
    bankDetailsId: idModel.nullable().default(null),
    // how the bank's part came in (none for cash)
    bankMode: bankModeModel.nullable().default(null),
    // the first account's UTR or cheque number, shaped as its mode has it
    referenceNumber: referenceModel,
    // the cash part's bill or voucher number
    cashReferenceNumber: referenceModel,
    // more bank accounts it came into: each with what came in, how and its reference (the first account, above, took
    // the rest)
    moreBankParts: z.array(moreBankPartModel).max(4).default([]),
    // a UPI ID typed for an account that had none (for its QR): added to that account with the receipt
    bankUpiIds: z
      .array(z.object({ bankDetailsId: idModel, upiId: partyUpiIdModel.refine((u) => appOfUpi(u) !== null, "That isn't a UPI app's handle.") }))
      .max(5)
      .default([]),
    tdsRate: rateModel.nullable().default(null),
    // a scrap sale: the ledger of the party who bought it (added in Entities), printed on its invoice; GST is taken out
    // of the amount
    buyerLedgerId: idModel.nullable().default(null),
    // or a buyer not in the app yet, made as a customer in the same save
    newBuyer: createPartyInputModel.nullable().default(null),
    remarks: remarksModel,
  })
  .refine((r) => (r.buyerLedgerId === null && r.newBuyer === null) || r.receivedFor === "otherIncome", { message: "Only a scrap sale has a buyer.", path: ["buyerLedgerId"] })
  .refine((r) => r.buyerLedgerId === null || r.newBuyer === null, { message: "Pick the buyer, or add a new one.", path: ["newBuyer"] })
  .refine((r) => r.newBuyer === null || r.newBuyer.addresses.length > 0, { message: "A new buyer needs an address.", path: ["newBuyer"] })
  // capital always comes into the one Capital ledger, so it may name none
  .refine((r) => {
    const named = [r.receivedFromLedgerId, r.newLedger, r.newParty, r.lender].filter((v) => v !== null).length;
    return r.receivedFor === "capital" ? named === (r.receivedFromLedgerId === null ? 0 : 1) : named === (LOAN_RECEIPT_KINDS.includes(r.receivedFor) ? 0 : 1);
  }, {
    message: "Pick who it came from, or add a new one.",
    path: ["receivedFromLedgerId"],
  })
  .refine((r) => (r.dueId !== null) === LOAN_RECEIPT_KINDS.includes(r.receivedFor), { message: "Pick the loan.", path: ["dueId"] })
  .refine((r) => r.newParty === null || r.newParty.addresses.length > 0, {
    message: "A new party needs an address.",
    path: ["newParty"],
  })
  .refine((r) => r.newParty === null || PARTY_RECEIPT_KINDS.includes(r.receivedFor), {
    message: "Only a payment or a loan comes from a new party.",
    path: ["newParty"],
  })
  .refine((r) => r.loan === null || r.loan.lenderType !== null, { message: "A loan received says who gave it.", path: ["loan"] })
  .refine((r) => r.lender === null || r.receivedFor === "loanTaken", { message: "A lender only gives a loan we took.", path: ["lender"] })
  .refine((r) => (r.receivedFor === "loanTaken") === (r.loan !== null), { message: "A loan received needs its terms.", path: ["loan"] })
  .refine((r) => r.newLedger === null || !!NEW_LEDGER_FOR[r.receivedFor], { message: "That comes from a party, not a new ledger.", path: ["newLedger"] })
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
  // a UPI ID only for an account this came into by UPI, one each
  .refine(
    (r) =>
      new Set(r.bankUpiIds.map((u) => u.bankDetailsId)).size === r.bankUpiIds.length &&
      r.bankUpiIds.every(
        (u) =>
          (u.bankDetailsId === r.bankDetailsId && r.bankMode === "upi") ||
          r.moreBankParts.some((m) => m.bankDetailsId === u.bankDetailsId && m.mode === "upi"),
      ),
    { message: "A UPI ID is only added to an account it came into by UPI.", path: ["bankUpiIds"] },
  )
  .refine((r) => new Set(r.bankUpiIds.map((u) => u.upiId)).size === r.bankUpiIds.length, { message: "A UPI ID is in twice.", path: ["bankUpiIds"] })
  // the first account still takes something: the others never cover the whole bank part
  .refine(
    (r) =>
      r.settledIn === "cash" ||
      Math.round(r.amount * 100) - Math.round((r.cashAmount ?? 0) * 100) - r.moreBankParts.reduce((sum, b) => sum + Math.round(b.amount * 100), 0) > 0,
    { message: "The other accounts take more than the bank's part.", path: ["moreBankParts"] },
  );

export type CreateReceiptInputModel = z.infer<typeof createReceiptInputModel>;

// what we sell as scrap, the dust from cleaning rice: HSN 2303 at 5% GST, as our CA confirmed (8 Nov 2026). The law's,
// never typed or set; each scrap sale keeps the ones it was saved with
export const SCRAP_GST = { hsn: "2303", rate: 5 } as const;

// the GST in an amount received that includes it, in paise: the price before GST, and CGST + SGST (halves, any odd
// paisa to SGST) within our state or IGST outside it
export function gstOutOf(amountPaise: number, rate: number, sameState: boolean) {
  const taxable = Math.round((amountPaise * 100) / (100 + rate));
  const gst = amountPaise - taxable;
  const cgst = sameState ? Math.floor(gst / 2) : 0;
  return { taxable, cgst, sgst: sameState ? gst - cgst : 0, igst: sameState ? 0 : gst };
}

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
  settledIn: settledInModel,
  // what came into each: cash and the bank accounts (0 for one not used)
  cashAmount: z.number(),
  bankAmount: z.number(),
  bankDetailsId: idModel.nullable(),
  // how the first account's part came in, and its UTR or cheque number
  bankMode: bankModeModel.nullable(),
  referenceNumber: z.string().nullable(),
  // the cash part's bill or voucher number
  cashReferenceNumber: z.string().nullable(),
  // the other accounts it came into (the first is above)
  moreBankParts: z.array(
    z.object({ bankDetailsId: idModel, name: z.string(), last4: z.string(), ifsc: z.string().nullable(), amount: z.number(), mode: bankModeModel, referenceNumber: z.string().nullable() }),
  ),
  amount: z.number(),
  tdsRate: z.number().nullable(),
  tdsAmount: z.number().nullable(),
  // a customer paying more than they owed: what settled their dues (with any TDS) and the advance left with us
  split: z.object({ due: z.number(), advance: z.number() }).nullable(),
  // a scrap sale's GST, taken out of the amount: HSN, rate, the price before GST, and CGST + SGST or IGST (the buyer is
  // in party)
  gst: z
    .object({ hsn: z.string(), rate: z.number(), taxable: z.number(), cgst: z.number(), sgst: z.number(), igst: z.number() })
    .nullable(),
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
