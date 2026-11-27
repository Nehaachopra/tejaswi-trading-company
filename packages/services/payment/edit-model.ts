import { z } from "zod";

import { paymentKindModel, pickedLedgerModel } from "../accounts/model";
import { dueModel } from "../due/model";
import { bankModeModel, createPaymentInputModel } from "./model";

const idModel = z.string().uuid();

// a payment edited (the admin's): the payment form's own save, over the saved payment. What it was paid for stays
export const editPaymentInputModel = z.object({
  transactionId: idModel,
  payment: createPaymentInputModel,
});

export type EditPaymentInputModel = z.infer<typeof editPaymentInputModel>;

// a payment as its edit form opens it: the answers it was saved with (for the form to start from), what this payment
// itself took out of cash, the banks and from whoever it was paid to (so the form shows them as they were before it),
// the days it can move to, and why it can't be edited, if it can't
export const paymentForEditModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  // shown, never changed
  paidFor: paymentKindModel,
  // who it went to: the ledger as the picker shows it (balance today), or the loan (what's left before this payment)
  to: pickedLedgerModel.nullable(),
  loan: dueModel.nullable(),
  // an expense head with TDS: who was paid (a party's ledger), or the landlord for rent
  payee: pickedLedgerModel.nullable(),
  payeeLandlordId: idModel.nullable(),
  // a loan given: its terms
  loanTerms: z.object({ interestRate: z.number(), frequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly"]), dueOn: z.string().nullable() }).nullable(),
  // an expense's GST on the supplier's bill
  gst: z.object({ gstin: z.string(), billNumber: z.string(), billDate: z.string(), rate: z.number() }).nullable(),
  // what was handed over, and the TDS taken out of the bill
  amount: z.number(),
  tdsAmount: z.number(),
  // where it was paid from: the cash part, then each bank account with its part, how and its reference, in order
  cashAmount: z.number(),
  banks: z.array(z.object({ bankDetailsId: idModel, amount: z.number(), mode: bankModeModel.nullable(), referenceNumber: z.string().nullable() })),
  cashReferenceNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  // what this payment did to the ledger it was paid to (debit as plus): taken off its balance today, the form sees it as
  // it was before this payment
  toEffect: z.number(),
  // the days it can be moved to: its own month, never after today
  dayMin: z.string(),
  dayMax: z.string(),
  editBlockedBy: z.enum(["cancelled", "gstFiled", "rcmPaid"]).nullable(),
});

export type PaymentForEditModel = z.infer<typeof paymentForEditModel>;
