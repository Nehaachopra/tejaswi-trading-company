import { z } from "zod";

const idModel = z.string().uuid();

const PAN = /^$|^[A-Z]{5}\d{4}[A-Z]$/;

const optionalPan = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PAN, "A PAN looks like ABCDE1234F.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

const optionalBranch = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

export const lenderTypeOfBankModel = z.enum(["bank", "nbfc"]);

export type LenderTypeOfBankModel = z.infer<typeof lenderTypeOfBankModel>;

// a bank or NBFC: its name and branch, and an NBFC's PAN. Lengths follow lenders: name 150, branch 100, PAN 10
export const lenderInputModel = z.object({
  name: z.string().trim().min(1).max(150),
  branch: optionalBranch,
  type: lenderTypeOfBankModel,
  pan: optionalPan,
});

export type LenderInputModel = z.infer<typeof lenderInputModel>;

// what can change once it has loans: never the type, which their TDS was worked out from
export const updateLenderInputModel = z.object({
  id: idModel,
  name: z.string().trim().min(1).max(150),
  branch: optionalBranch,
  pan: optionalPan,
});

export type UpdateLenderInputModel = z.infer<typeof updateLenderInputModel>;

export const listLendersInputModel = z.object({ includeInactive: z.boolean().default(false) });

export type ListLendersInputModel = z.infer<typeof listLendersInputModel>;

export const setLenderActiveInputModel = z.object({ id: idModel, isActive: z.boolean() });

export type SetLenderActiveInputModel = z.infer<typeof setLenderActiveInputModel>;

export const lenderModel = z.object({
  id: idModel,
  name: z.string(),
  branch: z.string().nullable(),
  type: lenderTypeOfBankModel,
  pan: z.string().nullable(),
  isActive: z.boolean(),
});

export type LenderModel = z.infer<typeof lenderModel>;
