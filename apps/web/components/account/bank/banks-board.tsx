"use client";

import { ArrowLeft, CircleAlert, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ClearButton } from "~/components/ui/clear-button";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { chip } from "../../product/row-styles";
import { postDatedText } from "../balance";
import { SignedAmount } from "../signed-amount";

// /account/bank, admin only and view only (accounts are added and edited in Entities → Bank accounts): a search (bank, branch, IFSC or account number) with Show
// inactive, both staying under the header, then a card per account (bank, ••last 4 and type on the left, today's
// balance and any post-dated amount on the right) opening its page
export function BanksBoard() {
  const tc = useTranslations("common");
  const t = useTranslations("accounts.bank");
  const [showInactive, setShowInactive] = useState(false);
  const banks = trpc.accounts.bank.list.useQuery({ includeInactive: showInactive });
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const shown = (banks.data ?? []).filter(
    (b) => needle === "" || [b.bankName, b.branchName, b.ifscCode ?? "", b.accountNumber].some((v) => v.toLowerCase().includes(needle)),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to Asset, where Bank sits */}
      <Link href="/account/asset" className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {t("toAccounts")}
      </Link>


      {/* search and Show inactive, under the header while the list scrolls */}
      <div className="sticky top-16 z-20 -mx-4 mt-2 flex items-center gap-2 bg-chestnut px-4 py-2 sm:-mx-6 sm:px-6">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-ivory/40 px-3 focus-within:border-ivory">
          <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
          <span className="sr-only">{t("search")}</span>
          <input
            type="search"
            value={search}
            maxLength={50}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="min-w-0 flex-1 bg-transparent text-base text-ivory outline-none placeholder:text-ivory/60"
          />
          {search && <ClearButton onClear={() => setSearch("")} label={tc("clearSearch")} />}
        </label>
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
      ) : shown.length === 0 ? (
        // none yet: they're added in Entities → Bank accounts
        <p className="mt-16 text-center text-ivory/70">
          {needle ? (
            t("noMatch")
          ) : (
            <>
              {t("emptyView")}{" "}
              <Link href="/entities/banks" className="font-semibold text-ivory underline underline-offset-4">
                {t("addFirst")}
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {shown.map((b) => (
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
                    <span className="truncate font-heading text-xl font-bold leading-7" title={titleCase(b.bankName)}>
                      {titleCase(b.bankName)}
                    </span>
                    {!b.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
                  </span>
                  <span className="tabular block truncate text-sm opacity-70">
                    ••{b.last4} · {t(`form.types.${b.accountType}`)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <SignedAmount balance={b.balance.today} head="asset" className="font-heading text-xl font-bold leading-7" />
                  {b.balance.postDated && <span className="tabular text-xs opacity-70">{t("postDated", { amount: postDatedText(b.balance.postDated, "asset") })}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

    </main>
  );
}
