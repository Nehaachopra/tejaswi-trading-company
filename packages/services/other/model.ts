import { z } from "zod";

import { amountModel, customHeadModel, ledgerNameModel, ledgerSummaryModel } from "../accounts/model";

const idModel = z.string().uuid();

// a ledger made with the entry: its name and the head it sits under (Others is where most new heads, like a provision,
// are first needed)
const newLedgerModel = z.object({ name: ledgerNameModel, head: customHeadModel });

// a journal entry for anything no other page covers (Others): one of our own ledgers debited and another credited with
// the same amount, each an existing one or a new one made in the same save; dated as a receipt is, with the reason why
// (required, 100 like transactions.remarks)
export const createOtherInputModel = z
  .object({
    // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
    saveKey: z.string().uuid().nullable().default(null),
    dateTime: z.coerce.date(),
    debitLedgerId: idModel.nullable().default(null),
    newDebitLedger: newLedgerModel.nullable().default(null),
    creditLedgerId: idModel.nullable().default(null),
    newCreditLedger: newLedgerModel.nullable().default(null),
    amount: amountModel,
    remarks: z.string().trim().min(1, "Say why.").max(100),
  })
  .refine((o) => (o.debitLedgerId === null) !== (o.newDebitLedger === null), { message: "Pick the ledger to debit, or add one.", path: ["debitLedgerId"] })
  .refine((o) => (o.creditLedgerId === null) !== (o.newCreditLedger === null), { message: "Pick the ledger to credit, or add one.", path: ["creditLedgerId"] })
  .refine((o) => o.debitLedgerId === null || o.debitLedgerId !== o.creditLedgerId, { message: "Pick two different ledgers.", path: ["creditLedgerId"] })
  .refine(
    (o) => !o.newDebitLedger || !o.newCreditLedger || o.newDebitLedger.name !== o.newCreditLedger.name || o.newDebitLedger.head !== o.newCreditLedger.head,
    { message: "Pick two different ledgers.", path: ["newCreditLedger"] },
  );

export type CreateOtherInputModel = z.infer<typeof createOtherInputModel>;

export const otherIdInputModel = z.object({ transactionId: idModel });

export type OtherIdInputModel = z.infer<typeof otherIdInputModel>;

// one entry's own details: the two ledgers as named when it was saved
export const otherModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  status: z.enum(["active", "cancelled"]),
  amount: z.number(),
  debit: z.object({ id: idModel, name: z.string() }),
  credit: z.object({ id: idModel, name: z.string() }),
  remarks: z.string().nullable(),
  createdByName: z.string(),
});

export type OtherModel = z.infer<typeof otherModel>;

// what a saved one gives back: it, and the two ledgers with their balances now
export const savedOtherModel = otherModel.extend({ balances: z.array(ledgerSummaryModel) });

export type SavedOtherModel = z.infer<typeof savedOtherModel>;
