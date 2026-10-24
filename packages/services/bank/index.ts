import { TRPCError } from "@trpc/server";
import { and, asc, db, eq, inArray, ne, sql } from "@repo/database";
import { bankDetailsTable, bankUpiIdsTable, ifscBranchesTable, ledgersTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel } from "../accounts/model";
import type { Tx } from "../stock/engine";
import {
  type BankAccountIdInputModel,
  type BankAccountModel,
  type BankDetailsInputModel,
  type BranchModel,
  type BranchSearchInputModel,
  branchSearchInputModel,
  type CreateBankAccountInputModel,
  createBankAccountInputModel,
  type ListBankAccountsInputModel,
  type SetBankAccountActiveInputModel,
  setBankAccountActiveInputModel,
  type UpdateBankAccountInputModel,
  updateBankAccountInputModel,
} from "./model";

const REFERENCE = "bank_details";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Bank account not found." });
const taken = () => new TRPCError({ code: "CONFLICT", message: "This account number is already added for this bank." });
// a UPI ID belongs to one account; the message's start tells the screen which field it's about
const upiTaken = () => new TRPCError({ code: "CONFLICT", message: "UPI ID already linked to another account." });

const isUniqueViolation = (error: unknown) =>
  ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code === "23505";

// the ledger's name wherever money moves: "SBI ••1234"
const ledgerName = (d: Pick<BankDetailsInputModel, "bankName" | "accountNumber">) => `${d.bankName} ••${d.accountNumber.slice(-4)}`.slice(0, 150);

// our bank accounts: each one has its own ledger under Asset → Bank and its UPI IDs. The same account number
// can't be added twice for one bank (with or without an IFSC); one is made inactive only once its balance is zero
export default class BankService {
  constructor(private readonly accounts = new AccountsService()) {}

  // the accounts with their ledgers and balances (one, when an id is given)
  private async read(where: ReturnType<typeof eq> | undefined): Promise<BankAccountModel[]> {
    const rows = await db
      .select({ bank: bankDetailsTable, ledgerId: ledgersTable.id })
      .from(bankDetailsTable)
      .innerJoin(ledgersTable, and(eq(ledgersTable.referenceTable, REFERENCE), eq(ledgersTable.referenceId, bankDetailsTable.id)))
      .where(where)
      .orderBy(asc(bankDetailsTable.bankName), asc(bankDetailsTable.createdAt));
    const ledgerIds = rows.map((r) => r.ledgerId);

    // balances, which ones have entries besides the opening balance, and their UPI IDs
    const ids = rows.map((r) => r.bank.id);
    const [balances, hasEntries, upis] = await Promise.all([
      this.accounts.balances(ledgerIds),
      this.accounts.withEntries(ledgerIds),
      ids.length === 0
        ? []
        : db.select().from(bankUpiIdsTable).where(inArray(bankUpiIdsTable.bankDetailsId, ids)).orderBy(asc(bankUpiIdsTable.createdAt)),
    ]);

    return Promise.all(
      rows.map(async ({ bank: b, ledgerId }) => ({
        id: b.id,
        ledgerId,
        bankName: b.bankName,
        accountHolderName: b.accountHolderName,
        branchName: b.branchName,
        accountNumber: b.accountNumber,
        last4: b.accountNumber.slice(-4),
        ifscCode: b.ifscCode,
        accountType: b.accountType,
        upiIds: upis.filter((u) => u.bankDetailsId === b.id).map((u) => ({ upiId: u.upiId, provider: u.provider })),
        isActive: b.isActive,
        balance: balances.get(ledgerId)!,
        openingBalance: await this.accounts.savedOpening(ledgerId),
        hasEntries: hasEntries.has(ledgerId),
      })),
    );
  }

  // every bank in the branch list (from Razorpay's IFSC dataset), for the bank dropdown
  async banks(): Promise<string[]> {
    const rows = await db.selectDistinct({ bank: ifscBranchesTable.bank }).from(ifscBranchesTable).orderBy(asc(ifscBranchesTable.bank));
    return rows.map((r) => r.bank);
  }

  // up to 30 of a bank's branches whose name or city holds the search; picking one gives its IFSC
  async branches(rawInput: BranchSearchInputModel): Promise<BranchModel[]> {
    const input = branchSearchInputModel.parse(rawInput);
    const like = `%${input.search.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
    return db
      .select({ ifsc: ifscBranchesTable.ifsc, branch: ifscBranchesTable.branch, city: ifscBranchesTable.city, district: ifscBranchesTable.district, state: ifscBranchesTable.state })
      .from(ifscBranchesTable)
      .where(
        and(
          eq(sql`lower(${ifscBranchesTable.bank})`, input.bank.toLowerCase()),
          sql`(lower(${ifscBranchesTable.branch}) like ${like} or lower(coalesce(${ifscBranchesTable.city}, '')) like ${like})`,
        ),
      )
      .orderBy(asc(ifscBranchesTable.branch))
      .limit(30);
  }

  async list(input: ListBankAccountsInputModel): Promise<BankAccountModel[]> {
    return this.read(input.includeInactive ? undefined : eq(bankDetailsTable.isActive, true));
  }

  async get(input: BankAccountIdInputModel): Promise<BankAccountModel> {
    const [bank] = await this.read(eq(bankDetailsTable.id, input.id));
    if (!bank) throw notFound();
    return bank;
  }

  // the same account number at the same bank is the same account (the IFSC can be left out, so it's checked by
  // bank too); and a UPI ID belongs to one account
  private async assertFree(tx: Tx, details: BankDetailsInputModel, exceptId?: string) {
    const [clash] = await tx
      .select({ id: bankDetailsTable.id })
      .from(bankDetailsTable)
      .where(
        and(
          eq(bankDetailsTable.accountNumber, details.accountNumber),
          eq(sql`lower(${bankDetailsTable.bankName})`, details.bankName),
          exceptId ? ne(bankDetailsTable.id, exceptId) : undefined,
        ),
      );
    if (clash) throw taken();
    if (details.upiIds.length > 0) {
      const [used] = await tx
        .select({ id: bankUpiIdsTable.id })
        .from(bankUpiIdsTable)
        .where(and(inArray(bankUpiIdsTable.upiId, details.upiIds.map((u) => u.upiId)), exceptId ? ne(bankUpiIdsTable.bankDetailsId, exceptId) : undefined));
      if (used) throw upiTaken();
    }
  }

  // the account's UPI IDs, as given (the old ones are replaced)
  private async setUpiIds(tx: Tx, bankId: string, upiIds: BankDetailsInputModel["upiIds"]) {
    await tx.delete(bankUpiIdsTable).where(eq(bankUpiIdsTable.bankDetailsId, bankId));
    if (upiIds.length > 0) await tx.insert(bankUpiIdsTable).values(upiIds.map((u) => ({ bankDetailsId: bankId, ...u })));
  }

  // a new account, its UPI IDs and its ledger, saved together or not at all (its opening balance is set on the
  // Opening balances page)
  async create(rawInput: CreateBankAccountInputModel, actor: ActorModel): Promise<BankAccountModel> {
    const { details } = createBankAccountInputModel.parse(rawInput);
    const { upiIds, ...row } = details;
    try {
      const id = await db.transaction(async (tx) => {
        await this.assertFree(tx, details);
        const [bank] = await tx.insert(bankDetailsTable).values(row).returning({ id: bankDetailsTable.id });
        await this.setUpiIds(tx, bank!.id, upiIds);
        const master = await this.accounts.master(tx, "bank");
        const [ledger] = await tx
          .insert(ledgersTable)
          .values({
            name: ledgerName(details),
            ledgerGroupId: master.ledgerGroupId,
            ledgerMasterId: master.id,
            referenceTable: REFERENCE,
            referenceId: bank!.id,
            balance: "0.00",
          })
          .returning({ id: ledgersTable.id });
        if (!ledger) throw notFound();
        return bank!.id;
      });
      return this.get({ id });
    } catch (error) {
      if (isUniqueViolation(error)) throw String((error as { cause?: { constraint?: string } }).cause?.constraint).includes("upi") ? upiTaken() : taken();
      throw error;
    }
  }

  // new details and UPI IDs; the ledger's name follows
  async update(rawInput: UpdateBankAccountInputModel, actor: ActorModel): Promise<BankAccountModel> {
    const { id, details } = updateBankAccountInputModel.parse(rawInput);
    const { upiIds, ...row } = details;
    try {
      await db.transaction(async (tx) => {
        await this.assertFree(tx, details, id);
        const updated = await tx.update(bankDetailsTable).set(row).where(eq(bankDetailsTable.id, id)).returning({ id: bankDetailsTable.id });
        if (updated.length === 0) throw notFound();
        await this.setUpiIds(tx, id, upiIds);
        const ledger = await this.accounts.ledgerOf(tx, REFERENCE, id);
        const name = ledgerName(details);
        await tx.update(ledgersTable).set({ name }).where(eq(ledgersTable.id, ledger.id));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw String((error as { cause?: { constraint?: string } }).cause?.constraint).includes("upi") ? upiTaken() : taken();
      throw error;
    }
    return this.get({ id });
  }

  // inactive only at a zero balance (post-dated entries included); its ledger follows, so nothing new posts
  // to it. Reactivating is always allowed
  async setActive(rawInput: SetBankAccountActiveInputModel): Promise<BankAccountModel> {
    const input = setBankAccountActiveInputModel.parse(rawInput);
    await db.transaction(async (tx) => {
      const [bank] = await tx.select({ id: bankDetailsTable.id }).from(bankDetailsTable).where(eq(bankDetailsTable.id, input.id)).for("update");
      if (!bank) throw notFound();
      // the ledger row is locked too, so a payment saving at the same moment either lands first (and blocks
      // this) or waits and then finds the ledger inactive
      const [ledger] = await tx
        .select({ id: ledgersTable.id, balance: ledgersTable.balance })
        .from(ledgersTable)
        .where(and(eq(ledgersTable.referenceTable, REFERENCE), eq(ledgersTable.referenceId, input.id)))
        .for("update");
      if (!ledger) throw notFound();
      if (!input.isActive && Number(ledger.balance) !== 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This account still has a balance. Bring it to zero first." });
      }
      await tx.update(bankDetailsTable).set({ isActive: input.isActive }).where(eq(bankDetailsTable.id, input.id));
      await tx.update(ledgersTable).set({ isActive: input.isActive }).where(eq(ledgersTable.id, ledger.id));
    });
    return this.get({ id: input.id });
  }
}
