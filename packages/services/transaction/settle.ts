import { TRPCError } from "@trpc/server";
import { and, eq } from "@repo/database";
import { bankDetailsTable, ledgersTable, lendersTable, partiesTable } from "@repo/database/schema";

import type AccountsService from "../accounts";
import { toPaise } from "../accounts/money";
import type { SettledInModel } from "../payment/model";
import type { Tx } from "../stock/engine";

// where money came in or went out: cash, or one of our active bank accounts. Shared by receipts and payments
export async function settleLedger(tx: Tx, accounts: AccountsService, settledIn: "cash" | "bank", bankDetailsId: string | null) {
  if (settledIn === "cash") return accounts.ledgerId(tx, "cash");
  if (!bankDetailsId) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the bank account." });
  const [bank] = await tx.select({ isActive: bankDetailsTable.isActive }).from(bankDetailsTable).where(eq(bankDetailsTable.id, bankDetailsId));
  if (!bank) throw new TRPCError({ code: "NOT_FOUND", message: "Bank account not found." });
  if (!bank.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That bank account is inactive." });
  return (await accounts.ledgerOf(tx, "bank_details", bankDetailsId)).id;
}

// where a payment's money comes from, or a receipt's goes into: the cash ledger and the first bank account's, whichever
// are used, and how much each takes (paise). More accounts each take their part; the first account takes what's left of
// the bank's share
export async function moneyPartsIn(
  tx: Tx,
  accounts: AccountsService,
  p: { settledIn: SettledInModel; bankDetailsId: string | null; cashAmount: number | null; moreBankParts?: { bankDetailsId: string; amount: number }[]; amount: number },
) {
  const cashLedger = p.settledIn === "bank" ? null : await settleLedger(tx, accounts, "cash", null);
  const bankLedger = p.settledIn === "cash" ? null : await settleLedger(tx, accounts, "bank", p.bankDetailsId);
  const cashPart = p.settledIn === "cash" ? toPaise(p.amount) : p.settledIn === "bank" ? 0 : toPaise(p.cashAmount ?? 0);
  const more = [];
  for (const b of p.settledIn === "cash" ? [] : (p.moreBankParts ?? [])) {
    more.push({ bankDetailsId: b.bankDetailsId, ledger: await settleLedger(tx, accounts, "bank", b.bankDetailsId), part: toPaise(b.amount) });
  }
  const morePaid = more.reduce((sum, b) => sum + b.part, 0);
  return { cashLedger, bankLedger, cashPart, bankPart: toPaise(p.amount) - cashPart - morePaid, more };
}

// the other side of a receipt or payment: any active ledger but cash and the bank accounts (money between those is a
// deposit, withdrawal or transfer), with the party or lender behind it when there is one
export async function counterLedger(tx: Tx, accounts: AccountsService, ledgerId: string) {
  const [ledger] = await tx.select().from(ledgersTable).where(eq(ledgersTable.id, ledgerId));
  if (!ledger) throw new TRPCError({ code: "NOT_FOUND", message: "Ledger not found." });
  if (!ledger.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${ledger.name} is inactive.` });
  const cash = await accounts.ledgerId(tx, "cash");
  if (ledger.id === cash || ledger.referenceTable === "bank_details") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Money between cash and banks is a deposit, withdrawal or transfer." });
  }
  const party =
    ledger.referenceTable === "parties" && ledger.referenceId
      ? (await tx.select().from(partiesTable).where(and(eq(partiesTable.id, ledger.referenceId))))[0] ?? null
      : null;
  const lender =
    ledger.referenceTable === "lenders" && ledger.referenceId
      ? (await tx.select().from(lendersTable).where(eq(lendersTable.id, ledger.referenceId)))[0] ?? null
      : null;
  return { ledger, party, lender };
}
