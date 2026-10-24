import { z } from "zod";

import { ledgerBalanceModel, savedOpeningBalanceModel } from "../accounts/model";

const idModel = z.string().uuid();

export const partyTypeModel = z.enum(["customer", "supplier", "both"]);

export type PartyTypeModel = z.infer<typeof partyTypeModel>;

// the GST state codes (the first two digits of a GSTIN)
export const stateCodeModel = z.enum([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "26", "27", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "97", "99",
]);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// one address; lengths follow party_addresses: label 100, lines 200, landmark 150, city, district and state 100,
// PIN 6, GSTIN 15. A GSTIN's first two digits are the state's code
export const partyAddressInputModel = z
  .object({
    // an existing address being kept or changed; none for a new one
    id: idModel.optional(),
    label: optionalText(100),
    addressType: z.enum(["billing", "shipping", "both", "registered"]).default("both"),
    addressLine1: z.string().trim().min(1).max(200),
    addressLine2: optionalText(200),
    landmark: optionalText(150),
    city: z.string().trim().min(1).max(100),
    district: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    stateCode: stateCodeModel,
    postalCode: z.string().trim().regex(/^\d{6}$/, "A PIN code is 6 digits."),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^$|^.{15}$/, "A GSTIN is 15 characters.")
      .refine((v) => v === "" || GSTIN.test(v), "That isn't a valid GSTIN.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    isDefault: z.boolean().default(false),
  })
  .refine((a) => !a.gstin || a.gstin.slice(0, 2) === a.stateCode, { path: ["gstin"], message: "The GSTIN belongs to another state." });

export type PartyAddressInputModel = z.infer<typeof partyAddressInputModel>;

// the party itself; lengths follow parties: name 150, short name 20, phone 20, email 254, PAN 10. The short name
// ("SRT" for Sri Ramswamy Traders) is kept in capitals and is what ledgers and lists show
export const shortNameModel = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9 &.-]{0,19}$/, "Up to 20 letters or digits (spaces, & . - allowed).");

export const partyDetailsInputModel = z.object({
  name: z.string().trim().min(1).max(150),
  shortName: shortNameModel,
  type: partyTypeModel,
  phone: z
    .string()
    .trim()
    .regex(/^\d{0,20}$/, "Digits only, up to 20.")
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
  remarks: optionalText(500),
});

export type PartyDetailsInputModel = z.infer<typeof partyDetailsInputModel>;

// a new party with its addresses (up to 10); its opening balance is set on the Opening balances page
export const createPartyInputModel = z.object({
  details: partyDetailsInputModel,
  addresses: z.array(partyAddressInputModel).max(10).default([]),
});

export type CreatePartyInputModel = z.infer<typeof createPartyInputModel>;

// the full set of addresses replaces the old one: kept ones carry their id, new ones none, and the ones left out
// are retired (kept for the sales and purchases that used them)
export const updatePartyInputModel = createPartyInputModel.extend({ id: idModel });

export type UpdatePartyInputModel = z.infer<typeof updatePartyInputModel>;

export const partyIdInputModel = z.object({ id: idModel });

export type PartyIdInputModel = z.infer<typeof partyIdInputModel>;

// the lists: one type (Debtors = customers, Creditors = suppliers, Debtor-creditors = both), active only unless
// asked, and a search over name and phone
export const listPartiesInputModel = z.object({
  type: partyTypeModel.optional(),
  includeInactive: z.boolean().default(false),
  search: z.string().trim().max(150).default(""),
});

export type ListPartiesInputModel = z.infer<typeof listPartiesInputModel>;

export const setPartyActiveInputModel = z.object({ id: idModel, isActive: z.boolean() });

export type SetPartyActiveInputModel = z.infer<typeof setPartyActiveInputModel>;

export const partyAddressModel = z.object({
  id: idModel,
  label: z.string().nullable(),
  addressType: z.enum(["billing", "shipping", "both", "registered"]),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  landmark: z.string().nullable(),
  city: z.string(),
  district: z.string(),
  state: z.string(),
  stateCode: stateCodeModel,
  postalCode: z.string(),
  gstin: z.string().nullable(),
  isDefault: z.boolean(),
});

// a row in a party list: who, how to reach them, where (the default address's city), and the balance
export const partySummaryModel = z.object({
  id: idModel,
  ledgerId: idModel,
  name: z.string(),
  shortName: z.string(),
  type: partyTypeModel,
  phone: z.string().nullable(),
  city: z.string().nullable(),
  gstin: z.string().nullable(),
  isActive: z.boolean(),
  balance: ledgerBalanceModel,
});

export type PartySummaryModel = z.infer<typeof partySummaryModel>;

// one party in full: its details, addresses, opening balance, and what's still pending with it
export const partyModel = partySummaryModel.extend({
  countryCode: z.string(),
  email: z.string().nullable(),
  pan: z.string().nullable(),
  remarks: z.string().nullable(),
  addresses: z.array(partyAddressModel),
  openingBalance: savedOpeningBalanceModel.nullable(),
  // whether anything besides the opening balance has been posted (then the opening balance is fixed)
  hasEntries: z.boolean(),
  insights: z.object({
    // transactions with this party (its opening balance and cancelled ones aside)
    transactions: z.number().int(),
    // sale and purchase orders still waiting on it
    pendingOrders: z.number().int(),
    // how long money owed takes to be settled, in days: what a customer owes us until it is received, what we owe
    // a supplier until it is paid. Settled oldest first (no bill-wise matching), weighted by amount; null until
    // something has been settled
    averageDays: z.number().int().nullable(),
    // transactions a month, since its first one
    perMonth: z.number(),
  }),
});

export type PartyModel = z.infer<typeof partyModel>;
