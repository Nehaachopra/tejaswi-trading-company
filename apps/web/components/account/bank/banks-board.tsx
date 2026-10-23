"use client";

import { ArrowLeft, CircleAlert, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { chip } from "../../product/row-styles";
import { balanceText, postDatedText } from "../balance";
import { BankSheet } from "./bank-sheet";

// /account/bank, admin only: + Add bank account, then a card per account (bank, ••last 4 and type on the
// left, today's balance and any post-dated amount on the right) opening its page; inactive ones on request
export function BanksBoard() {
  const t = useTranslations("accounts.bank");
  const [showInactive, setShowInactive] = useState(false);
  const banks = trpc.accounts.bank.list.useQuery({ includeInactive: showInactive });
  const [adding, setAdding] = useState(false);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to all accounts */}
      <Link href="/account" className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {t("toAccounts")}
      </Link>

      {/* the actions: Add bank account, Show inactive */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ivory px-5 font-heading text-lg font-bold text-chestnut sm:w-auto"
        >
          <Plus className="size-5" aria-hidden /> {t("add")}
        </button>
        <button type="button" aria-pressed={showInactive} onClick={() => setShowInactive((v) => !v)} className={chip(showInactive)}>
          {t("showInactive")}
        </button>
      </div>

      {/* the accounts */}
      {banks.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : banks.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : banks.data.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{t("empty")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {banks.data.map((b) => (
            <li key={b.id}>
              <Link
                href={`/account/bank/${b.id}`}
                className={cn(
                  "flex items-center gap-3 rounded-control border p-4",
                  b.isActive ? "on-ivory border-ivory bg-ivory text-chestnut" : "border-dashed border-ivory/60 text-ivory",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-heading text-xl font-bold leading-7" title={b.bankName}>
                      {b.bankName}
                    </span>
                    {!b.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
                  </span>
                  <span className="tabular block truncate text-sm opacity-70">
                    ••{b.last4} · {t(`form.types.${b.accountType}`)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="tabular font-heading text-xl font-bold leading-7">{balanceText(b.balance.today)}</span>
                  {b.balance.postDated && <span className="tabular text-xs opacity-70">{t("postDated", { amount: postDatedText(b.balance.postDated, "debit") })}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BankSheet bankId={adding ? "new" : null} onClose={() => setAdding(false)} />
    </main>
  );
}
