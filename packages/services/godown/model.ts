import { z } from "zod";

const idModel = z.string().uuid();

// lengths follow the godowns table: name 20, landlord name 255, country code 5, number 20
const godownNameModel = z.string().trim().min(1).max(20);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

const rentModel = z.number().positive().max(9_999_999_999_999).multipleOf(0.01);

// a godown's own details; rented ones carry the rent and the landlord, owned ones carry neither
export const godownDetailsInputModel = z
  .object({
    godownName: godownNameModel,
    address: optionalText(500),
    ownership: z.enum(["rented", "owned"]).default("rented"),
    rent: rentModel.nullable().default(null),
    rentTimingInMonths: z.number().int().positive().max(120).nullable().default(null),
    usedFrom: z.coerce.date().nullable().default(null),
    landlordName: optionalText(255),
    landlordCountryCode: optionalText(5),
    landlordNumber: z
      .string()
      .trim()
      .regex(/^\d{0,20}$/, "Digits only, up to 20.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
  })
  .superRefine((g, ctx) => {
    if (g.ownership === "rented") {
      if (g.rent == null) ctx.addIssue({ code: "custom", path: ["rent"], message: "A rented godown needs its rent." });
      if (g.landlordName == null) ctx.addIssue({ code: "custom", path: ["landlordName"], message: "A rented godown needs its landlord." });
    }
    // the country code and the number go together
    if ((g.landlordCountryCode == null) !== (g.landlordNumber == null)) {
      ctx.addIssue({ code: "custom", path: ["landlordNumber"], message: "Give the landlord's country code and number together." });
    }
  })
  // an owned godown keeps no rental details
  .transform((g) =>
    g.ownership === "owned"
      ? { ...g, rent: null, rentTimingInMonths: null, landlordName: null, landlordCountryCode: null, landlordNumber: null }
      : g,
  );

export type GodownDetailsInputModel = z.input<typeof godownDetailsInputModel>;

// the stock already sitting in a new godown, entered as it is added: whole packs per pack size.
// Quantities only; the stock's overall opening value comes later with the other opening balances
export const openingStockModel = z
  .array(z.object({ productId: idModel, quantity: z.number().int().positive().max(1_000_000) }))
  .max(2000)
  .refine((lines) => new Set(lines.map((l) => l.productId)).size === lines.length, "Each pack size can be listed once.")
  .default([]);

export const createGodownInputModel = z.object({ details: godownDetailsInputModel, openingStock: openingStockModel });

export type CreateGodownInputModel = z.input<typeof createGodownInputModel>;

export const updateGodownInputModel = z.object({ id: idModel, details: godownDetailsInputModel });

export type UpdateGodownInputModel = z.input<typeof updateGodownInputModel>;

export const setGodownActiveInputModel = z.object({ id: idModel, isActive: z.boolean() });

export type SetGodownActiveInputModel = z.infer<typeof setGodownActiveInputModel>;

export const listGodownsInputModel = z
  .object({ includeInactive: z.boolean().default(false) })
  .default({ includeInactive: false });

export type ListGodownsInputModel = z.infer<typeof listGodownsInputModel>;

// one godown in a list: everyone sees these
export const godownSummaryModel = z.object({
  id: idModel,
  godownName: z.string(),
  address: z.string().nullable(),
  isActive: z.boolean(),
  // pack sizes with stock in it, and whether its stock count is under way (then it is locked)
  productCount: z.number().int(),
  beingCounted: z.boolean(),
});

export type GodownSummaryModel = z.infer<typeof godownSummaryModel>;

// a godown with its rental details, for the admin
export const godownModel = godownSummaryModel.extend({
  ownership: z.enum(["rented", "owned"]),
  rent: z.number().nullable(),
  rentTimingInMonths: z.number().int().nullable(),
  usedFrom: z.date().nullable(),
  landlordName: z.string().nullable(),
  landlordCountryCode: z.string().nullable(),
  landlordNumber: z.string().nullable(),
});

export type GodownModel = z.infer<typeof godownModel>;

export const godownIdInputModel = z.object({ id: idModel });

export type GodownIdInputModel = z.infer<typeof godownIdInputModel>;
