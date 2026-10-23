import { z } from "zod";

import { ledgerBalanceModel, openingBalanceModel, savedOpeningBalanceModel } from "../accounts/model";

const idModel = z.string().uuid();

export const bankAccountTypeModel = z.enum(["savings", "current", "cash_credit", "overdraft"]);

// lengths follow bank_details: holder 255, bank and branch 100, account number 30, IFSC 11, UPI 255
export const bankDetailsInputModel = z.object({
  bankName: z.string().trim().min(1).max(100),
  accountHolderName: z.string().trim().min(1).max(255),
  branchName: z.string().trim().min(1).max(100),
  accountNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-Z]{6,30}$/, "Letters and digits only, 6 to 30."),
  ifscCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "An IFSC looks like SBIN0001234."),
  accountType: bankAccountTypeModel,
  upiId: z
    .string()
    .trim()
    .max(255)
    .regex(/^$|^[\w.-]+@[\w.-]+$/, "A UPI ID looks like name@bank.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
});

export type BankDetailsInputModel = z.infer<typeof bankDetailsInputModel>;

// a new bank account, with what it held on a date (none for an account opened today with nothing in it)
export const createBankAccountInputModel = z.object({
  details: bankDetailsInputModel,
  openingBalance: openingBalanceModel.nullable().default(null),
});

export type CreateBankAccountInputModel = z.infer<typeof createBankAccountInputModel>;

// its details and opening balance; the opening balance changes only while it is the ledger's only entry
export const updateBankAccountInputModel = createBankAccountInputModel.extend({ id: idModel });

export type UpdateBankAccountInputModel = z.infer<typeof updateBankAccountInputModel>;

export const bankAccountIdInputModel = z.object({ id: idModel });

export type BankAccountIdInputModel = z.infer<typeof bankAccountIdInputModel>;

export const listBankAccountsInputModel = z.object({ includeInactive: z.boolean().default(false) });

export type ListBankAccountsInputModel = z.infer<typeof listBankAccountsInputModel>;

export const setBankAccountActiveInputModel = z.object({ id: idModel, isActive: z.boolean() });

export type SetBankAccountActiveInputModel = z.infer<typeof setBankAccountActiveInputModel>;

// one bank account: its details, its ledger, the balance as of today (and what post-dated entries add)
export const bankAccountModel = z.object({
  id: idModel,
  ledgerId: idModel,
  bankName: z.string(),
  accountHolderName: z.string(),
  branchName: z.string(),
  accountNumber: z.string(),
  last4: z.string(),
  ifscCode: z.string(),
  accountType: bankAccountTypeModel,
  upiId: z.string().nullable(),
  isActive: z.boolean(),
  balance: ledgerBalanceModel,
  openingBalance: savedOpeningBalanceModel.nullable(),
  // whether anything besides the opening balance has been posted (then the opening balance is fixed)
  hasEntries: z.boolean(),
});

export type BankAccountModel = z.infer<typeof bankAccountModel>;
