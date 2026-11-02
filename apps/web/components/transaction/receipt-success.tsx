"use client";

import { CircleAlert, CircleCheck, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { CopyButton } from "~/components/ui/copy-button";
import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { useLedgerName } from "../account/ledger-name";
import { NEW_TRANSACTION_HREF } from "../shell/nav-items";

// /transaction/receipt/[id] and /transaction/payment/[id], where a saved receipt or payment lands (and its voucher
// returns to): that it worked, its number and voucher, its journal entry (the admin's only), and the way to a new
// transaction
export function ReceiptSuccess({ id, flow = "receipt" }: { id: string; flow?: "receipt" | "payment" }) {
  const base = useTranslations("transactions.receipt.success");
  // a payment's own words where it has them, the receipt's otherwise
  const own = useTranslations("transactions.payment.success");
  const t = ((key: string) => (flow === "payment" && own.has(key as never) ? own(key as never) : base(key as never))) as typeof base;
  const nameOf = useLedgerName();
  const isPayment = flow === "payment";
  const receiptGet = trpc.transactions.receipt.get.useQuery({ transactionId: id }, { enabled: !isPayment });
  const receiptBalances = trpc.transactions.receipt.balances.useQuery({ transactionId: id }, { enabled: !isPayment });
  const paymentGet = trpc.transactions.payment.get.useQuery({ transactionId: id }, { enabled: isPayment });
  const paymentBalances = trpc.transactions.payment.balances.useQuery({ transactionId: id }, { enabled: isPayment });
  const receipt = isPayment ? paymentGet : receiptGet;
  // the ledgers it moved, for their names (their balances aren't shown: they'd read as this transaction's amounts)
  const balances = isPayment ? paymentBalances : receiptBalances;
  // what it posted, the debit side first, then largest first and by name so it always reads the same; the admin's only
  const posted = trpc.transactions.history.get.useQuery({ id }, { retry: false });
  const journal = (posted.data?.lines ?? [])
    .filter((l) => !l.isReversal)
    .sort((a, b) => (a.side === b.side ? b.amount - a.amount || a.ledgerName.localeCompare(b.ledgerName) : a.side === "debit" ? -1 : 1));
  const ledgerOf = (ledgerId: string) => balances.data?.find((l) => l.id === ledgerId);

  return (
    <main className={`${PAGE} pb-28`}>
      <h1 className="sr-only">{t("title")}</h1>

      {receipt.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : receipt.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : (
        <section role="status" className="on-ivory flex flex-col items-center gap-6 rounded-control bg-ivory p-6 text-center text-chestnut sm:p-8">
          {/* it worked */}
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-20 place-items-center rounded-full bg-success/15">
              <CircleCheck className="size-12 text-success" strokeWidth={2.25} aria-hidden />
            </span>
            <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
          </div>

          {/* its number, and the voucher */}
          <div className="flex w-full flex-col items-center gap-3">
            <p className="flex items-center gap-1 text-sm">
              {t("number")} <span className="font-heading text-xl font-bold">{receipt.data.assignedId}</span>
              <CopyButton value={receipt.data.assignedId} />
            </p>
            <Link href={`/transaction/${flow}/${id}/voucher`} className="flex min-h-11 items-center gap-2 rounded-control border border-chestnut/50 px-4 text-sm font-semibold">
              <FileText className="size-4" aria-hidden /> {t("voucher")}
            </Link>
          </div>

          {/* the journal entry, debit first */}
          {journal.length > 0 && balances.data && (
            <div className="w-full max-w-lg rounded-control border border-chestnut/25 p-4 text-left">
              <h3 className="mb-2 font-heading text-lg font-bold">{t("journal")}</h3>
              {/* written as an accountant writes it: "Rent Dr", then "To Bank" set in, each amount in its own column */}
              <div className="tabular grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 text-sm">
                {journal.map((l, i) => {
                  const ledger = ledgerOf(l.ledgerId);
                  const name = ledger ? nameOf(ledger) : titleCase(l.ledgerName);
                  const debit = l.side === "debit";
                  return (
                    <Fragment key={i}>
                      <span className={cn("min-w-0", !debit && "pl-6")}>{debit ? `${name} Dr` : `To ${name}`}</span>
                      <span className="text-right">{debit ? rupees(l.amount) : ""}</span>
                      <span className="text-right">{debit ? "" : rupees(l.amount)}</span>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* on to the next one */}
          <Link href={NEW_TRANSACTION_HREF} className="flex min-h-11 items-center gap-2 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory transition-colors hover:bg-chestnut/90">
            <Plus className="size-5" strokeWidth={2.5} aria-hidden /> {t("newTransaction")}
          </Link>
        </section>
      )}
    </main>
  );
}
