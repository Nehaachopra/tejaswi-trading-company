import { TRPCError } from "@trpc/server";
import { and, asc, count, db, desc, eq, gte, inArray, isNull, lt, lte, ne, notInArray, type SQL, sql } from "@repo/database";
import { ledgerEntriesTable, ledgerGroupsTable, ledgerMastersTable, ledgersTable, partiesTable, partyAddressesTable, paymentsTable, receiptsTable, transactionsTable } from "@repo/database/schema";

// the picker: the ledgers used last when nothing is typed, and at most this many matches when something is
const RECENT_PICKS = 8;
// how close a party's name must be spelt to what's typed to count as a match (0 to 1; trigram word similarity)
const FUZZY_FLOOR = 0.4;
const PICK_LIMIT = 20;

import type { Tx } from "../stock/engine";
import AssignedIdCounter from "../transaction/assigned-id";
import LedgerEngine from "./engine";
import { fromPaise, toPaise } from "./money";
import {
  type ActorModel,
  type BalanceModel,
  type CreateLedgerInputModel,
  createLedgerInputModel,
  type LedgerBalanceModel,
  type LedgerIdInputModel,
  type LedgerModel,
  type LedgerSummaryModel,
  type OpeningBalanceModel,
  type OpeningSheetModel,
  type OverviewModel,
  type PickLedgersInputModel,
  pickLedgersInputModel,
  type SaveOpeningInputModel,
  saveOpeningInputModel,
  type SetLedgerActiveInputModel,
  setLedgerActiveInputModel,
  type UpdateLedgerInputModel,
  updateLedgerInputModel,
  openingBalanceModel,
  type SavedOpeningBalanceModel,
  type StatementInputModel,
  statementInputModel,
  type StatementModel,
  OWN_SCREEN_LEDGERS,
  fitsPaymentKind,
  fitsReceiptKind,
  type PaymentKind,
  type PickedLedgerModel,
  type ReceiptKind,
  TAX_LEDGERS,
} from "./model";
import { GROUPS, type GroupType, LEDGERS, type LedgerKey, MASTERS, type MasterKey } from "./structure";

const MASTER_KEY = new Map(Object.entries(MASTERS).map(([key, m]) => [`${m.group}|${m.name}`, key]));
const LEDGER_KEY = new Map(Object.entries(LEDGERS).map(([key, l]) => [`${l.group}|${l.name}`, key]));

// a signed amount in paise (debit plus, credit minus) as an amount and its side
const asBalance = (paise: number): BalanceModel => ({ amount: Number(fromPaise(Math.abs(paise))), side: paise < 0 ? "credit" : "debit" });

// the first moment of tomorrow in India: entries dated from then on are post-dated
const tomorrowInIndia = () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(new Date(`${today}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000);
};

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Ledger not found." });

// the accounting structure, its fixed ledgers and masters, and opening balances; every entry goes
// through the ledger engine
export default class AccountsService {
  // ids never change once created (ledgers and masters can't be deleted), so they are looked up once
  private readonly ids = new Map<string, string>();

  constructor(
    private readonly engine = new LedgerEngine(),
    private readonly counter = new AssignedIdCounter(),
  ) {}

  // creates whatever part of the structure is missing; safe to run on every start
  async ensureStructure() {
    await db.transaction(async (tx) => {
      // one setup at a time, even if two API processes start together
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('accounting_structure'))`);

      // the groups
      const groups = await tx.select().from(ledgerGroupsTable);
      const groupId = new Map(groups.map((g) => [g.type as string, g.id]));
      for (const [type, name] of Object.entries(GROUPS) as [GroupType, string][]) {
        if (groupId.has(type)) continue;
        const [created] = await tx.insert(ledgerGroupsTable).values({ type, name }).returning({ id: ledgerGroupsTable.id });
        groupId.set(type, created!.id);
      }

      // the masters
      const masters = await tx.select().from(ledgerMastersTable);
      const haveMaster = new Set(masters.map((m) => `${m.ledgerGroupId}|${m.name}`));
      for (const m of Object.values(MASTERS)) {
        const ledgerGroupId = groupId.get(m.group)!;
        if (!haveMaster.has(`${ledgerGroupId}|${m.name}`)) await tx.insert(ledgerMastersTable).values({ name: m.name, ledgerGroupId });
      }

      // the fixed ledgers; one that has moved to another head (Sale return to Expense, Purchase return to Income)
      // is moved there with its entries, not created twice
      const fixed = await tx.select().from(ledgersTable).where(and(isNull(ledgersTable.referenceId), isNull(ledgersTable.ledgerMasterId)));
      for (const l of Object.values(LEDGERS)) {
        const ledgerGroupId = groupId.get(l.group)!;
        // found whatever its case, and kept in lowercase like every other name
        const found = fixed.find((f) => f.name.toLowerCase() === l.name);
        if (!found) await tx.insert(ledgersTable).values({ name: l.name, ledgerGroupId, balance: "0.00" });
        else if (found.ledgerGroupId !== ledgerGroupId || found.name !== l.name) {
          await tx.update(ledgersTable).set({ ledgerGroupId, name: l.name }).where(eq(ledgersTable.id, found.id));
        }
      }
    });
  }

  // a fixed ledger's id, such as Cash or Capital
  async ledgerId(tx: Tx, key: LedgerKey) {
    const cached = this.ids.get(`ledger:${key}`);
    if (cached) return cached;
    const { group, name } = LEDGERS[key];
    const [row] = await tx
      .select({ id: ledgersTable.id })
      .from(ledgersTable)
      .innerJoin(ledgerGroupsTable, eq(ledgerGroupsTable.id, ledgersTable.ledgerGroupId))
      .where(and(eq(ledgerGroupsTable.type, group), eq(ledgersTable.name, name), isNull(ledgersTable.referenceId)));
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `The ${name} ledger is missing.` });
    this.ids.set(`ledger:${key}`, row.id);
    return row.id;
  }

  // a master's id and its group's, for a new bank, party or employee ledger
  async master(tx: Tx, key: MasterKey) {
    const cached = this.ids.get(`master:${key}`);
    if (cached) return JSON.parse(cached) as { id: string; ledgerGroupId: string };
    const { group, name } = MASTERS[key];
    const [row] = await tx
      .select({ id: ledgerMastersTable.id, ledgerGroupId: ledgerMastersTable.ledgerGroupId })
      .from(ledgerMastersTable)
      .innerJoin(ledgerGroupsTable, eq(ledgerGroupsTable.id, ledgerMastersTable.ledgerGroupId))
      .where(and(eq(ledgerGroupsTable.type, group), eq(ledgerMastersTable.name, name)));
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `The ${name} master is missing.` });
    this.ids.set(`master:${key}`, JSON.stringify(row));
    return row;
  }

  // each ledger's balance as of today, and what its post-dated entries will add
  async balances(ledgerIds: string[]): Promise<Map<string, LedgerBalanceModel>> {
    if (ledgerIds.length === 0) return new Map();
    const later = tomorrowInIndia();
    const rows = await db
      .select({
        id: ledgersTable.id,
        balance: ledgersTable.balance,
        balanceType: ledgersTable.balanceType,
        postDated: sql<string>`coalesce(sum(case when ${ledgerEntriesTable.transactionType} = 'debit' then ${ledgerEntriesTable.amount} else -${ledgerEntriesTable.amount} end), 0)`,
      })
      .from(ledgersTable)
      .leftJoin(ledgerEntriesTable, and(eq(ledgerEntriesTable.ledgerId, ledgersTable.id), sql`${ledgerEntriesTable.dateTime} >= ${later}`))
      .where(inArray(ledgersTable.id, ledgerIds))
      .groupBy(ledgersTable.id);
    return new Map(
      rows.map((r) => {
        const total = (r.balanceType === "debit" ? 1 : -1) * toPaise(r.balance);
        const postDated = toPaise(r.postDated);
        return [r.id, { today: asBalance(total - postDated), postDated: postDated === 0 ? null : asBalance(postDated) }];
      }),
    );
  }

  // the ledgers that have entries from anything besides their opening balance (then it can't change)
  async withEntries(ledgerIds: string[]): Promise<Set<string>> {
    if (ledgerIds.length === 0) return new Set();
    const rows = await db
      .select({ ledgerId: ledgerEntriesTable.ledgerId, n: count() })
      .from(ledgerEntriesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, ledgerEntriesTable.transactionId))
      .where(and(inArray(ledgerEntriesTable.ledgerId, ledgerIds), ne(transactionsTable.type, "opening_balance")))
      .groupBy(ledgerEntriesTable.ledgerId);
    return new Set(rows.filter((r) => r.n > 0).map((r) => r.ledgerId));
  }

  // the OB transaction that opened a ledger, if any
  private async openingOf(q: Pick<Tx, "select">, ledgerId: string) {
    const [row] = await q
      .select({ id: transactionsTable.id, assignedId: transactionsTable.assignedId, dateTime: transactionsTable.dateTime, amount: ledgerEntriesTable.amount, side: ledgerEntriesTable.transactionType })
      .from(ledgerEntriesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, ledgerEntriesTable.transactionId))
      .where(and(eq(ledgerEntriesTable.ledgerId, ledgerId), eq(transactionsTable.type, "opening_balance"), eq(transactionsTable.status, "active")));
    return row;
  }

  // a ledger's opening balance as saved, for its details
  async savedOpening(ledgerId: string): Promise<SavedOpeningBalanceModel | null> {
    const row = await this.openingOf(db, ledgerId);
    return row ? { amount: Number(row.amount), side: row.side, date: row.dateTime!, assignedId: row.assignedId } : null;
  }

  // sets, changes or removes a ledger's opening balance, inside the save of the bank account, party or ledger.
  // It becomes an OB transaction dated when it was struck: the first line of the ledger, with Capital on the
  // other side. It can change only while it is the ledger's only entry
  async setOpeningBalance(tx: Tx, ledger: { id: string; name: string }, raw: OpeningBalanceModel | null, actor: ActorModel) {
    const input = raw ? openingBalanceModel.parse(raw) : null;
    const current = await this.openingOf(tx, ledger.id);
    if (!current && !input) return;
    if (current && input && Number(current.amount) === input.amount && current.side === input.side && current.dateTime!.getTime() === input.date.getTime()) return;

    // changing one that's there: only while nothing else has been posted to the ledger
    if (current) {
      const [other] = await tx
        .select({ id: ledgerEntriesTable.id })
        .from(ledgerEntriesTable)
        .where(and(eq(ledgerEntriesTable.ledgerId, ledger.id), ne(ledgerEntriesTable.transactionId, current.id)))
        .limit(1);
      if (other) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The opening balance can't change once there are other entries." });
      await this.engine.erase(tx, current.id);
      if (!input) {
        await tx
          .update(transactionsTable)
          .set({ status: "cancelled", cancelledAt: new Date(), cancelledById: actor.id, cancelledByName: actor.name.slice(0, 30), cancelReason: "Opening balance removed" })
          .where(eq(transactionsTable.id, current.id));
        return;
      }
      await tx.update(transactionsTable).set({ dateTime: input.date, amount: fromPaise(Math.round(input.amount * 100)) }).where(eq(transactionsTable.id, current.id));
    }

    // a new one gets its OB number
    const transactionId =
      current?.id ??
      (
        await tx
          .insert(transactionsTable)
          .values({
            type: "opening_balance",
            dateTime: input!.date,
            amount: fromPaise(Math.round(input!.amount * 100)),
            assignedId: await this.counter.next(tx, "OB", input!.date),
            remarks: `Opening balance: ${ledger.name}`.slice(0, 100),
            createdById: actor.id,
            createdByName: actor.name.slice(0, 30),
          })
          .returning({ id: transactionsTable.id })
      )[0]!.id;

    const capitalId = await this.ledgerId(tx, "capital");
    await this.engine.post(tx, {
      transactionId,
      dateTime: input!.date,
      lines: [
        { ledgerId: ledger.id, side: input!.side, amount: input!.amount },
        { ledgerId: capitalId, side: input!.side === "debit" ? "credit" : "debit", amount: input!.amount },
      ],
    });
  }

  // a ledger's statement for a date range (all of it when none is given)
  async statement(rawInput: StatementInputModel): Promise<StatementModel> {
    const input = statementInputModel.parse(rawInput);
    const [ledger] = await db.select({ id: ledgersTable.id, name: ledgersTable.name }).from(ledgersTable).where(eq(ledgersTable.id, input.ledgerId));
    if (!ledger) throw notFound();
    const signedAmount = sql<string>`case when ${ledgerEntriesTable.transactionType} = 'debit' then ${ledgerEntriesTable.amount} else -${ledgerEntriesTable.amount} end`;

    // everything before the range, added up
    const [before] = input.from
      ? await db
          .select({ total: sql<string>`coalesce(sum(${signedAmount}), 0)` })
          .from(ledgerEntriesTable)
          .where(and(eq(ledgerEntriesTable.ledgerId, ledger.id), lt(ledgerEntriesTable.dateTime, input.from)))
      : [{ total: "0" }];

    const rows = await db
      .select({ entry: ledgerEntriesTable, type: transactionsTable.type, assignedId: transactionsTable.assignedId, remarks: transactionsTable.remarks })
      .from(ledgerEntriesTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, ledgerEntriesTable.transactionId))
      .where(
        and(
          eq(ledgerEntriesTable.ledgerId, ledger.id),
          input.from ? gte(ledgerEntriesTable.dateTime, input.from) : undefined,
          input.to ? lte(ledgerEntriesTable.dateTime, input.to) : undefined,
        ),
      )
      .orderBy(asc(ledgerEntriesTable.dateTime), asc(ledgerEntriesTable.createdAt), asc(ledgerEntriesTable.id));

    // the balance after each line
    let running = toPaise(before!.total);
    const broughtForward = asBalance(running);
    const all = rows.map(({ entry: e, type, assignedId, remarks }) => {
      running += (e.transactionType === "debit" ? 1 : -1) * toPaise(e.amount);
      return {
        id: e.id,
        transactionId: e.transactionId,
        type,
        assignedId,
        remarks,
        dateTime: e.dateTime,
        side: e.transactionType,
        amount: Number(e.amount),
        isReversal: e.isReversal,
        balance: asBalance(running),
      };
    });
    // narrowed down: the lines that match, each keeping the true balance after it, and their totals
    const search = input.search.toLowerCase();
    const narrowing = input.types.length > 0 || input.minAmount !== null || input.maxAmount !== null || search !== "";
    const lines = narrowing
      ? all.filter(
          (l) =>
            (input.types.length === 0 || input.types.includes(l.type)) &&
            (input.minAmount === null || l.amount >= input.minAmount) &&
            (input.maxAmount === null || l.amount <= input.maxAmount) &&
            (search === "" || l.assignedId.toLowerCase().includes(search) || (l.remarks ?? "").toLowerCase().includes(search)),
        )
      : all;
    const total = (side: "debit" | "credit") => Number(fromPaise(lines.filter((l) => l.side === side).reduce((sum, l) => sum + toPaise(l.amount), 0)));
    return {
      ledgerId: ledger.id,
      name: ledger.name,
      broughtForward,
      lines,
      closing: asBalance(running),
      narrowed: narrowing ? { debit: total("debit"), credit: total("credit") } : null,
    };
  }

  // every ledger with its head, sub-group and balance as of today (one, when an id is given)
  private async summaries(id?: string): Promise<LedgerSummaryModel[]> {
    return this.summariesWhere(id ? eq(ledgersTable.id, id) : undefined);
  }

  // the ledgers matching a condition (a party ledger matches on its party's full name too), up to `limit`
  private async summariesWhere(where: SQL | undefined, limit?: number, closestFirst?: SQL): Promise<LedgerSummaryModel[]> {
    const query = db
      .select({ ledger: ledgersTable, head: ledgerGroupsTable.type, masterName: ledgerMastersTable.name })
      .from(ledgersTable)
      .innerJoin(ledgerGroupsTable, eq(ledgerGroupsTable.id, ledgersTable.ledgerGroupId))
      .leftJoin(ledgerMastersTable, eq(ledgerMastersTable.id, ledgersTable.ledgerMasterId))
      .leftJoin(partiesTable, eq(partiesTable.id, ledgersTable.referenceId))
      .where(where)
      .orderBy(...(closestFirst ? [closestFirst] : []), asc(ledgersTable.name));
    const rows = limit ? await query.limit(limit) : await query;
    const balances = await this.balances(rows.map((r) => r.ledger.id));
    return rows.map(({ ledger: l, head, masterName }) => ({
      id: l.id,
      name: l.name,
      head,
      masterKey: masterName ? (MASTER_KEY.get(`${head}|${masterName}`) ?? null) : null,
      key: l.referenceId === null && !masterName ? (LEDGER_KEY.get(`${head}|${l.name}`) ?? null) : null,
      custom: l.referenceId === null && !masterName && !LEDGER_KEY.has(`${head}|${l.name}`),
      referenceId: l.referenceId,
      isActive: l.isActive,
      balance: balances.get(l.id)!,
    }));
  }

  async ledger(input: LedgerIdInputModel): Promise<LedgerModel> {
    const [ledger] = await this.summaries(input.id);
    if (!ledger) throw notFound();
    const [openingBalance, withEntries] = await Promise.all([this.savedOpening(ledger.id), this.withEntries([ledger.id])]);
    return { ...ledger, openingBalance, hasEntries: withEntries.has(ledger.id) };
  }

  // the six heads with their totals as of today
  async overview(): Promise<OverviewModel> {
    const ledgers = await this.summaries();
    const signed = (l: LedgerSummaryModel) => (l.balance.today.side === "debit" ? 1 : -1) * toPaise(l.balance.today.amount);

    const heads = (Object.keys(GROUPS) as GroupType[]).map((head) => {
      const mine = ledgers.filter((l) => l.head === head);
      // the sub-groups in the order the structure lists them
      const masters = (Object.entries(MASTERS) as [MasterKey, (typeof MASTERS)[MasterKey]][])
        .filter(([, m]) => m.group === head)
        .map(([key, m]) => {
          const inside = mine.filter((l) => l.masterKey === key);
          return { key, name: m.name, total: asBalance(inside.reduce((sum, l) => sum + signed(l), 0)), ledgers: inside.length };
        });
      return {
        head,
        total: asBalance(mine.reduce((sum, l) => sum + signed(l), 0)),
        masters,
        ledgers: mine.filter((l) => l.masterKey === null),
      };
    });

    // income is a credit and expense a debit: what's left of income is the profit, a shortfall the loss
    const net = -heads.filter((h) => h.head === "income" || h.head === "expense").reduce((sum, h) => sum + (h.total.side === "debit" ? 1 : -1) * toPaise(h.total.amount), 0);
    const worked = (head: "profit" | "loss", paise: number) => ({ head, total: asBalance(head === "profit" ? -paise : paise), masters: [], ledgers: [] });
    return { heads: [...heads, worked("profit", Math.max(net, 0)), worked("loss", Math.max(-net, 0))] };
  }

  // a ledger name can't repeat within its head (built-in ones included)
  private async assertNameFree(tx: Tx, ledgerGroupId: string, name: string, exceptId?: string) {
    const [clash] = await tx
      .select({ id: ledgersTable.id })
      .from(ledgersTable)
      .where(
        and(
          eq(ledgersTable.ledgerGroupId, ledgerGroupId),
          isNull(ledgersTable.referenceId),
          eq(sql`lower(${ledgersTable.name})`, name.toLowerCase()),
          exceptId ? ne(ledgersTable.id, exceptId) : undefined,
        ),
      );
    if (clash) throw new TRPCError({ code: "CONFLICT", message: "A ledger with this name already exists under this head." });
  }

  // a ledger the admin adds under a head (a loan, other income, an expense head), opened with its opening balance
  // in the same save
  async createLedger(rawInput: CreateLedgerInputModel): Promise<LedgerModel> {
    const input = createLedgerInputModel.parse(rawInput);
    const id = await db.transaction((tx) => this.createLedgerIn(tx, input));
    return this.ledger({ id });
  }

  // the same, inside another save (a receipt or payment that adds the ledger it uses), so a failed save never
  // leaves an empty ledger behind
  async createLedgerIn(tx: Tx, rawInput: CreateLedgerInputModel) {
    const input = createLedgerInputModel.parse(rawInput);
    const [group] = await tx.select({ id: ledgerGroupsTable.id }).from(ledgerGroupsTable).where(eq(ledgerGroupsTable.type, input.head));
    if (!group) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The accounting structure is missing." });
    await this.assertNameFree(tx, group.id, input.name);
    const [ledger] = await tx.insert(ledgersTable).values({ name: input.name, ledgerGroupId: group.id, balance: "0.00" }).returning({ id: ledgersTable.id });
    return ledger!.id;
  }

  // a new name for a ledger the admin added; built-in ledgers keep theirs
  async updateLedger(rawInput: UpdateLedgerInputModel): Promise<LedgerModel> {
    const input = updateLedgerInputModel.parse(rawInput);
    const current = await this.ledger({ id: input.id });
    if (!current.custom) throw new TRPCError({ code: "BAD_REQUEST", message: "A built-in ledger keeps its name." });
    await db.transaction(async (tx) => {
      const [row] = await tx.select({ ledgerGroupId: ledgersTable.ledgerGroupId }).from(ledgersTable).where(eq(ledgersTable.id, input.id)).for("update");
      if (input.name !== current.name) {
        await this.assertNameFree(tx, row!.ledgerGroupId, input.name, input.id);
        await tx.update(ledgersTable).set({ name: input.name }).where(eq(ledgersTable.id, input.id));
      }
    });
    return this.ledger({ id: input.id });
  }

  // the ledgers a receipt can come from or a payment go to, with their balances as of today
  async pickable(rawInput: PickLedgersInputModel): Promise<PickedLedgerModel[]> {
    const input = pickLedgersInputModel.parse(rawInput);
    // what money can come from or go to: not cash or a bank, not profit or loss; a payment never to an employee
    // or drawings (salary and drawings have their own screens)
    const allowed = (l: LedgerSummaryModel) =>
      l.isActive &&
      l.key !== "cash" &&
      l.masterKey !== "bank" &&
      l.head !== "profit" &&
      l.head !== "loss" &&
      (input.purpose === "receipt" || (l.masterKey !== "employees" && l.key !== "drawings")) &&
      (input.receiptKind === null || fitsReceiptKind(input.receiptKind, l)) &&
      (input.paymentKind === null || fitsPaymentKind(input.paymentKind, l));
    const kindWhere = input.receiptKind ? this.receiptKindWhere(input.receiptKind) : input.paymentKind ? this.paymentKindWhere(input.paymentKind) : undefined;

    // nothing typed: the ledgers used last for this purpose, newest first
    if (input.search === "") {
      const used =
        input.purpose === "receipt"
          ? db.select({ id: receiptsTable.receivedFromLedgerId, at: transactionsTable.dateTime }).from(receiptsTable).innerJoin(transactionsTable, eq(transactionsTable.id, receiptsTable.transactionId))
          : db.select({ id: paymentsTable.paidToLedgerId, at: transactionsTable.dateTime }).from(paymentsTable).innerJoin(transactionsTable, eq(transactionsTable.id, paymentsTable.transactionId));
      const recent = await used.orderBy(desc(transactionsTable.dateTime)).limit(50);
      const ids = [...new Set(recent.map((r) => r.id))];
      const found = new Map((ids.length ? await this.summariesWhere(inArray(ledgersTable.id, ids)) : []).map((l) => [l.id, l]));
      const picks = ids.map((id) => found.get(id)).filter((l): l is LedgerSummaryModel => !!l && allowed(l)).slice(0, RECENT_PICKS);
      // one kind picked: topped up with that kind's ledgers, so Capital or Scrap sale shows without typing
      if (kindWhere && picks.length < RECENT_PICKS) {
        const more = await this.summariesWhere(and(eq(ledgersTable.isActive, true), kindWhere), RECENT_PICKS + 10);
        for (const l of more) if (picks.length < RECENT_PICKS && allowed(l) && !picks.some((p) => p.id === l.id)) picks.push(l);
      }
      return this.withParties(picks);
    }

    // typed: the ledger's name, its party's full name or phone holds it, or the party's name is spelt close to it
    // (trigrams: "ramaswamy" finds "sri ramswamy traders"); the closest come first
    const typed = input.search.toLowerCase();
    const like = `%${typed.replace(/[%_\\]/g, "\\$&")}%`;
    const closeness = sql`greatest(word_similarity(${typed}, lower(coalesce(${partiesTable.name}, ''))), word_similarity(${typed}, lower(${ledgersTable.name})))`;
    const matches = await this.summariesWhere(
      and(
        eq(ledgersTable.isActive, true),
        sql`(lower(${ledgersTable.name}) like ${like} or lower(coalesce(${partiesTable.name}, '')) like ${like} or coalesce(${partiesTable.phone}, '') like ${like} or (length(${typed}) >= 3 and ${closeness} >= ${FUZZY_FLOOR}))`,
        kindWhere,
      ),
      PICK_LIMIT + 10,
      sql`${closeness} desc`,
    );
    return this.withParties(matches.filter(allowed).slice(0, PICK_LIMIT));
  }

  // each ledger with the party behind it (its default address's town), for the picker to show who it is
  private async withParties(ledgers: LedgerSummaryModel[]): Promise<PickedLedgerModel[]> {
    const ids = ledgers.map((l) => l.referenceId).filter((id): id is string => id !== null);
    const rows = ids.length
      ? await db
          .select({ id: partiesTable.id, name: partiesTable.name, shortName: partiesTable.shortName, phone: partiesTable.phone, type: partiesTable.type, city: partyAddressesTable.city })
          .from(partiesTable)
          .leftJoin(partyAddressesTable, and(eq(partyAddressesTable.partyId, partiesTable.id), eq(partyAddressesTable.isActive, true), eq(partyAddressesTable.isDefault, true)))
          .where(inArray(partiesTable.id, ids))
      : [];
    const byId = new Map(rows.map(({ id, ...p }) => [id, p]));
    return ledgers.map((l) => ({ ...l, party: (l.referenceId && byId.get(l.referenceId)) || null }));
  }

  // the ledgers of one receipt kind, in SQL, so a search only fetches those (fitsReceiptKind has the final say)
  private receiptKindWhere(kind: ReceiptKind): SQL | undefined {
    const inMaster = (...keys: MasterKey[]) => inArray(ledgerMastersTable.name, keys.map((k) => MASTERS[k].name));
    const own = and(
      isNull(ledgersTable.ledgerMasterId),
      isNull(ledgersTable.referenceId),
      notInArray(ledgersTable.name, OWN_SCREEN_LEDGERS.map((k) => LEDGERS[k as LedgerKey].name)),
    );
    switch (kind) {
      case "customer":
      case "loanTaken":
      case "loanReturned":
      case "interestReceived":
        return inMaster("debtors", "creditors", "debtorCreditors", "parties");
      case "capital":
        return and(own, eq(ledgersTable.name, LEDGERS.capital.name));
      case "otherIncome":
        return and(own, eq(ledgerGroupsTable.type, "income"));
      case "refund":
        return and(own, inArray(ledgerGroupsTable.type, ["asset", "expense"]), ne(ledgersTable.name, LEDGERS.cash.name));
    }
  }

  // the ledgers of one payment kind, in SQL (fitsPaymentKind has the final say)
  private paymentKindWhere(kind: PaymentKind): SQL | undefined {
    const inMaster = (...keys: MasterKey[]) => inArray(ledgerMastersTable.name, keys.map((k) => MASTERS[k].name));
    switch (kind) {
      case "supplier":
      case "loanRepaid":
      case "interestPaid":
      case "loanGiven":
      case "refund":
        return inMaster("debtors", "creditors", "debtorCreditors", "parties");
      case "taxPaid":
        return and(
          isNull(ledgersTable.ledgerMasterId),
          isNull(ledgersTable.referenceId),
          inArray(ledgersTable.name, TAX_LEDGERS.map((k) => LEDGERS[k as LedgerKey].name)),
        );
      case "expense":
        return and(
          isNull(ledgersTable.ledgerMasterId),
          isNull(ledgersTable.referenceId),
          eq(ledgerGroupsTable.type, "expense"),
          notInArray(ledgersTable.name, OWN_SCREEN_LEDGERS.map((k) => LEDGERS[k as LedgerKey].name)),
        );
    }
  }

  // where a ledger sits (its head, sub-group and built-in key), read inside a save
  async placeIn(tx: Tx, ledgerId: string) {
    const [row] = await tx
      .select({ name: ledgersTable.name, head: ledgerGroupsTable.type, masterName: ledgerMastersTable.name, referenceId: ledgersTable.referenceId })
      .from(ledgersTable)
      .innerJoin(ledgerGroupsTable, eq(ledgerGroupsTable.id, ledgersTable.ledgerGroupId))
      .leftJoin(ledgerMastersTable, eq(ledgerMastersTable.id, ledgersTable.ledgerMasterId))
      .where(eq(ledgersTable.id, ledgerId));
    if (!row) throw notFound();
    return {
      head: row.head,
      masterKey: row.masterName ? (MASTER_KEY.get(`${row.head}|${row.masterName}`) ?? null) : null,
      key: row.referenceId === null && !row.masterName ? (LEDGER_KEY.get(`${row.head}|${row.name}`) ?? null) : null,
      referenceId: row.referenceId,
    };
  }

  // the Opening balances page: every ledger but Capital, with its opening balance and whether it's locked, and the
  // date the books start (the earliest opening balance's date, once any are saved)
  async openingSheet(): Promise<OpeningSheetModel> {
    const ledgers = (await this.summaries()).filter((l) => l.key !== "capital" && l.head !== "profit" && l.head !== "loss");
    const ids = ledgers.map((l) => l.id);
    const [openings, locked] = await Promise.all([
      ids.length === 0
        ? []
        : db
            .select({ ledgerId: ledgerEntriesTable.ledgerId, amount: ledgerEntriesTable.amount, side: ledgerEntriesTable.transactionType, at: transactionsTable.dateTime })
            .from(ledgerEntriesTable)
            .innerJoin(transactionsTable, eq(transactionsTable.id, ledgerEntriesTable.transactionId))
            .where(and(inArray(ledgerEntriesTable.ledgerId, ids), eq(transactionsTable.type, "opening_balance"), eq(transactionsTable.status, "active"))),
      this.withEntries(ids),
    ]);
    const openingOf = new Map(openings.map((o) => [o.ledgerId, o]));
    const dates = openings.map((o) => o.at!.getTime());
    return {
      date: dates.length ? new Date(Math.min(...dates)) : null,
      rows: ledgers.map((l) => {
        const o = openingOf.get(l.id);
        return {
          ledgerId: l.id,
          name: l.name,
          key: l.key,
          head: l.head as "asset" | "liability" | "income" | "expense",
          masterKey: l.masterKey,
          isActive: l.isActive,
          opening: o ? { amount: Number(o.amount), side: o.side } : null,
          locked: locked.has(l.id),
        };
      }),
    };
  }

  // every opening balance at once, all on the date the books start, in one save; Capital takes the other side of
  // each. A locked ledger (with other entries) keeps what it has
  async saveOpening(rawInput: SaveOpeningInputModel, actor: ActorModel): Promise<OpeningSheetModel> {
    const input = saveOpeningInputModel.parse(rawInput);
    const sheet = await this.openingSheet();
    const rowOf = new Map(sheet.rows.map((r) => [r.ledgerId, r]));
    await db.transaction(async (tx) => {
      for (const line of input.lines) {
        const row = rowOf.get(line.ledgerId);
        if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "That ledger can't have an opening balance here." });
        if (row.locked) continue;
        await this.setOpeningBalance(tx, { id: row.ledgerId, name: row.name }, line.opening ? { ...line.opening, date: input.date } : null, actor);
      }
    });
    return this.openingSheet();
  }

  // a ledger the admin added is made inactive only at a zero balance (post-dated entries included); built-in
  // ones always stay
  async setLedgerActive(rawInput: SetLedgerActiveInputModel): Promise<LedgerModel> {
    const input = setLedgerActiveInputModel.parse(rawInput);
    const current = await this.ledger({ id: input.id });
    if (!current.custom) throw new TRPCError({ code: "BAD_REQUEST", message: "Only ledgers you added can be made inactive here." });
    await db.transaction(async (tx) => {
      const [row] = await tx.select({ balance: ledgersTable.balance }).from(ledgersTable).where(eq(ledgersTable.id, input.id)).for("update");
      if (!input.isActive && Number(row!.balance) !== 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This ledger still has a balance. Bring it to zero first." });
      }
      await tx.update(ledgersTable).set({ isActive: input.isActive }).where(eq(ledgersTable.id, input.id));
    });
    return this.ledger({ id: input.id });
  }

  // a ledger's id from the record it belongs to (a bank account, party or employee)
  async ledgerOf(tx: Tx, referenceTable: string, referenceId: string) {
    const [row] = await tx
      .select({ id: ledgersTable.id, name: ledgersTable.name, balance: ledgersTable.balance })
      .from(ledgersTable)
      .where(and(eq(ledgersTable.referenceTable, referenceTable), eq(ledgersTable.referenceId, referenceId)));
    if (!row) throw notFound();
    return row;
  }
}
