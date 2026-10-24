import { z } from "zod";

import { ledgerBalanceModel, savedOpeningBalanceModel } from "../accounts/model";

const idModel = z.string().uuid();

export const bankAccountTypeModel = z.enum(["savings", "current", "cash_credit", "overdraft"]);

export const upiProviderModel = z.enum(["phonepe", "gpay", "paytm", "bhim", "amazon_pay", "other"]);

// one UPI ID linked to the account, and the app it was made in; stored in lowercase
export const upiIdModel = z.object({
  upiId: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .regex(/^[\w.-]+@[\w.-]+$/, "A UPI ID looks like name@bank."),
  provider: upiProviderModel,
});

// lengths follow bank_details: holder 255, bank and branch 100, account number 30, IFSC 11, UPI 255. Names are
// stored in lowercase (screens start each word with a capital). The IFSC is optional: without it the bank comes
// from the list of banks; with it, the bank and branch come from the IFSC
export const bankDetailsInputModel = z.object({
  bankName: z.string().trim().toLowerCase().min(1).max(100),
  accountHolderName: z.string().trim().toLowerCase().min(1).max(255),
  branchName: z.string().trim().toLowerCase().min(1).max(100),
  // Indian banks use 9 to 18 digits
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{9,18}$/, "An account number is 9 to 18 digits."),
  ifscCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^$|^[A-Z]{4}0[A-Z0-9]{6}$/, "An IFSC looks like SBIN0001234.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  accountType: bankAccountTypeModel,
  upiIds: z
    .array(upiIdModel)
    .max(10)
    .default([])
    .refine((ids) => new Set(ids.map((u) => u.upiId)).size === ids.length, "Each UPI ID only once."),
});

export type BankDetailsInputModel = z.infer<typeof bankDetailsInputModel>;

// a new bank account; its opening balance is set on the Opening balances page
export const createBankAccountInputModel = z.object({
  details: bankDetailsInputModel,
});

export type CreateBankAccountInputModel = z.infer<typeof createBankAccountInputModel>;

// its details
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
  ifscCode: z.string().nullable(),
  accountType: bankAccountTypeModel,
  upiIds: z.array(upiIdModel),
  isActive: z.boolean(),
  balance: ledgerBalanceModel,
  openingBalance: savedOpeningBalanceModel.nullable(),
  // whether anything besides the opening balance has been posted (then the opening balance is fixed)
  hasEntries: z.boolean(),
});

export type BankAccountModel = z.infer<typeof bankAccountModel>;

// a bank's branches whose name (or city) holds the search, for picking a branch without knowing its IFSC
export const branchSearchInputModel = z.object({
  bank: z.string().trim().min(1).max(150),
  search: z.string().trim().min(2).max(60),
});

export type BranchSearchInputModel = z.infer<typeof branchSearchInputModel>;

export const branchModel = z.object({
  ifsc: z.string(),
  branch: z.string(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  state: z.string().nullable(),
});

export type BranchModel = z.infer<typeof branchModel>;

export const ifscInputModel = z.object({ ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/) });

export type IfscInputModel = z.infer<typeof ifscInputModel>;

// what an IFSC names: its bank and branch (null when it isn't in the directory)
export const ifscBranchModel = branchModel.extend({ bank: z.string() }).nullable();
