"use client";

import { ArrowLeft, ChevronRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { useBankName } from "~/lib/bank-names";

import { trpc } from "~/trpc/client";

import { chip } from "../../product/row-styles";
import { postDatedText } from "../balance";
import { GroupHeader, GroupSearch } from "../group-header";
import { SignedAmount } from "../signed-amount";

// /account/bank, admin only and view only (accounts are added and edited in Entities → Bank accounts): a search (bank, branch, IFSC or account number) with Show
// inactive, both staying under the header, then a card per account (bank, ••last 4 and type on the left, today's
// balance and any post-dated amount on the right) opening its page
export function BanksBoard() {
  // bank names in the language picked
  const bankName = useBankName();
  const t = useTranslations("accounts.bank");
  const [showInactive, setShowInactive] = useState(false);
  const banks = trpc.accounts.bank.list.useQuery({ includeInactive: showInactive });
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const shown = (banks.data ?? []).filter(
    (b) =>
      needle === "" ||
      [b.bankName, b.branchName, b.ifscCode ?? "", b.accountNumber].some((v) =>
        v.toLowerCase().includes(needle),
      ),
  );

  return (
    <main className={`${PAGE} pb-16`}>
      {/* back to Asset, where Bank sits */}
      <Link
        href="/account/asset"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t("toAccounts")}
      </Link>

      {/* the group's name and total on the left; the search and Show inactive on the right */}
      <GroupHeader title={t("title")} head="asset" master="bank">
        <GroupSearch value={search} onChange={setSearch} label={t("search")} maxLength={50} />
        <button
          type="button"
          aria-pressed={showInactive}
          onClick={() => setShowInactive((v) => !v)}
          className={chip(showInactive)}
        >
          {t("showInactive")}
        </button>
      </GroupHeader>

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
              <Link
                href="/entities/banks"
                className="font-semibold text-ivory underline underline-offset-4"
              >
                {t("addFirst")}
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((b) => (
            <li key={b.id} className="min-w-0">
              {/* as the Entities card: the bank (with inactive), then its last digits and type on the left; on the right
                  the balance on top and the arrow under it that opens it */}
              <Link
                href={`/account/bank/${b.id}`}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-control border p-2 pl-4",
                  b.isActive
                    ? "on-ivory border-ivory bg-ivory text-chestnut"
                    : "border-dashed border-ivory/60 text-ivory",
                )}
              >
                <span className="min-w-0 flex-1 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="truncate font-heading text-xl font-bold leading-7"
                      title={bankName(b.bankName)}
                    >
                      {bankName(b.bankName)}
                    </span>
                    {!b.isActive && (
                      <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">
                        {t("inactive")}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs opacity-70">
                    <span className="tabular">••{b.last4}</span>
                    <span className="truncate">{t(`form.types.${b.accountType}`)}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 py-1.5 pr-2">
                  <SignedAmount
                    balance={b.balance.today}
                    head="asset"
                    className="font-heading text-xl font-bold leading-7"
                  />
                  {b.balance.postDated && (
                    <span className="tabular text-xs opacity-70">
                      {t("postDated", { amount: postDatedText(b.balance.postDated, "asset") })}
                    </span>
                  )}
                  <ChevronRight className="size-5 opacity-60" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
