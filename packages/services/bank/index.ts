import { TRPCError } from "@trpc/server";
import { and, asc, db, eq } from "@repo/database";
import { bankDetailsTable, ledgersTable } from "@repo/database/schema";

import AccountsService from "../accounts";
import type { ActorModel } from "../accounts/model";
import {
  type BankAccountIdInputModel,
  type BankAccountModel,
  type BankDetailsInputModel,
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
const taken = () => new TRPCError({ code: "CONFLICT", message: "This account number and IFSC are already added." });

const isUniqueViolation = (error: unknown) =>
  ((error as { cause?: { code?: string } })?.cause ?? (error as { code?: string }))?.code === "23505";

// the ledger's name wherever money moves: "SBI ••1234"
const ledgerName = (d: Pick<BankDetailsInputModel, "bankName" | "accountNumber">) => `${d.bankName} ••${d.accountNumber.slice(-4)}`.slice(0, 150);

// our bank accounts: each one has its own ledger under Asset → Bank, opened with its opening balance in
// the same save. One is made inactive only once its balance is zero
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

    // balances, and which ones have entries besides the opening balance
    const [balances, hasEntries] = await Promise.all([this.accounts.balances(ledgerIds), this.accounts.withEntries(ledgerIds)]);

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
        upiId: b.upiId,
        isActive: b.isActive,
        balance: balances.get(ledgerId)!,
        openingBalance: await this.accounts.savedOpening(ledgerId),
        hasEntries: hasEntries.has(ledgerId),
      })),
    );
  }

  async list(input: ListBankAccountsInputModel): Promise<BankAccountModel[]> {
    return this.read(input.includeInactive ? undefined : eq(bankDetailsTable.isActive, true));
  }

  async get(input: BankAccountIdInputModel): Promise<BankAccountModel> {
    const [bank] = await this.read(eq(bankDetailsTable.id, input.id));
    if (!bank) throw notFound();
    return bank;
  }

  // a new account, its ledger and its opening balance, saved together or not at all
  async create(rawInput: CreateBankAccountInputModel, actor: ActorModel): Promise<BankAccountModel> {
    const { details, openingBalance } = createBankAccountInputModel.parse(rawInput);
    try {
      const id = await db.transaction(async (tx) => {
        const [bank] = await tx.insert(bankDetailsTable).values(details).returning({ id: bankDetailsTable.id });
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
          .returning({ id: ledgersTable.id, name: ledgersTable.name });
        await this.accounts.setOpeningBalance(tx, ledger!, openingBalance, actor);
        return bank!.id;
      });
      return this.get({ id });
    } catch (error) {
      if (isUniqueViolation(error)) throw taken();
      throw error;
    }
  }

  // new details (the ledger's name follows) and opening balance, saved together
  async update(rawInput: UpdateBankAccountInputModel, actor: ActorModel): Promise<BankAccountModel> {
    const { id, details, openingBalance } = updateBankAccountInputModel.parse(rawInput);
    try {
      await db.transaction(async (tx) => {
        const updated = await tx.update(bankDetailsTable).set(details).where(eq(bankDetailsTable.id, id)).returning({ id: bankDetailsTable.id });
        if (updated.length === 0) throw notFound();
        const ledger = await this.accounts.ledgerOf(tx, REFERENCE, id);
        const name = ledgerName(details);
        await tx.update(ledgersTable).set({ name }).where(eq(ledgersTable.id, ledger.id));
        await this.accounts.setOpeningBalance(tx, { id: ledger.id, name }, openingBalance, actor);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw taken();
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
