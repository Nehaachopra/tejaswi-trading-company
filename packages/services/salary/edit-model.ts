import { z } from "zod";

import { amountModel, pickedLedgerModel } from "../accounts/model";
import { contraReferenceModel } from "../contra/model";
import { BANK_MODE_REFERENCE, bankModeModel } from "../payment/model";
import { remarksModel } from "../transaction/model";
import { salaryEmployeeModel } from "./model";

const idModel = z.string().uuid();

// a salary or advance edited (the admin's): what it was paid for and who stay; the amount (a salary: with the advance
// set off), where it's paid from, the day (within its own month) and the remarks change
export const editSalaryInputModel = z
  .object({
    transactionId: idModel,
    dateTime: z.coerce.date(),
    amount: amountModel,
    // a salary: the advance set off in it (0 for none); an advance: always 0
    advance: z.number().min(0).max(9_999_999_999_999).multipleOf(0.01).default(0),
    // where it's paid from, in order (cash first): cash (no account) or a bank account, how much from each, and for an
    // account how it was paid with its UTR or cheque no.
    sources: z
      .array(
        z
          .object({
            bankDetailsId: idModel.nullable(),
            amount: amountModel,
            mode: bankModeModel.nullable().default(null),
            referenceNumber: contraReferenceModel,
          })
          .refine((s) => (s.bankDetailsId === null) === (s.mode === null), { message: "Pick how it was paid.", path: ["mode"] })
          .refine((s) => s.mode === null || s.referenceNumber === null || BANK_MODE_REFERENCE[s.mode].test(s.referenceNumber), {
            message: "That reference doesn't fit how it was paid.",
            path: ["referenceNumber"],
          }),
      )
      .min(1)
      .max(20)
      .refine((l) => new Set(l.map((x) => x.bankDetailsId ?? "cash")).size === l.length, "A place is in twice."),
    // the cash voucher no., when cash is used
    referenceNumber: contraReferenceModel,
    remarks: remarksModel,
  })
  .refine((p) => Math.round(p.sources.reduce((s, x) => s + x.amount, 0) * 100) === Math.round(p.amount * 100), {
    message: "Where it's paid from must add up to the amount.",
    path: ["sources"],
  });

export type EditSalaryInputModel = z.infer<typeof editSalaryInputModel>;

// a salary or advance as its edit form opens it: as saved, with what the employee owed and owed back before it (so the
// form shows them as they were before this payment), what of an advance has since been taken back (it can't go below),
// the days it can move to, and why it can't be edited, if it can't
export const salaryForEditModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  // shown, never changed
  kind: z.enum(["salary", "advance"]),
  employee: z.object({ employeeId: idModel, name: z.string(), shortName: z.string().nullable() }),
  // the employee's row as the salary stages show it, as it was before this payment: the months owed and the advance owed
  // back; and their ledger, as a pick (an advance's Employee stage)
  row: salaryEmployeeModel,
  ledger: pickedLedgerModel,
  // a salary: how many of those months it paid (the oldest first), and whether it set off advance
  months: z.number().int(),
  takesAdvance: z.boolean(),
  // as saved: what was handed over, and (a salary) the advance set off in it
  amount: z.number(),
  advance: z.number(),
  // a salary: what was owed before it (money and set-off together can't pass it), and the advance owed back before it
  owedBefore: z.number(),
  advanceLeftBefore: z.number(),
  // an advance: what's been taken back from it since, in later salaries (its amount can't go below)
  takenBack: z.number(),
  // where it was paid from: the cash part, then each bank account with its part, how and its reference, in order
  cashAmount: z.number(),
  banks: z.array(z.object({ bankDetailsId: idModel, amount: z.number(), mode: bankModeModel.nullable(), referenceNumber: z.string().nullable() })),
  referenceNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  // the days it can be moved to: its own month, never after today
  dayMin: z.string(),
  dayMax: z.string(),
  editBlockedBy: z.enum(["cancelled"]).nullable(),
});

export type SalaryForEditModel = z.infer<typeof salaryForEditModel>;
