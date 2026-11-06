import { TRPCError } from "@trpc/server";
import { asPartyType } from "./model";
import { and, asc, count, db, desc, eq, ilike, inArray, isNull, ne, notInArray, or, type SQL, sql } from "@repo/database";
import {
  ledgerEntriesTable,
  ledgersTable,
  partiesTable,
  partyAddressesTable,
  partyPaidBeforeTable, partyUpiIdsTable,
  purchaseOrdersTable,
  saleOrdersTable,
  transactionsTable,
} from "@repo/database/schema";

import AccountsService from "../accounts";
import { toPaise } from "../accounts/money";
import type { ActorModel } from "../accounts/model";
import { financialYear } from "../setting/model";
import type { Tx } from "../stock/engine";
import {
  type CreatePartyInputModel,
  createPartyInputModel,
  type CreatePayeeInputModel,
  createPayeeInputModel,
  type ListPartiesInputModel,
  listPartiesInputModel,
  type PartyAddressInputModel,
  type PartyIdInputModel,
  type PartyModel,
  type PartySummaryModel,
  type PartyTypeModel,
  type PinPlaceInputModel,
  type PinPlaceModel,
  type TownPinInputModel,
  townPinInputModel,
  type TownPinModel,
  type SetPartyActiveInputModel,
  setPartyActiveInputModel,
  type UpdatePartyInputModel,
  updatePartyInputModel,
  settledDetails,
  partyNameCheckInputModel,
  type PartyNameCheckInputModel,
  type PartyNameCheckModel,
} from "./model";

const REFERENCE = "parties";

const DAY_MS = 24 * 60 * 60 * 1000;

// the sub-group a party's one ledger sits under, by its type
const MASTER = { customer: "debtors", supplier: "creditors", customer_supplier: "debtorCreditors" } as const;

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Party not found." });
// the short name is taken; the message's start tells the screen which field it's about
// a party's ledger name: its short name, or (without one) its full name in lowercase like other ledgers
const ledgerNameOf = (d: { shortName: string | null; name: string }) => d.shortName ?? d.name.trim().toLowerCase();

const shortNameTaken = (shortName: string | null) => new TRPCError({ code: "CONFLICT", message: `Short name ${shortName} is already used by another party.` });

// the phone is someone else's: who, so the screen can say (the message's start tells it which field)
const phoneTaken = (phone: string, owner: string) => new TRPCError({ code: "CONFLICT", message: `Phone ${phone} is already ${owner}'s.` });

const isUniqueViolation = (error: unknown) =>
  ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code === "23505";

// which unique rule a clash broke (the phone's or the short name's)
const violated = (error: unknown) => ((error as { cause?: { constraint?: string } })?.cause ?? (error as { constraint?: string }))?.constraint ?? "";

// what the party table and its address rows hold, from the input
const addressValues = (partyId: string, a: PartyAddressInputModel) => ({
  partyId,
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
  isActive: true,
});

// customers, suppliers and parties who are both: each has one ledger (Debtors, Creditors or Debtor-creditors by
// its type, set by its sales and purchases; Parties until the first), opened with its opening balance in the same save. A GSTIN belongs to one party only; a party is
// made inactive only at a zero balance with no pending orders
export default class PartyService {
  constructor(private readonly accounts = new AccountsService()) {}

  // one default address among the kept ones: the one marked, or else the first
  private withDefault(addresses: PartyAddressInputModel[]) {
    const marked = addresses.findIndex((a) => a.isDefault);
    return addresses.map((a, i) => ({ ...a, isDefault: i === (marked === -1 ? 0 : marked) }));
  }

  // no other party may use these GSTINs
  private async assertGstinsFree(tx: Tx, addresses: PartyAddressInputModel[], partyId?: string) {
    const gstins = [...new Set(addresses.map((a) => a.gstin).filter((g): g is string => !!g))];
    if (gstins.length === 0) return;
    const [clash] = await tx
      .select({ gstin: partyAddressesTable.gstin, name: partiesTable.name })
      .from(partyAddressesTable)
      .innerJoin(partiesTable, eq(partiesTable.id, partyAddressesTable.partyId))
      .where(and(inArray(partyAddressesTable.gstin, gstins), eq(partyAddressesTable.isActive, true), partyId ? ne(partyAddressesTable.partyId, partyId) : undefined));
    if (clash) throw new TRPCError({ code: "CONFLICT", message: `GSTIN ${clash.gstin} already belongs to ${clash.name}.` });
  }

  // no other party may use this short name
  // one phone, one party
  private async assertPhoneFree(tx: Tx, phone: string | null, partyId?: string) {
    if (!phone) return;
    const [clash] = await tx
      .select({ name: partiesTable.name, shortName: partiesTable.shortName })
      .from(partiesTable)
      .where(and(eq(partiesTable.phone, phone), partyId ? ne(partiesTable.id, partyId) : undefined));
    if (clash) throw phoneTaken(phone, clash.shortName ?? clash.name);
  }

  private async assertShortNameFree(tx: Tx, shortName: string | null, partyId?: string) {
    if (shortName === null) return;
    const [clash] = await tx
      .select({ id: partiesTable.id })
      .from(partiesTable)
      .where(and(eq(partiesTable.shortName, shortName), partyId ? ne(partiesTable.id, partyId) : undefined));
    if (clash) throw shortNameTaken(shortName);
  }

  // what was paid this financial year outside this website: kept, replaced, or gone when it's cleared to nothing
  // the party's UPI IDs, as given (the old ones replaced); left out, they stay as they are
  private async saveUpiIds(tx: Tx, partyId: string, upiIds: string[] | undefined) {
    if (upiIds === undefined) return;
    await tx.delete(partyUpiIdsTable).where(eq(partyUpiIdsTable.partyId, partyId));
    if (upiIds.length > 0) await tx.insert(partyUpiIdsTable).values(upiIds.map((upiId) => ({ partyId, upiId })));
  }

  private async savePaidBefore(tx: Tx, partyId: string, paidBefore: CreatePartyInputModel["paidBefore"]) {
    if (!paidBefore) return;
    const year = financialYear(new Date()).name;
    if (paidBefore.paid === 0) {
      await tx.delete(partyPaidBeforeTable).where(and(eq(partyPaidBeforeTable.partyId, partyId), eq(partyPaidBeforeTable.financialYear, year)));
      return;
    }
    const amounts = { paid: paidBefore.paid.toFixed(2), tds: paidBefore.tds.toFixed(2) };
    await tx
      .insert(partyPaidBeforeTable)
      .values({ partyId, financialYear: year, ...amounts })
      .onConflictDoUpdate({ target: [partyPaidBeforeTable.partyId, partyPaidBeforeTable.financialYear], set: { ...amounts, updatedAt: new Date() } });
  }

  // the parties with their ledgers and balances
  private async summaries(where: SQL | undefined) {
    const rows = await db
      .select({ party: partiesTable, ledgerId: ledgersTable.id })
      .from(partiesTable)
      .innerJoin(ledgersTable, and(eq(ledgersTable.referenceTable, REFERENCE), eq(ledgersTable.referenceId, partiesTable.id)))
      .where(where)
      .orderBy(asc(sql`coalesce(${partiesTable.shortName}, upper(${partiesTable.name}))`));
    const ids = rows.map((r) => r.party.id);
    const [balances, defaults] = await Promise.all([
      this.accounts.balances(rows.map((r) => r.ledgerId)),
      ids.length === 0
        ? []
        : db
            .select({ partyId: partyAddressesTable.partyId, city: partyAddressesTable.city, gstin: partyAddressesTable.gstin })
            .from(partyAddressesTable)
            .where(and(inArray(partyAddressesTable.partyId, ids), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true))),
    ]);
    const defaultOf = new Map(defaults.map((d) => [d.partyId, d]));
    return rows.map(({ party: p, ledgerId }) => ({
      row: p,
      summary: {
        id: p.id,
        ledgerId,
        name: p.name,
        shortName: p.shortName,
        type: asPartyType(p.type),
        phone: p.phone,
        city: defaultOf.get(p.id)?.city ?? null,
        gstin: defaultOf.get(p.id)?.gstin ?? null,
        isActive: p.isActive,
        balance: balances.get(ledgerId)!,
      } satisfies PartySummaryModel,
    }));
  }

  async list(rawInput: ListPartiesInputModel): Promise<PartySummaryModel[]> {
    const input = listPartiesInputModel.parse(rawInput);
    const search = input.search ? `%${input.search.replace(/[%_\\]/g, "\\$&")}%` : null;
    const rows = await this.summaries(
      and(
        // landlords are listed in Entities → Landlords, never with parties
        input.type === "none" ? isNull(partiesTable.type) : input.type ? eq(partiesTable.type, input.type) : or(isNull(partiesTable.type), ne(partiesTable.type, "landlord")),
        input.includeInactive ? undefined : eq(partiesTable.isActive, true),
        search ? or(ilike(partiesTable.shortName, search), ilike(partiesTable.name, search), ilike(partiesTable.phone, search)) : undefined,
      ),
    );
    return rows.map((r) => r.summary);
  }

  // orders still waiting on this party
  private async pendingOrders(q: Pick<Tx, "select">, partyId: string) {
    const [[sale], [purchase]] = await Promise.all([
      q.select({ n: count() }).from(saleOrdersTable).where(and(eq(saleOrdersTable.partyId, partyId), eq(saleOrdersTable.status, "pending"))),
      q.select({ n: count() }).from(purchaseOrdersTable).where(and(eq(purchaseOrdersTable.partyId, partyId), eq(purchaseOrdersTable.status, "pending"))),
    ]);
    return (sale?.n ?? 0) + (purchase?.n ?? 0);
  }

  // how this party deals with us: its transactions, how long its dues take to settle, and how often it trades
  private async insights(ledgerId: string, type: PartyTypeModel | null, pendingOrders: number): Promise<PartyModel["insights"]> {
    // each active transaction's net effect on the ledger, on its own date, up to today (an edit that posted again
    // still counts once; a cancelled one not at all)
    const rows = await db
      .select({
        type: transactionsTable.type,
        at: transactionsTable.dateTime,
        net: sql<string>`sum(case when ${ledgerEntriesTable.transactionType} = 'debit' then ${ledgerEntriesTable.amount} else -${ledgerEntriesTable.amount} end)`,
      })
      .from(ledgerEntriesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, ledgerEntriesTable.transactionId))
      .where(and(eq(ledgerEntriesTable.ledgerId, ledgerId), eq(transactionsTable.status, "active"), sql`${transactionsTable.dateTime} <= now()`))
      .groupBy(transactionsTable.id)
      .orderBy(asc(transactionsTable.dateTime), asc(transactionsTable.createdAt));

    const dealt = rows.filter((r) => r.type !== "opening_balance" && toPaise(r.net) !== 0);
    const first = dealt[0]?.at;
    const months = first ? Math.max(1, (Date.now() - first.getTime()) / (DAY_MS * 30.44)) : 1;

    // dues settle oldest first: a customer's debits are what it owes, its credits settle them; a supplier the
    // other way round
    const owes = type === "supplier" ? -1 : 1;
    const open: { paise: number; at: Date }[] = [];
    let settledPaise = 0;
    let weightedDays = 0;
    for (const r of rows) {
      let paise = owes * toPaise(r.net);
      if (paise > 0) {
        open.push({ paise, at: r.at! });
        continue;
      }
      paise = -paise;
      while (paise > 0 && open.length > 0) {
        const due = open[0]!;
        const part = Math.min(due.paise, paise);
        weightedDays += part * Math.max(0, (r.at!.getTime() - due.at.getTime()) / DAY_MS);
        settledPaise += part;
        due.paise -= part;
        paise -= part;
        if (due.paise === 0) open.shift();
      }
    }

    return {
      transactions: dealt.length,
      pendingOrders,
      averageDays: settledPaise > 0 ? Math.round(weightedDays / settledPaise) : null,
      perMonth: Math.round((dealt.length / months) * 10) / 10,
    };
  }

  // others with this name in this town (any case), and whether the short name is free with the first free one like it
  async nameCheck(rawInput: PartyNameCheckInputModel): Promise<PartyNameCheckModel> {
    const input = partyNameCheckInputModel.parse(rawInput);
    const notThis = input.exceptId ? ne(partiesTable.id, input.exceptId) : undefined;
    const sameInTown =
      input.name && input.city
        ? await db
            .selectDistinct({ name: partiesTable.name, shortName: partiesTable.shortName, phone: partiesTable.phone, city: partyAddressesTable.city })
            .from(partiesTable)
            .innerJoin(partyAddressesTable, and(eq(partyAddressesTable.partyId, partiesTable.id), eq(partyAddressesTable.isActive, true)))
            .where(and(sql`lower(${partiesTable.name}) = lower(${input.name})`, sql`lower(${partyAddressesTable.city}) = lower(${input.city})`, notThis))
            .limit(3)
        : [];
    // the short names already used that start like this one
    let freeShortName = input.shortName;
    let shortNameTaken = false;
    if (input.shortName) {
      const like = await db
        .select({ shortName: partiesTable.shortName })
        .from(partiesTable)
        .where(and(ilike(partiesTable.shortName, `${input.shortName.slice(0, 18)}%`), notThis));
      const taken = new Set(like.map((r) => r.shortName));
      shortNameTaken = taken.has(input.shortName);
      for (let n = 2; taken.has(freeShortName) && n < 1000; n++) freeShortName = input.shortName.slice(0, 20 - String(n).length) + n;
    }
    return { sameInTown, shortNameTaken, freeShortName };
  }

  // the town, district and state saved with this PIN code: the one most addresses with it agree on (the latest of
  // those on a tie), so one odd address doesn't win; null when no address has it
  async pinPlace(input: PinPlaceInputModel): Promise<PinPlaceModel> {
    const [place] = await db
      .select({
        city: partyAddressesTable.city,
        district: partyAddressesTable.district,
        state: partyAddressesTable.state,
        stateCode: partyAddressesTable.stateCode,
      })
      .from(partyAddressesTable)
      .where(and(eq(partyAddressesTable.postalCode, input.postalCode), eq(partyAddressesTable.isActive, true)))
      .groupBy(partyAddressesTable.city, partyAddressesTable.district, partyAddressesTable.state, partyAddressesTable.stateCode)
      .orderBy(desc(count()), desc(sql`max(${partyAddressesTable.updatedAt})`))
      .limit(1);
    return place ?? null;
  }

  // the other way round: the PIN a town was saved with most often, with its district and state
  async townPin(rawInput: TownPinInputModel): Promise<TownPinModel> {
    const input = townPinInputModel.parse(rawInput);
    const [place] = await db
      .select({
        postalCode: partyAddressesTable.postalCode,
        district: partyAddressesTable.district,
        state: partyAddressesTable.state,
        stateCode: partyAddressesTable.stateCode,
      })
      .from(partyAddressesTable)
      .where(and(sql`lower(${partyAddressesTable.city}) = ${input.city.toLowerCase()}`, eq(partyAddressesTable.isActive, true)))
      .groupBy(partyAddressesTable.postalCode, partyAddressesTable.district, partyAddressesTable.state, partyAddressesTable.stateCode)
      .orderBy(desc(count()), desc(sql`max(${partyAddressesTable.updatedAt})`))
      .limit(1);
    return place ? { ...place, stateCode: place.stateCode as NonNullable<TownPinModel>["stateCode"] } : null;
  }

  async get(input: PartyIdInputModel): Promise<PartyModel> {
    const [found] = await this.summaries(eq(partiesTable.id, input.id));
    if (!found) throw notFound();
    const { row: p, summary } = found;
    const [addresses, openingBalance, withEntries, pendingOrders, [paidBefore], upis] = await Promise.all([
      db
        .select()
        .from(partyAddressesTable)
        .where(and(eq(partyAddressesTable.partyId, p.id), eq(partyAddressesTable.isActive, true)))
        .orderBy(asc(partyAddressesTable.createdAt)),
      this.accounts.savedOpening(summary.ledgerId),
      this.accounts.withEntries([summary.ledgerId]),
      this.pendingOrders(db, p.id),
      db
        .select({ paid: partyPaidBeforeTable.paid, tds: partyPaidBeforeTable.tds })
        .from(partyPaidBeforeTable)
        .where(and(eq(partyPaidBeforeTable.partyId, p.id), eq(partyPaidBeforeTable.financialYear, financialYear(new Date()).name))),
      db.select({ upiId: partyUpiIdsTable.upiId }).from(partyUpiIdsTable).where(eq(partyUpiIdsTable.partyId, p.id)).orderBy(asc(partyUpiIdsTable.createdAt)),
    ]);
    return {
      ...summary,
      countryCode: p.countryCode,
      email: p.email,
      pan: p.pan,
      remarks: p.remarks,
      transportDeclaration: p.transportDeclaration,
      addresses: addresses.map((a) => ({
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
      })),
      paidBefore: paidBefore ? { paid: Number(paidBefore.paid), tds: Number(paidBefore.tds) } : null,
      upiIds: upis.map((u) => u.upiId),
      openingBalance,
      hasEntries: withEntries.has(summary.ledgerId),
      insights: await this.insights(summary.ledgerId, asPartyType(p.type), pendingOrders),
    };
  }

  // the ledger's sub-group and head for a party type (Parties until its first sale or purchase)
  private async placeFor(tx: Tx, type: PartyTypeModel | null) {
    const master = await this.accounts.master(tx, type ? MASTER[type] : "parties");
    return { ledgerMasterId: master.id, ledgerGroupId: master.ledgerGroupId };
  }

  // a new party, its addresses and its ledger, saved together or not at all (its opening balance is set on the
  // Opening balances page)
  async create(rawInput: CreatePartyInputModel, actor: ActorModel): Promise<PartyModel> {
    const input = createPartyInputModel.parse(rawInput);
    const { partyId } = await db.transaction((tx) => this.createIn(tx, input)).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw violated(error).includes("phone") ? phoneTaken(input.details.phone ?? "", "another party") : shortNameTaken(input.details.shortName);
      throw error;
    });
    return this.get({ id: partyId });
  }

  // the same, inside another save (a receipt from someone not in the app yet), so a failed save leaves no
  // party behind; gives the party and its ledger
  async createIn(tx: Tx, rawInput: CreatePartyInputModel | CreatePayeeInputModel, type: PartyTypeModel | null = null, phoneOptional = false) {
    const parsed = (phoneOptional ? createPayeeInputModel : createPartyInputModel).parse(rawInput);
    const details = settledDetails(parsed.details);
    const { addresses } = parsed;
    await this.assertShortNameFree(tx, details.shortName);
    await this.assertPhoneFree(tx, details.phone);
    await this.assertGstinsFree(tx, addresses);
    const [party] = await tx.insert(partiesTable).values({ ...details, type }).returning({ id: partiesTable.id });
    if (addresses.length > 0) await tx.insert(partyAddressesTable).values(this.withDefault(addresses).map((a) => addressValues(party!.id, a)));
    const [ledger] = await tx
      .insert(ledgersTable)
      .values({ name: ledgerNameOf(details), ...(await this.placeFor(tx, type)), referenceTable: REFERENCE, referenceId: party!.id, balance: "0.00" })
      .returning({ id: ledgersTable.id });
    if (!ledger) throw notFound();
    await this.savePaidBefore(tx, party!.id, parsed.paidBefore);
    await this.saveUpiIds(tx, party!.id, parsed.upiIds);
    return { partyId: party!.id, ledgerId: ledger.id };
  }

  // new details and addresses, saved together; a new type moves its ledger to the matching
  // sub-group with every entry kept, and the ledger's name follows the party's short name
  async update(rawInput: UpdatePartyInputModel, actor: ActorModel): Promise<PartyModel> {
    const parsed = updatePartyInputModel.parse(rawInput);
    const { id, addresses } = parsed;
    const details = settledDetails(parsed.details);
    await db.transaction(async (tx) => {
      const [party] = await tx.select({ id: partiesTable.id }).from(partiesTable).where(eq(partiesTable.id, id)).for("update");
      if (!party) throw notFound();
      await this.assertShortNameFree(tx, details.shortName, id);
      await this.assertPhoneFree(tx, details.phone, id);
      await this.assertGstinsFree(tx, addresses, id);
      await tx.update(partiesTable).set(details).where(eq(partiesTable.id, id));

      // the addresses: kept ones updated, new ones added, the rest retired
      const kept = this.withDefault(addresses);
      const keptIds = kept.map((a) => a.id).filter((a): a is string => !!a);
      await tx
        .update(partyAddressesTable)
        .set({ isActive: false, isDefault: false })
        .where(and(eq(partyAddressesTable.partyId, id), keptIds.length ? notInArray(partyAddressesTable.id, keptIds) : undefined));
      for (const a of kept) {
        if (a.id) {
          const updated = await tx
            .update(partyAddressesTable)
            .set(addressValues(id, a))
            .where(and(eq(partyAddressesTable.id, a.id), eq(partyAddressesTable.partyId, id)))
            .returning({ id: partyAddressesTable.id });
          if (updated.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Address not found." });
        } else {
          await tx.insert(partyAddressesTable).values(addressValues(id, a));
        }
      }

      // its ledger's name follows (its place follows the type, which its transactions set)
      const ledger = await this.accounts.ledgerOf(tx, REFERENCE, id);
      await tx.update(ledgersTable).set({ name: ledgerNameOf(details) }).where(eq(ledgersTable.id, ledger.id));
      await this.savePaidBefore(tx, id, parsed.paidBefore);
      await this.saveUpiIds(tx, id, parsed.upiIds);
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw violated(error).includes("phone") ? phoneTaken(details.phone ?? "", "another party") : shortNameTaken(details.shortName);
      throw error;
    });
    return this.get({ id });
  }

  // inactive only at a zero balance (post-dated entries included) with no pending orders; its ledger follows, so
  // nothing new posts to it. Reactivating is always allowed
  async setActive(rawInput: SetPartyActiveInputModel): Promise<PartyModel> {
    const input = setPartyActiveInputModel.parse(rawInput);
    await db.transaction(async (tx) => {
      const [party] = await tx.select({ id: partiesTable.id }).from(partiesTable).where(eq(partiesTable.id, input.id)).for("update");
      if (!party) throw notFound();
      // the ledger row is locked too, so an entry saving at the same moment either lands first (and blocks this)
      // or waits and then finds the ledger inactive
      const [ledger] = await tx
        .select({ id: ledgersTable.id, balance: ledgersTable.balance })
        .from(ledgersTable)
        .where(and(eq(ledgersTable.referenceTable, REFERENCE), eq(ledgersTable.referenceId, input.id)))
        .for("update");
      if (!ledger) throw notFound();
      if (!input.isActive) {
        if (Number(ledger.balance) !== 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This party still has a balance. Settle it first." });
        if ((await this.pendingOrders(tx, input.id)) > 0) throw new TRPCError({ code: "CONFLICT", message: "This party has pending orders. Complete or cancel them first." });
      }
      await tx.update(partiesTable).set({ isActive: input.isActive }).where(eq(partiesTable.id, input.id));
      await tx.update(ledgersTable).set({ isActive: input.isActive }).where(eq(ledgersTable.id, ledger.id));
    });
    return this.get({ id: input.id });
  }
}
