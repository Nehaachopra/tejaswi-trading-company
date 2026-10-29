import { z } from "zod";

import { amountModel } from "../accounts/model";
import { createPartyInputModel } from "../party/model";
import { remarksModel } from "../transaction/model";

const idModel = z.string().uuid();

// a calendar day, "2026-11-15"
const dayModel = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// who owes whom: a debtor owes us, we owe a creditor, a loan we gave, a loan we took
export const dueKindModel = z.enum(["debtor", "creditor", "loanGiven", "loanTaken"]);

export type DueKind = z.infer<typeof dueKindModel>;

// the kinds as the database keeps them
export const DUE_KIND_DB = {
  debtor: "debtor",
  creditor: "creditor",
  loanGiven: "loan_given",
  loanTaken: "loan_taken",
} as const satisfies Record<DueKind, string>;

export const isLoan = (kind: DueKind) => kind === "loanGiven" || kind === "loanTaken";

// a loan's terms, given with the receipt or payment that makes it: its interest (% a year, 0 = interest-free), how
// often the interest is paid, and when it should be paid back by (if ever set)
export const loanTermsInputModel = z.object({
  interestRate: z.number().min(0).max(100).multipleOf(0.01),
  frequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly"]),
  dueOn: dayModel.nullable().default(null),
});

export type LoanTermsInputModel = z.infer<typeof loanTermsInputModel>;

// one due as it stands: what it was, what's left of it, and whether it's past its due date
export const dueModel = z.object({
  id: idModel,
  kind: dueKindModel,
  partyId: idModel,
  partyName: z.string(),
  partyPhone: z.string().nullable(),
  // the transaction that made it (an old due's is OT…), and its date
  transactionId: idModel,
  assignedId: z.string(),
  dated: z.date(),
  old: z.boolean(),
  amount: z.number(),
  left: z.number(),
  dueOn: z.string().nullable(),
  overdue: z.boolean(),
  // a loan's interest
  interestRate: z.number().nullable(),
  frequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly"]).nullable(),
});

export type DueModel = z.infer<typeof dueModel>;

// a party's dues of one kind together: what's left in all, how much of it is overdue, and each open due, oldest first
export const duePartyModel = z.object({
  partyId: idModel,
  partyName: z.string(),
  // as the party is now: its short name, phone and the town of its default address
  shortName: z.string().nullable(),
  partyPhone: z.string().nullable(),
  city: z.string().nullable(),
  left: z.number(),
  overdue: z.number(),
  // the earliest due date still open
  nextDueOn: z.string().nullable(),
  dues: z.array(dueModel),
});

export type DuePartyModel = z.infer<typeof duePartyModel>;

// one tab of /dues: what's left in all, how much is overdue (and with how many parties), and how long it takes on
// average from a due to its settlement (days, weighted by the amount settled; null until anything is settled)
export const duesBoardModel = z.object({
  total: z.number(),
  overdue: z.number(),
  parties: z.number(),
  overdueParties: z.number(),
  averageDays: z.number().nullable(),
  list: z.array(duePartyModel),
});

export type DuesBoardModel = z.infer<typeof duesBoardModel>;

export const listDuesInputModel = z.object({ kind: dueKindModel });

// one party's dues of one kind, for its own page
export const partyDuesInputModel = z.object({ kind: dueKindModel, partyId: idModel });

export type PartyDuesInputModel = z.infer<typeof partyDuesInputModel>;

// what settled a party's dues: the payment or receipt (or the bad-debt write-off), its day, how much, and which due
export const dueSettlementModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  type: z.string(),
  badDebt: z.boolean(),
  dated: z.date(),
  amount: z.number(),
  dueAssignedId: z.string(),
});

// one party's dues page: the party as it is now (and its ledger), what's left and overdue, how long it takes to settle,
// its last payment, its open dues oldest first and what settled them, newest first
export const partyDuesModel = z.object({
  party: z.object({
    id: idModel,
    name: z.string(),
    shortName: z.string().nullable(),
    phone: z.string().nullable(),
    countryCode: z.string().nullable(),
    city: z.string().nullable(),
    type: z.enum(["customer", "supplier", "both"]).nullable(),
  }),
  left: z.number(),
  overdue: z.number(),
  averageDays: z.number().nullable(),
  lastPaid: z.object({ dated: z.date(), amount: z.number() }).nullable(),
  dues: z.array(dueModel),
  settlements: z.array(dueSettlementModel),
});

export type PartyDuesModel = z.infer<typeof partyDuesModel>;

// what a debtor or a borrower will never pay: what's left on one due (or on all of theirs), written off to Bad debts
// today
export const writeOffInputModel = z.object({
  kind: z.enum(["debtor", "loanGiven"]),
  partyId: idModel,
  dueId: idModel.nullable().default(null),
  remarks: remarksModel,
});

export type WriteOffInputModel = z.infer<typeof writeOffInputModel>;

export type ListDuesInputModel = z.infer<typeof listDuesInputModel>;

// the open loans of one kind, for the chat to pick from (one party's, when given)
export const openLoansInputModel = z.object({ kind: z.enum(["loanGiven", "loanTaken"]), partyId: idModel.nullable().default(null) });

export type OpenLoansInputModel = z.infer<typeof openLoansInputModel>;

// a due from before the app: who (an existing party's ledger, or a new party), what was still owed, the day it was
// taken or billed, when it should be paid by, and a loan's interest. It's posted against Capital on that day
export const addOldDueInputModel = z
  .object({
    kind: dueKindModel,
    partyLedgerId: idModel.nullable().default(null),
    newParty: createPartyInputModel.nullable().default(null),
    amount: amountModel,
    dated: dayModel,
    dueOn: dayModel.nullable().default(null),
    interestRate: z.number().min(0).max(100).multipleOf(0.01).nullable().default(null),
    frequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly"]).nullable().default(null),
    remarks: remarksModel,
  })
  .refine((d) => (d.partyLedgerId === null) !== (d.newParty === null), { message: "Pick the party, or add a new one.", path: ["partyLedgerId"] })
  .refine((d) => d.newParty === null || d.newParty.addresses.length > 0, { message: "A new party needs an address.", path: ["newParty"] })
  .refine((d) => isLoan(d.kind) === (d.interestRate !== null && d.frequency !== null), { message: "A loan needs its interest, and only a loan has one.", path: ["interestRate"] })
  .refine((d) => d.dueOn === null || d.dueOn >= d.dated, { message: "It can't be due before it was taken.", path: ["dueOn"] });

export type AddOldDueInputModel = z.infer<typeof addOldDueInputModel>;
