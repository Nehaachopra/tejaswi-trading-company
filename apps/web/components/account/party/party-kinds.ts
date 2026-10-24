import type { Head } from "../balance";

export type PartyType = "customer" | "supplier" | "both";

// the three party lists: which type each holds, where it lives, the head its ledgers sit under, and its
// sub-group's key (as /account and the sidebar know it)
export const PARTY_KINDS = {
  customer: { path: "/account/debtor", head: "asset", master: "debtors" },
  supplier: { path: "/account/creditor", head: "liability", master: "creditors" },
  both: { path: "/account/debtor-creditor", head: "asset", master: "debtorCreditors" },
} as const satisfies Record<PartyType, { path: string; head: Head; master: string }>;

// the GST states: code (the first two digits of a GSTIN) and name
export const GST_STATES = [
  ["01", "Jammu & Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["26", "Dadra & Nagar Haveli and Daman & Diu"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman & Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
  ["97", "Other Territory"],
  ["99", "Centre Jurisdiction"],
] as const;

export type StateCode = (typeof GST_STATES)[number][0];

// a state's code from its name as the PIN directory writes it ("Karnataka", "Delhi" ...)
export const stateCodeOf = (name: string) => GST_STATES.find(([, n]) => n.toLowerCase() === name.trim().toLowerCase())?.[0] ?? null;
