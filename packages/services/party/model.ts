import { TRPCError } from "@trpc/server";
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

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// the most a money column holds
const MONEY_MAX = 9_999_999_999_999;

// one address (line 1 may be empty; the town, district, state and PIN may not); lengths follow party_addresses: label 100, lines 200, landmark 150, city, district and state 100,
// PIN 6, GSTIN 15. A GSTIN's first two digits are the state's code
export const partyAddressInputModel = z
  .object({
    // an existing address being kept or changed; none for a new one
    id: idModel.optional(),
    label: optionalText(100),
    addressType: z.enum(["billing", "shipping", "both", "registered"]).default("both"),
    addressLine1: z.string().trim().max(200).default(""),
    addressLine2: optionalText(200),
    landmark: optionalText(150),
    city: z.string().trim().min(1).max(100).regex(/^\D*$/, "A town has no numbers."),
    district: z.string().trim().min(1).max(100).regex(/^\D*$/, "A district has no numbers."),
    state: z.string().trim().min(1).max(100),
    stateCode: stateCodeModel,
    postalCode: z.string().trim().regex(/^\d{6}$/, "A PIN code is 6 digits."),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^$|^.{15}$/, "A GSTIN is 15 characters.")
      .refine((v) => v === "" || GSTIN_PATTERN.test(v), "That isn't a valid GSTIN.")
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

// the short name is optional (without one the ledger goes by the full name); a sale or purchase that adds a party
// asks for it. The type is never typed in: the transactions set it
// a party's phone: a mobile (10 digits, starting 6-9) or a landline with its STD code (starting 0, 11 or 12 digits);
// every party has one, and no two share it
export const PHONE_PATTERN = /^([6-9]\d{9}|0\d{10,11})$/;

export const partyDetailsInputModel = z.object({
  // a full name has no digits (the short name may: "SRT2")
  name: z.string().trim().min(1).max(150).regex(/^\D*$/, "A name has no numbers."),
  shortName: shortNameModel.nullable().default(null),
  phone: z.string().trim().regex(PHONE_PATTERN, "A 10-digit mobile, or a landline with its STD code."),
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
  // a small transporter's declaration (10 or fewer goods carriages, PAN given): no TDS on its transport
  transportDeclaration: z.boolean().default(false),
});

export type PartyDetailsInputModel = z.infer<typeof partyDetailsInputModel>;

// the details as saved; `needsShortName` when the party is added from a sale or purchase
export function settledDetails<T extends { shortName: string | null }>(d: T, needsShortName = false): T {
  if (needsShortName && !d.shortName) throw new TRPCError({ code: "BAD_REQUEST", message: "A party added from a sale or purchase needs a short name." });
  return d;
}

// what was paid this financial year outside this website, with the TDS taken from it; it counts towards TDS limits
export const partyPaidBeforeModel = z
  .object({ paid: z.number().nonnegative().max(MONEY_MAX), tds: z.number().nonnegative().max(MONEY_MAX) })
  .refine((p) => p.tds <= p.paid, { path: ["tds"], message: "TDS can't be more than what was paid." });

// a new party with its addresses (up to 10); its opening balance is set on the Opening balances page. Left out, what
// was paid before stays as it is
export const createPartyInputModel = z.object({
  details: partyDetailsInputModel,
  addresses: z.array(partyAddressInputModel).max(10).default([]),
  paidBefore: partyPaidBeforeModel.optional(),
});

export type CreatePartyInputModel = z.infer<typeof createPartyInputModel>;

// someone paid under a head where a phone isn't needed (legal and professional fees): the same, with the phone optional
export const createPayeeInputModel = createPartyInputModel.extend({
  details: partyDetailsInputModel.extend({
    phone: z
      .string()
      .trim()
      .refine((v) => v === "" || PHONE_PATTERN.test(v), "A 10-digit mobile, or a landline with its STD code.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
  }),
});

export type CreatePayeeInputModel = z.infer<typeof createPayeeInputModel>;

// the full set of addresses replaces the old one: kept ones carry their id, new ones none, and the ones left out
// are retired (kept for the sales and purchases that used them)
export const updatePartyInputModel = createPartyInputModel.extend({ id: idModel });

export type UpdatePartyInputModel = z.infer<typeof updatePartyInputModel>;

export const partyIdInputModel = z.object({ id: idModel });

export type PartyIdInputModel = z.infer<typeof partyIdInputModel>;

// the lists: one type (customers, suppliers, both, or "none" for parties with no sale or purchase yet), active only
// unless asked, and a search over name and phone
export const listPartiesInputModel = z.object({
  type: z.enum(["customer", "supplier", "both", "none"]).optional(),
  includeInactive: z.boolean().default(false),
  search: z.string().trim().max(150).default(""),
});

export type ListPartiesInputModel = z.infer<typeof listPartiesInputModel>;

export const setPartyActiveInputModel = z.object({ id: idModel, isActive: z.boolean() });

// a PIN code already saved on an address: its town, district and state, to fill a new address with
// before a party is added or renamed: others with the same name in the same town (to confirm it isn't the same one
// again), and whether its short name is free, with the first free one like it ("ST" taken → "ST2")
export const partyNameCheckInputModel = z.object({
  name: z.string().trim().max(150).default(""),
  city: z.string().trim().max(100).default(""),
  shortName: z.string().trim().toUpperCase().max(20).default(""),
  // the party being edited, which doesn't clash with itself
  exceptId: idModel.nullable().default(null),
});

export type PartyNameCheckInputModel = z.infer<typeof partyNameCheckInputModel>;

export const partyNameCheckModel = z.object({
  sameInTown: z.array(z.object({ name: z.string(), shortName: z.string().nullable(), phone: z.string().nullable(), city: z.string() })),
  shortNameTaken: z.boolean(),
  freeShortName: z.string(),
});

export type PartyNameCheckModel = z.infer<typeof partyNameCheckModel>;

export const pinPlaceInputModel = z.object({ postalCode: z.string().trim().regex(/^\d{6}$/, "A PIN code is 6 digits.") });

export type PinPlaceInputModel = z.infer<typeof pinPlaceInputModel>;

export const pinPlaceModel = z
  .object({ city: z.string(), district: z.string(), state: z.string(), stateCode: stateCodeModel })
  .nullable();

export type PinPlaceModel = z.infer<typeof pinPlaceModel>;

// a town already on a saved address: the PIN used with it most, to fill a new address with when no PIN is typed
export const townPinInputModel = z.object({ city: z.string().trim().min(1).max(100) });

export type TownPinInputModel = z.infer<typeof townPinInputModel>;

export const townPinModel = z.object({ postalCode: z.string(), district: z.string(), state: z.string(), stateCode: stateCodeModel }).nullable();

export type TownPinModel = z.infer<typeof townPinModel>;

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
  shortName: z.string().nullable(),
  // set by its sales and purchases; null until the first
  type: partyTypeModel.nullable(),
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
  transportDeclaration: z.boolean(),
  addresses: z.array(partyAddressModel),
  // this financial year's, null when none was typed
  paidBefore: z.object({ paid: z.number(), tds: z.number() }).nullable(),
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
