"use client";

import { ArrowLeft, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/spinner";
import { trpc } from "~/trpc/client";

import { useLedgerName } from "./ledger-name";
import { LedgerStatement } from "./ledger-statement";

// /account/ledgers/[id], admin only: one ledger's statement, under its name and today's balance
export function LedgerPage({ ledgerId }: { ledgerId: string }) {
  const t = useTranslations("accounts.overview");
  const ledger = trpc.accounts.ledger.get.useQuery({ id: ledgerId });
  const nameOf = useLedgerName();

  return (
    // little room below: the statement fills the screen and scrolls inside itself
    <main className="mx-auto max-w-5xl px-4 pb-6 pt-6 sm:px-6">
      {/* back to the ledger's head */}
      <Link href={ledger.data ? `/account/${ledger.data.head}` : "/account"} className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {ledger.data ? t(`heads.${ledger.data.head}`) : t("title")}
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
        <div className="mt-2">
          <h1 className="sr-only">{nameOf(ledger.data)}</h1>
          <LedgerStatement ledgerId={ledgerId} name={nameOf(ledger.data)} balance={ledger.data.balance} />
        </div>
      )}
    </main>
  );
}
