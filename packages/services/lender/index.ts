import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, sql } from "@repo/database";
import { duesTable, ledgersTable, lendersTable, transactionsTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import type { Tx } from "../stock/engine";
import {
  type LenderInputModel,
  lenderInputModel,
  type LenderModel,
  type ListLendersInputModel,
  listLendersInputModel,
  type SetLenderActiveInputModel,
  setLenderActiveInputModel,
  type UpdateLenderInputModel,
  updateLenderInputModel,
} from "./model";

const REFERENCE = "lenders";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Lender not found." });

const isUniqueViolation = (error: unknown) =>
  ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code === "23505";

// a lender's name and branch are one: the same bank's other branch is another lender
const taken = (error: unknown) =>
  isUniqueViolation(error) ? new TRPCError({ code: "CONFLICT", message: "This lender and branch are already added." }) : error;

const summary = (l: typeof lendersTable.$inferSelect): LenderModel => ({
  id: l.id,
  name: l.name,
  branch: l.branch,
  type: l.type === "nbfc" ? "nbfc" : "bank",
  pan: l.pan,
  isActive: l.isActive,
});

// its ledger's name, in lowercase like other ledgers
const ledgerNameOf = (l: { name: string; branch: string | null }) => [l.name, l.branch].filter(Boolean).join(" ").toLowerCase().slice(0, 150);

// the banks and NBFCs we took term loans from. They aren't parties: each has its own ledger under Bank loans, added with
// its first loan or in Entities
export default class LenderService {
  constructor(private readonly accounts = new AccountsService()) {}

  async list(rawInput: ListLendersInputModel): Promise<LenderModel[]> {
    const input = listLendersInputModel.parse(rawInput);
    const rows = await db
      .select()
      .from(lendersTable)
      .where(input.includeInactive ? undefined : eq(lendersTable.isActive, true))
      .orderBy(asc(sql`lower(${lendersTable.name})`), asc(lendersTable.branch));
    return rows.map(summary);
  }

  // inside a save: a new lender and its ledger, together
  async createIn(tx: Tx, rawInput: LenderInputModel) {
    const input = lenderInputModel.parse(rawInput);
    const [lender] = await tx.insert(lendersTable).values(input).returning();
    const master = await this.accounts.master(tx, "lenders");
    const [ledger] = await tx
      .insert(ledgersTable)
      .values({ name: ledgerNameOf(input), ledgerMasterId: master.id, ledgerGroupId: master.ledgerGroupId, referenceTable: REFERENCE, referenceId: lender!.id, balance: "0.00" })
      .returning({ id: ledgersTable.id });
    return { lender: lender!, ledgerId: ledger!.id };
  }

  // inside a save: a lender already added, with its ledger
  async existingIn(tx: Tx, id: string) {
    const [lender] = await tx.select().from(lendersTable).where(eq(lendersTable.id, id));
    if (!lender) throw notFound();
    if (!lender.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This lender is inactive." });
    return { lender, ledgerId: (await this.accounts.ledgerOf(tx, REFERENCE, id)).id };
  }

  async create(rawInput: LenderInputModel): Promise<LenderModel> {
    const { lender } = await db.transaction((tx) => this.createIn(tx, rawInput)).catch((error: unknown) => {
      throw taken(error);
    });
    return summary(lender);
  }

  async update(rawInput: UpdateLenderInputModel): Promise<LenderModel> {
    const { id, ...details } = updateLenderInputModel.parse(rawInput);
    const lender = await db
      .transaction(async (tx) => {
        const [row] = await tx.update(lendersTable).set(details).where(eq(lendersTable.id, id)).returning();
        if (!row) throw notFound();
        const ledger = await this.accounts.ledgerOf(tx, REFERENCE, id);
        await tx.update(ledgersTable).set({ name: ledgerNameOf(details) }).where(eq(ledgersTable.id, ledger.id));
        await tx.update(duesTable).set({ partyName: details.name.slice(0, 150) }).where(eq(duesTable.lenderId, id));
        return row;
      })
      .catch((error: unknown) => {
        throw taken(error);
      });
    return summary(lender);
  }

  // inactive only once it has no loan left to repay
  async setActive(rawInput: SetLenderActiveInputModel): Promise<LenderModel> {
    const input = setLenderActiveInputModel.parse(rawInput);
    if (!input.isActive) {
      const [open] = await db
        .select({ id: duesTable.id })
        .from(duesTable)
        .innerJoin(transactionsTable, eq(transactionsTable.id, duesTable.transactionId))
        .where(
          and(
            eq(duesTable.lenderId, input.id),
            eq(transactionsTable.status, "active"),
            sql`${duesTable.amount} > coalesce((select sum(s.amount) from due_settlements s join transactions st on st.id = s.transaction_id and st.status = 'active' where s.due_id = ${duesTable.id}), 0)`,
          ),
        )
        .limit(1);
      if (open) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This lender still has a loan to repay." });
    }
    const [row] = await db.update(lendersTable).set({ isActive: input.isActive }).where(eq(lendersTable.id, input.id)).returning();
    if (!row) throw notFound();
    return summary(row);
  }
}
