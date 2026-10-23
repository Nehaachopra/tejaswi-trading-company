import { TRPCError } from "@trpc/server";
import { and, db, eq, isNull, sql } from "@repo/database";
import { ledgerGroupsTable, ledgerMastersTable, ledgersTable, transactionsTable } from "@repo/database/schema";

import type { Tx } from "../stock/engine";
import AssignedIdCounter from "../transaction/assigned-id";
import LedgerEngine from "./engine";
import { type ActorModel, type OpeningBalanceModel, openingBalanceModel } from "./model";
import { GROUPS, type GroupType, LEDGERS, type LedgerKey, MASTERS, type MasterKey } from "./structure";

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

  // an opening balance becomes an OB transaction dated when it was struck: the first line of the ledger,
  // with Capital on the other side. Called inside the save that adds the bank account, party or ledger
  async openingBalance(tx: Tx, ledger: { id: string; name: string }, raw: OpeningBalanceModel, actor: ActorModel) {
    const input = openingBalanceModel.parse(raw);
    const capitalId = await this.ledgerId(tx, "capital");
    const assignedId = await this.counter.next(tx, "OB", input.date);

    const [created] = await tx
      .insert(transactionsTable)
      .values({
        type: "opening_balance",
        dateTime: input.date,
        assignedId,
        remarks: `Opening balance: ${ledger.name}`.slice(0, 100),
        createdById: actor.id,
        createdByName: actor.name.slice(0, 30),
      })
      .returning({ id: transactionsTable.id });

    await this.engine.post(tx, {
      transactionId: created!.id,
      dateTime: input.date,
      lines: [
        { ledgerId: ledger.id, side: input.side, amount: input.amount },
        { ledgerId: capitalId, side: input.side === "debit" ? "credit" : "debit", amount: input.amount },
      ],
    });
    return { transactionId: created!.id, assignedId };
  }
}
