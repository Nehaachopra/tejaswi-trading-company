import { z } from "zod";

import { GSTIN_PATTERN, PHONE_PATTERN, shortNameModel } from "../party/model";

const idModel = z.string().uuid();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

// lengths follow landlords: name 150, short name 20, phone 20, email 254, PAN 10, GSTIN 15. Only the name is a must;
// no GSTIN means unregistered, so we pay reverse-charge GST on their rent
export const landlordInputModel = z.object({
  name: z.string().trim().min(1).max(150).regex(/^\D*$/, "A name has no numbers."),
  shortName: shortNameModel.nullable().default(null),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_PATTERN.test(v), "A 10-digit mobile, or a landline with its STD code.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "That isn't a valid email.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^$|^[A-Z]{5}\d{4}[A-Z]$/, "A PAN looks like ABCDE1234F.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || GSTIN_PATTERN.test(v), "That isn't a valid GSTIN.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  remarks: optionalText(500),
});

export type LandlordInputModel = z.infer<typeof landlordInputModel>;

export const updateLandlordInputModel = z.object({ id: idModel, details: landlordInputModel });

export type UpdateLandlordInputModel = z.infer<typeof updateLandlordInputModel>;

export const landlordIdInputModel = z.object({ id: idModel });

export type LandlordIdInputModel = z.infer<typeof landlordIdInputModel>;

export const listLandlordsInputModel = z.object({ includeInactive: z.boolean().default(false) });

export type ListLandlordsInputModel = z.infer<typeof listLandlordsInputModel>;

export const setLandlordActiveInputModel = z.object({ id: idModel, isActive: z.boolean() });

export type SetLandlordActiveInputModel = z.infer<typeof setLandlordActiveInputModel>;

export const landlordModel = z.object({
  id: idModel,
  name: z.string(),
  shortName: z.string().nullable(),
  countryCode: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  pan: z.string().nullable(),
  gstin: z.string().nullable(),
  remarks: z.string().nullable(),
  isActive: z.boolean(),
});

export type LandlordModel = z.infer<typeof landlordModel>;

// who can be picked on a godown or a rent payment; staff record rent too, so nothing private
export const landlordPickModel = z.object({ id: idModel, name: z.string(), shortName: z.string().nullable(), gstin: z.string().nullable(), godowns: z.array(z.object({ id: idModel, name: z.string(), monthlyRent: z.number() })) });

export type LandlordPickModel = z.infer<typeof landlordPickModel>;
