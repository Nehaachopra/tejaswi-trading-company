import { TRPCError } from "@trpc/server";
import { db, eq } from "@repo/database";
import { settingsTable } from "@repo/database/schema";

import type { Tx } from "../stock/engine";
import {
  financialYear,
  type SetTaxAuditInputModel,
  setTaxAuditInputModel,
  type SetTds194qInputModel,
  setTds194qInputModel,
  SETTINGS,
  type SettingKey,
  type SettingValue,
  type SettingsPageModel,
} from "./model";

// what a setting is when it was never saved; the company has none (it's seeded: pnpm --filter @repo/database seed:settings)
const DEFAULTS: { [K in SettingKey]: SettingValue<K> | null } = {
  company: null,
  tds194qYears: [],
  taxAuditYears: [],
};

// the website's settings, each a row of its own, read and saved in the shape its key says
export default class SettingService {
  // one setting, from the database or inside a save
  async get<K extends SettingKey>(key: K, q: Pick<Tx, "select"> = db): Promise<SettingValue<K>> {
    const [row] = await q.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, key));
    if (row) return SETTINGS[key].parse(row.value) as SettingValue<K>;
    const fallback = DEFAULTS[key];
    if (fallback === null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `The ${key} setting hasn't been saved yet.` });
    return fallback as SettingValue<K>;
  }

  async set<K extends SettingKey>(key: K, value: SettingValue<K>, q: Pick<Tx, "insert"> = db) {
    const checked = SETTINGS[key].parse(value);
    await q.insert(settingsTable).values({ key, value: checked }).onConflictDoUpdate({ target: settingsTable.key, set: { value: checked, updatedAt: new Date() } });
  }

  // the Settings page: this financial year, and which TDS it has
  async page(): Promise<SettingsPageModel> {
    const year = financialYear(new Date()).name;
    const [audit, q] = await Promise.all([this.get("taxAuditYears"), this.get("tds194qYears")]);
    return { financialYear: year, taxAudit: audit.includes(year), tds194q: q.includes(year) };
  }

  // whether a moment's financial year has TDS on rent, contract work and brokerage: turnover above ₹1 crore last year
  // (above ₹10 crore counts too)
  async taxAuditIn(q: Pick<Tx, "select">, at: Date) {
    const year = financialYear(at).name;
    const [audit, tds194q] = await Promise.all([this.get("taxAuditYears", q), this.get("tds194qYears", q)]);
    return audit.includes(year) || tds194q.includes(year);
  }

  // a financial year turned on or off in one of the year lists (other years keep theirs)
  private async setYear(key: "tds194qYears" | "taxAuditYears", on: boolean) {
    const year = financialYear(new Date()).name;
    await db.transaction(async (tx) => {
      const years = (await this.get(key, tx)).filter((y) => y !== year);
      await this.set(key, on ? [...years, year].sort() : years, tx);
    });
  }

  // TDS on suppliers on or off for this financial year; on means above ₹1 crore as well
  async setTds194q(rawInput: SetTds194qInputModel): Promise<SettingsPageModel> {
    const input = setTds194qInputModel.parse(rawInput);
    await this.setYear("tds194qYears", input.on);
    if (input.on) await this.setYear("taxAuditYears", true);
    return this.page();
  }

  // TDS on rent, contract work and brokerage on or off for this financial year; off turns ₹10 crore off too
  async setTaxAudit(rawInput: SetTaxAuditInputModel): Promise<SettingsPageModel> {
    const input = setTaxAuditInputModel.parse(rawInput);
    await this.setYear("taxAuditYears", input.on);
    if (!input.on) await this.setYear("tds194qYears", false);
    return this.page();
  }
}
