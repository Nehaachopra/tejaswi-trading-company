import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, isNotNull, sql } from "@repo/database";
import { godownsTable, landlordsTable } from "@repo/database/schema";

import {
  type LandlordIdInputModel,
  type LandlordInputModel,
  type LandlordModel,
  type LandlordPickModel,
  landlordInputModel,
  type ListLandlordsInputModel,
  listLandlordsInputModel,
  type SetLandlordActiveInputModel,
  setLandlordActiveInputModel,
  type UpdateLandlordInputModel,
  updateLandlordInputModel,
} from "./model";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Landlord not found." });

const isUniqueViolation = (error: unknown) =>
  ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code === "23505";

// which unique rule a clash broke
const violated = (error: unknown) => ((error as { cause?: { constraint?: string } })?.cause ?? (error as { constraint?: string }))?.constraint ?? "";

// a clash, its message's start telling the screen which field it's about
function clash(error: unknown, d: LandlordInputModel) {
  if (!isUniqueViolation(error)) return error;
  const rule = violated(error);
  const message = rule.includes("phone")
    ? `Phone ${d.phone} is already another landlord's.`
    : rule.includes("gstin")
      ? `GSTIN ${d.gstin} is already another landlord's.`
      : `Short name ${d.shortName} is already used by another landlord.`;
  return new TRPCError({ code: "CONFLICT", message });
}

const summary = (l: typeof landlordsTable.$inferSelect): LandlordModel => ({
  id: l.id,
  name: l.name,
  shortName: l.shortName,
  countryCode: l.countryCode,
  phone: l.phone,
  email: l.email,
  pan: l.pan,
  gstin: l.gstin,
  remarks: l.remarks,
  isActive: l.isActive,
});

const byName = asc(sql`coalesce(${landlordsTable.shortName}, upper(${landlordsTable.name}))`);

// the people we pay rent to, added in Entities and picked on a rented godown and a rent payment. They aren't parties:
// someone who is also a debtor or creditor has a separate party entry
export default class LandlordService {
  async list(rawInput: ListLandlordsInputModel): Promise<LandlordModel[]> {
    const input = listLandlordsInputModel.parse(rawInput);
    const rows = await db.select().from(landlordsTable).where(input.includeInactive ? undefined : eq(landlordsTable.isActive, true)).orderBy(byName);
    return rows.map(summary);
  }

  async pick(): Promise<LandlordPickModel[]> {
    const [rows, godowns] = await Promise.all([
      db.select({ id: landlordsTable.id, name: landlordsTable.name, shortName: landlordsTable.shortName, gstin: landlordsTable.gstin }).from(landlordsTable).where(eq(landlordsTable.isActive, true)).orderBy(byName),
      // their active godowns, each with its rent for a month, however often it's paid
      db
        .select({ id: godownsTable.id, name: godownsTable.godownName, landlordId: godownsTable.landlordId, rent: godownsTable.rent, every: godownsTable.rentTimingInMonths })
        .from(godownsTable)
        .where(and(eq(godownsTable.isActive, true), isNotNull(godownsTable.landlordId)))
        .orderBy(asc(godownsTable.godownName)),
    ]);
    return rows.map((l) => ({
      ...l,
      godowns: godowns
        .filter((g) => g.landlordId === l.id)
        .map((g) => ({ id: g.id, name: g.name, monthlyRent: Math.round((Number(g.rent ?? 0) / (g.every ?? 1)) * 100) / 100 })),
    }));
  }

  async get(input: LandlordIdInputModel): Promise<LandlordModel> {
    const [row] = await db.select().from(landlordsTable).where(eq(landlordsTable.id, input.id));
    if (!row) throw notFound();
    return summary(row);
  }

  async create(rawInput: LandlordInputModel): Promise<LandlordModel> {
    const details = landlordInputModel.parse(rawInput);
    const [row] = await db.insert(landlordsTable).values(details).returning().catch((error: unknown) => {
      throw clash(error, details);
    });
    return summary(row!);
  }

  async update(rawInput: UpdateLandlordInputModel): Promise<LandlordModel> {
    const { id, details } = updateLandlordInputModel.parse(rawInput);
    const [row] = await db.update(landlordsTable).set(details).where(eq(landlordsTable.id, id)).returning().catch((error: unknown) => {
      throw clash(error, details);
    });
    if (!row) throw notFound();
    return summary(row);
  }

  // inactive only once no active godown is rented from them
  async setActive(rawInput: SetLandlordActiveInputModel): Promise<LandlordModel> {
    const input = setLandlordActiveInputModel.parse(rawInput);
    if (!input.isActive) {
      const [godown] = await db.select({ id: godownsTable.id }).from(godownsTable).where(and(eq(godownsTable.landlordId, input.id), eq(godownsTable.isActive, true))).limit(1);
      if (godown) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A godown is still rented from this landlord." });
    }
    const [row] = await db.update(landlordsTable).set({ isActive: input.isActive }).where(eq(landlordsTable.id, input.id)).returning();
    if (!row) throw notFound();
    return summary(row);
  }
}
