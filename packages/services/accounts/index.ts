import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, gte, inArray, isNull, lt, lte, ne, sql } from "@repo/database";
import { ledgerEntriesTable, ledgerGroupsTable, ledgerMastersTable, ledgersTable, transactionsTable } from "@repo/database/schema";

import type { Tx } from "../stock/engine";
import AssignedIdCounter from "../transaction/assigned-id";
import LedgerEngine from "./engine";
import { fromPaise, toPaise } from "./money";
import {
  type ActorModel,
  type BalanceModel,
  type LedgerBalanceModel,
  type LedgerIdInputModel,
  type LedgerSummaryModel,
  type OpeningBalanceModel,
  type OverviewModel,
  openingBalanceModel,
  type SavedOpeningBalanceModel,
  type StatementInputModel,
  statementInputModel,
  type StatementModel,
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

      // the fixed ledgers
      const fixed = await tx.select().from(ledgersTable).where(isNull(ledgersTable.referenceId));
      const haveLedger = new Set(fixed.map((l) => `${l.ledgerGroupId}|${l.name}`));
      for (const l of Object.values(LEDGERS)) {
        const ledgerGroupId = groupId.get(l.group)!;
        if (!haveLedger.has(`${ledgerGroupId}|${l.name}`)) await tx.insert(ledgersTable).values({ name: l.name, ledgerGroupId, balance: "0.00" });
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
      await tx.update(transactionsTable).set({ dateTime: input.date }).where(eq(transactionsTable.id, current.id));
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
    const lines = rows.map(({ entry: e, type, assignedId, remarks }) => {
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
    return { ledgerId: ledger.id, name: ledger.name, broughtForward, lines, closing: asBalance(running) };
  }

  // every ledger with its head, sub-group and balance as of today (one, when an id is given)
  private async summaries(id?: string): Promise<LedgerSummaryModel[]> {
    const rows = await db
      .select({ ledger: ledgersTable, head: ledgerGroupsTable.type, masterName: ledgerMastersTable.name })
      .from(ledgersTable)
      .innerJoin(ledgerGroupsTable, eq(ledgerGroupsTable.id, ledgersTable.ledgerGroupId))
      .leftJoin(ledgerMastersTable, eq(ledgerMastersTable.id, ledgersTable.ledgerMasterId))
      .where(id ? eq(ledgersTable.id, id) : undefined)
      .orderBy(asc(ledgersTable.name));
    const balances = await this.balances(rows.map((r) => r.ledger.id));
    return rows.map(({ ledger: l, head, masterName }) => ({
      id: l.id,
      name: l.name,
      head,
      masterKey: masterName ? (MASTER_KEY.get(`${head}|${masterName}`) ?? null) : null,
      key: l.referenceId === null && !masterName ? (LEDGER_KEY.get(`${head}|${l.name}`) ?? null) : null,
      referenceId: l.referenceId,
      isActive: l.isActive,
      balance: balances.get(l.id)!,
    }));
  }

  async ledger(input: LedgerIdInputModel): Promise<LedgerSummaryModel> {
    const [ledger] = await this.summaries(input.id);
    if (!ledger) throw notFound();
    return ledger;
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
