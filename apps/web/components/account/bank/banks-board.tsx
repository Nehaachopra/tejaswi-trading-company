"use client";

import { ArrowLeft, CircleAlert } from "lucide-react";
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
import { AccountCard, CARD_GRID, CARD_LINE, CardTag } from "../account-card";

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
        <ul className={cn("mt-2", CARD_GRID)}>
          {shown.map((b) => (
            <li key={b.id} className="min-w-0">
              {/* the shared card: the bank (with inactive), its last digits and type; the balance and the arrow that
                  opens it on the right */}
              <AccountCard
                href={`/account/bank/${b.id}`}
                name={bankName(b.bankName)}
                title={bankName(b.bankName)}
                inactive={!b.isActive}
                tags={!b.isActive && <CardTag strong>{t("inactive")}</CardTag>}
                lines={
                  <span className={CARD_LINE}>
                    <span className="tabular">••{b.last4}</span>
                    <span className="truncate">{t(`form.types.${b.accountType}`)}</span>
                  </span>
                }
                amount={
                  <SignedAmount
                    balance={b.balance.today}
                    head="asset"
                    className="font-heading text-xl font-bold leading-7"
                  />
                }
                postDated={
                  b.balance.postDated
                    ? t("postDated", { amount: postDatedText(b.balance.postDated, "asset") })
                    : null
                }
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
