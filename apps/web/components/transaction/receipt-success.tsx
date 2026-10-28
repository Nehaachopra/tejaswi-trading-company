"use client";

import { CircleAlert, CircleCheck, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { SlotAmount } from "~/components/ui/slot-amount";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { signed } from "../account/balance";
import { useLedgerName } from "../account/ledger-name";
import { NEW_TRANSACTION_HREF } from "../shell/nav-items";

// /transaction/receipt/[id], where a saved receipt lands (and the voucher returns to): that it worked, its number
// and voucher, the balances of the ledgers it moved (rolling into place; the admin's only), and the way to a new
// transaction
export function ReceiptSuccess({ id }: { id: string }) {
  const t = useTranslations("transactions.receipt.success");
  const nameOf = useLedgerName();
  const receipt = trpc.transactions.receipt.get.useQuery({ transactionId: id });
  const balances = trpc.transactions.receipt.balances.useQuery({ transactionId: id });

  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-6 sm:px-6">
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
            <p className="text-sm">
              {t("number")} <span className="font-heading text-xl font-bold">{receipt.data.assignedId}</span>
            </p>
            <Link href={`/transaction/receipt/${id}/voucher`} className="flex min-h-11 items-center gap-2 rounded-control border border-chestnut/50 px-4 text-sm font-semibold">
              <FileText className="size-4" aria-hidden /> {t("voucher")}
            </Link>
          </div>

          {/* the balances now, rolling into place */}
          {balances.data && balances.data.length > 0 && (
            <div className="w-full text-left">
              <h3 className="mb-2 font-heading text-lg font-bold">{t("balances")}</h3>
              <ul className="divide-y divide-chestnut/10 rounded-control border border-chestnut/15">
                {balances.data.map((l) => {
                  const { text, negative } = signed(l.balance.today, l.head);
                  return (
                    <li key={l.id} className="flex min-h-12 items-center gap-3 px-4">
                      <span className="min-w-0 flex-1 truncate text-sm">{nameOf(l)}</span>
                      <SlotAmount text={text} className={cn("shrink-0 font-heading text-lg font-bold", negative && "rounded-control bg-danger px-1.5 text-ivory")} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* on to the next one */}
          <Link href={NEW_TRANSACTION_HREF} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory">
            <Plus className="size-5" strokeWidth={2.5} aria-hidden /> {t("newTransaction")}
          </Link>
        </section>
      )}
    </main>
  );
}
