"use client";

import { ArrowLeft, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/spinner";
import { trpc } from "~/trpc/client";

import { balanceText, postDatedText } from "./balance";
import { LedgerStatement } from "./ledger-statement";

// /account/ledgers/[id], admin only: one ledger's name, head and balance on top, its statement below
export function LedgerPage({ ledgerId }: { ledgerId: string }) {
  const t = useTranslations("accounts.overview");
  const ledger = trpc.accounts.ledger.get.useQuery({ id: ledgerId });

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      {/* back to all accounts */}
      <Link href="/account" className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {t("title")}
      </Link>

      {ledger.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner />
        </p>
      ) : ledger.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          {/* the ledger: name, its head, today's balance */}
          <section className="on-ivory rounded-control bg-ivory p-4 text-chestnut">
            <h1 className="truncate font-heading text-2xl font-bold" title={ledger.data.name}>
              {ledger.data.name}
            </h1>
            <p className="text-sm text-chestnut/70">{t(`heads.${ledger.data.head}`)}</p>
            <p className="tabular mt-2 font-heading text-3xl font-bold">{balanceText(ledger.data.balance.today)}</p>
            {ledger.data.balance.postDated && (
              <p className="tabular text-sm text-chestnut/70">
                {t("postDated", {
                  amount: postDatedText(ledger.data.balance.postDated, ledger.data.head === "asset" || ledger.data.head === "expense" ? "debit" : "credit"),
                })}
              </p>
            )}
          </section>

          <LedgerStatement ledgerId={ledgerId} />
        </div>
      )}
    </main>
  );
}
