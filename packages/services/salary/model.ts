import { z } from "zod";

import { amountModel } from "../accounts/model";
import { remarksModel } from "../transaction/model";
import { contraReferenceModel } from "../contra/model";
import { BANK_MODE_REFERENCE, bankModeModel } from "../payment/model";

const idModel = z.string().uuid();

// paying an employee, from cash or one bank account: salary (settling the months owed oldest first, never more than
// is owed), or an advance (taken back in full from their next posted month); dated as a receipt is
export const paySalaryInputModel = z
  .object({
    // made when the form opened: a second save with it (a retry, a double tap) gets the first one's result
    saveKey: z.string().uuid().nullable().default(null),
    dateTime: z.coerce.date(),
    employeeId: idModel,
    kind: z.enum(["salary", "advance"]),
    amount: amountModel,
    settledIn: z.enum(["cash", "bank"]),
    bankDetailsId: idModel.nullable().default(null),
    // a bank payment: how it was paid; the reference is then its UTR or cheque no. (a cash one's, its voucher no.)
    bankMode: bankModeModel.nullable().default(null),
    referenceNumber: contraReferenceModel,
    remarks: remarksModel,
  })
  .refine((p) => (p.settledIn === "bank") === (p.bankDetailsId !== null), { message: "Pick the bank account.", path: ["bankDetailsId"] })
  .refine((p) => (p.settledIn === "bank") === (p.bankMode !== null), { message: "Pick how it was paid.", path: ["bankMode"] })
  .refine((p) => p.bankMode === null || p.referenceNumber === null || BANK_MODE_REFERENCE[p.bankMode].test(p.referenceNumber), {
    message: "That reference doesn't fit how it was paid.",
    path: ["referenceNumber"],
  });

export type PaySalaryInputModel = z.infer<typeof paySalaryInputModel>;

// paying salary to many employees in one save, from one place: a transaction each, all saved together or none
export const paySalariesInputModel = z
  .object({
    saveKey: z.string().uuid().nullable().default(null),
    dateTime: z.coerce.date(),
    // amount: what's paid; advance: the advance taken back in it (the user's choice; 0 for none)
    lines: z
      .array(z.object({ employeeId: idModel, amount: amountModel, advance: z.number().min(0).max(9_999_999_999_999).multipleOf(0.01).default(0) }))
      .min(1, "Tick at least one employee.")
      .max(500)
      .refine((l) => new Set(l.map((x) => x.employeeId)).size === l.length, "An employee is ticked twice."),
    // where it's paid from, in the order used (cash first): cash (no account) or a bank account, how much from each, and
    // for an account how it was paid with its UTR or cheque no. The app shares them over the employees in order
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
  .refine((p) => Math.round(p.sources.reduce((s, x) => s + x.amount, 0) * 100) === Math.round(p.lines.reduce((s, x) => s + x.amount, 0) * 100), {
    message: "Where it's paid from must add up to the total.",
    path: ["sources"],
  });

export type PaySalariesInputModel = z.infer<typeof paySalariesInputModel>;

// a posted month still owed: its salary (a part month for the month they joined), the advance taken off, what's owed,
// what's been paid and what's left
export const owedMonthModel = z.object({
  postingId: idModel,
  year: z.number(),
  month: z.number(),
  gross: z.number(),
  advanceDeducted: z.number(),
  net: z.number(),
  paid: z.number(),
  left: z.number(),
});

// an active employee as the pay form shows them: who, their pay, the advance they still owe, and the months still owed
export const salaryEmployeeModel = z.object({
  employeeId: idModel,
  partyId: idModel,
  name: z.string(),
  shortName: z.string().nullable(),
  monthlySalary: z.number(),
  payDay: z.number(),
  advanceLeft: z.number(),
  owed: z.array(owedMonthModel),
});

export type SalaryEmployeeModel = z.infer<typeof salaryEmployeeModel>;

export const salaryIdInputModel = z.object({ transactionId: idModel });

export type SalaryIdInputModel = z.infer<typeof salaryIdInputModel>;

// one payment's own details, for its page after a save
export const salaryPaymentModel = z.object({
  transactionId: idModel,
  assignedId: z.string(),
  dateTime: z.date(),
  status: z.enum(["active", "cancelled"]),
  kind: z.enum(["salary", "advance"]),
  employee: z.object({ id: idModel, name: z.string() }),
  amount: z.number(),
  settledIn: z.enum(["cash", "bank", "cashAndBank"]),
  bankDetailsId: idModel.nullable(),
  referenceNumber: z.string().nullable(),
  remarks: z.string().nullable(),
});

export type SalaryPaymentModel = z.infer<typeof salaryPaymentModel>;
