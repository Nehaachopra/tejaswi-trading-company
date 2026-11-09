import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray, isNotNull, sql } from "@repo/database";
import { godownsTable, ledgersTable, partiesTable, partyAddressesTable, partyUpiIdsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import type { Tx } from "../stock/engine";
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

// a landlord is a party of type landlord, with its ledger (the rent owed to them) in Rent payable
const REFERENCE = "parties";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Landlord not found." });

const isUniqueViolation = (error: unknown) =>
  ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code === "23505";

// which unique rule a clash broke
const violated = (error: unknown) => ((error as { cause?: { constraint?: string } })?.cause ?? (error as { constraint?: string }))?.constraint ?? "";

// a clash, its message's start telling the screen which field it's about
function clash(error: unknown, d: LandlordInputModel) {
  if (!isUniqueViolation(error)) return error;
  const rule = violated(error);
  const message = rule.includes("phone") ? `Phone ${d.phone} is already another landlord's.` : `Short name ${d.shortName} is already used by another party.`;
  return new TRPCError({ code: "CONFLICT", message });
}

// a landlord's ledger name: its short name, or (without one) its full name in lowercase like other ledgers
const ledgerNameOf = (d: { shortName: string | null; name: string }) => d.shortName ?? d.name.trim().toLowerCase();

const isLandlord = eq(partiesTable.type, "landlord");

const byName = asc(sql`coalesce(${partiesTable.shortName}, upper(${partiesTable.name}))`);

// the party columns a landlord's details fill
const partyValues = (d: LandlordInputModel) => ({
  name: d.name,
  shortName: d.shortName,
  phone: d.phone,
  email: d.email,
  pan: d.pan,
  remarks: d.remarks,
});

// the people we pay rent to, added in Entities → Landlords and picked on a rented godown and a rent payment. Each is a
// party of type landlord, never a customer or supplier (someone who is also one has a separate party), with its own
// ledger in Rent payable, one address (needed with a GSTIN, which is kept on it) and one UPI ID
export default class LandlordService {
  constructor(private readonly accounts = new AccountsService()) {}

  // landlords with their address and UPI IDs
  private async withDetails(rows: (typeof partiesTable.$inferSelect)[]): Promise<LandlordModel[]> {
    const ids = rows.map((r) => r.id);
    const [addresses, upis] =
      ids.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .select()
              .from(partyAddressesTable)
              .where(and(inArray(partyAddressesTable.partyId, ids), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true))),
            db.select().from(partyUpiIdsTable).where(inArray(partyUpiIdsTable.partyId, ids)),
          ]);
    return rows.map((l) => {
      const a = addresses.find((x) => x.partyId === l.id);
      return {
        id: l.id,
        name: l.name,
        shortName: l.shortName,
        countryCode: l.countryCode,
        phone: l.phone,
        email: l.email,
        pan: l.pan,
        gstin: a?.gstin ?? null,
        remarks: l.remarks,
        isActive: l.isActive,
        address: a
          ? {
              id: a.id,
              label: a.label,
              addressType: a.addressType,
              addressLine1: a.addressLine1,
              addressLine2: a.addressLine2,
              landmark: a.landmark,
              city: a.city,
              district: a.district,
              state: a.state,
              stateCode: a.stateCode,
              postalCode: a.postalCode,
              gstin: a.gstin,
              isDefault: a.isDefault,
            }
          : null,
        upiIds: upis.filter((u) => u.partyId === l.id).map((u) => u.upiId),
      };
    });
  }

  // no other party may use this short name (it's a ledger name too)
  private async assertShortNameFree(tx: Tx, shortName: string | null, id?: string) {
    if (shortName === null) return;
    const [taken] = await tx
      .select({ id: partiesTable.id })
      .from(partiesTable)
      .where(and(eq(partiesTable.shortName, shortName), id ? sql`${partiesTable.id} <> ${id}` : undefined));
    if (taken) throw new TRPCError({ code: "CONFLICT", message: `Short name ${shortName} is already used by another party.` });
  }

  // no other landlord may use this GSTIN (a customer or supplier who is the same person may)
  private async assertGstinFree(tx: Tx, gstin: string | null, id?: string) {
    if (!gstin) return;
    const [taken] = await tx
      .select({ id: partiesTable.id })
      .from(partyAddressesTable)
      .innerJoin(partiesTable, eq(partiesTable.id, partyAddressesTable.partyId))
      .where(and(eq(partyAddressesTable.gstin, gstin), eq(partyAddressesTable.isActive, true), isLandlord, id ? sql`${partiesTable.id} <> ${id}` : undefined));
    if (taken) throw new TRPCError({ code: "CONFLICT", message: `GSTIN ${gstin} is already another landlord's.` });
  }

  // the one address: the old one retired and the new one saved as the default, with the landlord's GSTIN on it
  private async saveAddress(tx: Tx, partyId: string, d: LandlordInputModel) {
    if (d.address === undefined) return;
    await tx.update(partyAddressesTable).set({ isActive: false, isDefault: false }).where(eq(partyAddressesTable.partyId, partyId));
    if (!d.address) return;
    const a = d.address;
    await tx.insert(partyAddressesTable).values({
      partyId,
      label: null,
      addressType: "registered",
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2,
      landmark: a.landmark,
      city: a.city,
      district: a.district,
      state: a.state,
      stateCode: a.stateCode,
      postalCode: a.postalCode,
      gstin: d.gstin,
      isDefault: true,
      isActive: true,
    });
  }

  // the UPI IDs, as given (the old ones replaced)
  private async saveUpiIds(tx: Tx, partyId: string, upiIds: string[] | undefined) {
    if (upiIds === undefined) return;
    await tx.delete(partyUpiIdsTable).where(eq(partyUpiIdsTable.partyId, partyId));
    if (upiIds.length > 0) await tx.insert(partyUpiIdsTable).values(upiIds.map((upiId) => ({ partyId, upiId })));
  }

  async list(rawInput: ListLandlordsInputModel): Promise<LandlordModel[]> {
    const input = listLandlordsInputModel.parse(rawInput);
    const rows = await db
      .select()
      .from(partiesTable)
      .where(and(isLandlord, input.includeInactive ? undefined : eq(partiesTable.isActive, true)))
      .orderBy(byName);
    return this.withDetails(rows);
  }

  async pick(): Promise<LandlordPickModel[]> {
    const [rows, godowns, upis] = await Promise.all([
      db
        .select({ id: partiesTable.id, name: partiesTable.name, shortName: partiesTable.shortName, gstin: partyAddressesTable.gstin })
        .from(partiesTable)
        .leftJoin(partyAddressesTable, and(eq(partyAddressesTable.partyId, partiesTable.id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)))
        .where(and(isLandlord, eq(partiesTable.isActive, true)))
        .orderBy(byName),
      // their active godowns, each with its rent for a month, however often it's paid
      db
        .select({ id: godownsTable.id, name: godownsTable.godownName, landlordId: godownsTable.landlordId, rent: godownsTable.rent, every: godownsTable.rentTimingInMonths })
        .from(godownsTable)
        .where(and(eq(godownsTable.isActive, true), isNotNull(godownsTable.landlordId)))
        .orderBy(asc(godownsTable.godownName)),
      // their UPI IDs, for the rent payment's QR
      db
        .select({ partyId: partyUpiIdsTable.partyId, upiId: partyUpiIdsTable.upiId })
        .from(partyUpiIdsTable)
        .innerJoin(partiesTable, and(eq(partiesTable.id, partyUpiIdsTable.partyId), isLandlord)),
    ]);
    return rows.map((l) => ({
      ...l,
      upiIds: upis.filter((u) => u.partyId === l.id).map((u) => u.upiId),
      godowns: godowns
        .filter((g) => g.landlordId === l.id)
        .map((g) => ({ id: g.id, name: g.name, monthlyRent: Math.round((Number(g.rent ?? 0) / (g.every ?? 1)) * 100) / 100 })),
    }));
  }

  async get(input: LandlordIdInputModel): Promise<LandlordModel> {
    const [row] = await db.select().from(partiesTable).where(and(eq(partiesTable.id, input.id), isLandlord));
    if (!row) throw notFound();
    return (await this.withDetails([row]))[0]!;
  }

  // the landlord, its address, UPI ID and its ledger in Rent payable, saved together or not at all
  async create(rawInput: LandlordInputModel): Promise<LandlordModel> {
    const details = landlordInputModel.parse(rawInput);
    const id = await db
      .transaction(async (tx) => {
        await this.assertShortNameFree(tx, details.shortName);
        await this.assertGstinFree(tx, details.gstin);
        const [party] = await tx
          .insert(partiesTable)
          .values({ ...partyValues(details), type: "landlord", types: ["landlord"] })
          .returning({ id: partiesTable.id });
        await this.saveAddress(tx, party!.id, details);
        await this.saveUpiIds(tx, party!.id, details.upiIds);
        const master = await this.accounts.master(tx, "rentPayable");
        await tx.insert(ledgersTable).values({
          name: ledgerNameOf(details),
          ledgerMasterId: master.id,
          ledgerGroupId: master.ledgerGroupId,
          referenceTable: REFERENCE,
          referenceId: party!.id,
          balance: "0.00",
        });
        return party!.id;
      })
      .catch((error: unknown) => {
        throw clash(error, details);
      });
    return this.get({ id });
  }

  // new details, address and UPI ID; the ledger's name follows the short name
  async update(rawInput: UpdateLandlordInputModel): Promise<LandlordModel> {
    const { id, details } = updateLandlordInputModel.parse(rawInput);
    await db
      .transaction(async (tx) => {
        const [row] = await tx.select({ id: partiesTable.id }).from(partiesTable).where(and(eq(partiesTable.id, id), isLandlord)).for("update");
        if (!row) throw notFound();
        await this.assertShortNameFree(tx, details.shortName, id);
        await this.assertGstinFree(tx, details.gstin, id);
        await tx.update(partiesTable).set(partyValues(details)).where(eq(partiesTable.id, id));
        await this.saveAddress(tx, id, details);
        await this.saveUpiIds(tx, id, details.upiIds);
        const ledger = await this.accounts.ledgerOf(tx, REFERENCE, id);
        await tx.update(ledgersTable).set({ name: ledgerNameOf(details) }).where(eq(ledgersTable.id, ledger.id));
      })
      .catch((error: unknown) => {
        throw clash(error, details);
      });
    return this.get({ id });
  }

  // inactive only once no active godown is rented from them and no rent is owed to them; their ledger follows
  async setActive(rawInput: SetLandlordActiveInputModel): Promise<LandlordModel> {
    const input = setLandlordActiveInputModel.parse(rawInput);
    await db.transaction(async (tx) => {
      const [row] = await tx.select({ id: partiesTable.id }).from(partiesTable).where(and(eq(partiesTable.id, input.id), isLandlord)).for("update");
      if (!row) throw notFound();
      const [ledger] = await tx
        .select({ id: ledgersTable.id, balance: ledgersTable.balance })
        .from(ledgersTable)
        .where(and(eq(ledgersTable.referenceTable, REFERENCE), eq(ledgersTable.referenceId, input.id)))
        .for("update");
      if (!ledger) throw notFound();
      if (!input.isActive) {
        const [godown] = await tx.select({ id: godownsTable.id }).from(godownsTable).where(and(eq(godownsTable.landlordId, input.id), eq(godownsTable.isActive, true))).limit(1);
        if (godown) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A godown is still rented from this landlord." });
        if (Number(ledger.balance) !== 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Rent is still owed to this landlord. Pay it first." });
      }
      await tx.update(partiesTable).set({ isActive: input.isActive }).where(eq(partiesTable.id, input.id));
      await tx.update(ledgersTable).set({ isActive: input.isActive }).where(eq(ledgersTable.id, ledger.id));
    });
    return this.get({ id: input.id });
  }
}
