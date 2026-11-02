import { z } from "zod";

// our own details, as every invoice and voucher heads them
export const companyModel = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  email: z.string(),
  state: z.string(),
  stateCode: z.string(),
  gstin: z.string(),
  fssai: z.string(),
  jurisdiction: z.string(),
});

// a financial year's name: "2026-27"
const yearModel = z.string().regex(/^\d{4}-\d{2}$/);

// each setting's key and the shape of its value
export const SETTINGS = {
  company: companyModel,
  tds194qYears: z.array(yearModel),
  // the financial years our last year's turnover was above ₹1 crore (a proprietor's tax audit limit): TDS on rent,
  // contract work and brokerage
  taxAuditYears: z.array(yearModel),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]>;

// a moment's financial year (April to March, in India): its name ("2026-27") and when it began
export function financialYear(at: Date) {
  const day = new Date(at.getTime() + 5.5 * 3_600_000);
  const y = day.getUTCMonth() >= 3 ? day.getUTCFullYear() : day.getUTCFullYear() - 1;
  return { name: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, start: new Date(`${y}-04-01T00:00:00+05:30`) };
}

// the Settings page: this financial year, whether last year's turnover was above ₹1 crore (TDS on rent, transport,
// labour and brokerage) and above ₹10 crore (TDS on suppliers too, section 194Q)
export const settingsPageModel = z.object({
  financialYear: z.string(),
  taxAudit: z.boolean(),
  tds194q: z.boolean(),
});

export type SettingsPageModel = z.infer<typeof settingsPageModel>;

export const setTds194qInputModel = z.object({ on: z.boolean() });

export type SetTds194qInputModel = z.infer<typeof setTds194qInputModel>;

export const setTaxAuditInputModel = z.object({ on: z.boolean() });

export type SetTaxAuditInputModel = z.infer<typeof setTaxAuditInputModel>;
