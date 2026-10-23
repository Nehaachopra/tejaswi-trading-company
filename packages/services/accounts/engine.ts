import { TRPCError } from "@trpc/server";
import { asc, eq, inArray } from "@repo/database";
import { ledgerEntriesTable, ledgersTable } from "@repo/database/schema";

import type { Tx } from "../stock/engine";
import { fromPaise, isAmount, toPaise } from "./money";
import type { Posting, Reversal, Side } from "./model";

type Line = { ledgerId: string; side: Side; paise: number };

// the one path every ledger entry takes: each transaction posts its debit and credit lines here, inside
// its own database transaction, so the record and its entries are saved together or not at all.
// It keeps each ledger's total balance in step and refuses lines that don't balance or touch an
// inactive ledger
export default class LedgerEngine {
  async post(tx: Tx, posting: Posting) {
    if (posting.lines.some((l) => !isAmount(l.amount))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Amounts are above zero, in rupees and paise." });
    }
    const lines = posting.lines.map((l) => ({ ledgerId: l.ledgerId, side: l.side, paise: toPaise(l.amount) }));
    const total = (side: Side) => lines.filter((l) => l.side === side).reduce((sum, l) => sum + l.paise, 0);
    if (total("debit") === 0 || total("debit") !== total("credit")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Debits and credits must be equal." });
    }
    await this.write(tx, posting.transactionId, posting.dateTime, lines, { isContra: posting.isContra ?? false, isReversal: false });
  }

  // undoes what a transaction posted, on a cancel or before an edit posts it again: each ledger gets the
  // opposite of its net, dated as given. Inactive ledgers are reversed too
  async reverse(tx: Tx, reversal: Reversal) {
    const entries = await tx.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.transactionId, reversal.transactionId));
    const net = new Map<string, number>();
    for (const e of entries) {
      net.set(e.ledgerId, (net.get(e.ledgerId) ?? 0) + (e.transactionType === "debit" ? 1 : -1) * toPaise(e.amount));
    }
    const lines: Line[] = [...net]
      .filter(([, paise]) => paise !== 0)
      .map(([ledgerId, paise]) => ({ ledgerId, side: paise > 0 ? "credit" : "debit", paise: Math.abs(paise) }));
    if (lines.length === 0) return;
    await this.write(tx, reversal.transactionId, reversal.dateTime, lines, { isContra: entries[0]!.isContra, isReversal: true });
  }

  private async write(tx: Tx, transactionId: string, dateTime: Date, lines: Line[], flags: { isContra: boolean; isReversal: boolean }) {
    // lock the ledgers, always in the same order, so two saves touching the same ledgers queue up instead
    // of deadlocking, and the second one adds to what the first left
    const ids = [...new Set(lines.map((l) => l.ledgerId))].sort();
    const ledgers = await tx.select().from(ledgersTable).where(inArray(ledgersTable.id, ids)).orderBy(asc(ledgersTable.id)).for("update");
    if (ledgers.length !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "Ledger not found." });
    const inactive = !flags.isReversal && ledgers.find((l) => !l.isActive);
    if (inactive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${inactive.name} is inactive.` });

    // each balance after these lines, debit as plus and credit as minus
    const signed = new Map(ledgers.map((l) => [l.id, (l.balanceType === "debit" ? 1 : -1) * toPaise(l.balance)]));
    for (const l of lines) signed.set(l.ledgerId, signed.get(l.ledgerId)! + (l.side === "debit" ? 1 : -1) * l.paise);

    // the entries, then the ledger balances
    await tx.insert(ledgerEntriesTable).values(
      lines.map((l) => ({
        transactionId,
        ledgerId: l.ledgerId,
        dateTime,
        amount: fromPaise(l.paise),
        transactionType: l.side,
        isContra: flags.isContra,
        isReversal: flags.isReversal,
      })),
    );
    for (const [ledgerId, balance] of signed) {
      await tx
        .update(ledgersTable)
        .set({ balance: fromPaise(Math.abs(balance)), balanceType: balance < 0 ? "credit" : "debit" })
        .where(eq(ledgersTable.id, ledgerId));
    }
  }
}
