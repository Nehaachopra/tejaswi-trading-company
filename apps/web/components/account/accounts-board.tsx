"use client";

import { ChevronRight, CircleAlert, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { postDatedText } from "./balance";
import { HeadSearch } from "./head-search";
import { SignedAmount } from "./signed-amount";
import { useLedgerName } from "./ledger-name";
import { LedgerSheet, type LedgerSheetFor } from "./ledger-sheet";

type Head = RouterOutputs["accounts"]["overview"]["heads"][number];

// where each sub-group's ledgers are listed; the rest come with their steps
const MASTER_PAGE: Record<string, string | undefined> = {
  bank: "/account/bank",
  debtors: "/account/debtor",
  creditors: "/account/creditor",
  debtorCreditors: "/account/debtor-creditor",
};

// /account, admin only: every ledger account under its head (Asset, Liability, Income, Expense, Profit, Loss),
// each head with its total (or one head, on its own page). Sub-groups (Bank, Debtors ...) are cards with the total of their ledgers; the
// ledgers directly under a head are rows opening their statements; Profit and Loss are worked out
export function AccountsBoard({ only }: { only?: Head["head"] }) {
  const t = useTranslations("accounts.overview");
  const overview = trpc.accounts.overview.useQuery();
  const heads = (overview.data?.heads ?? []).filter((h) => !only || h.head === only);
  const soon = () => toast.info(t("comingSoon"));
  const nameOf = useLedgerName();
  const [sheet, setSheet] = useState<LedgerSheetFor | null>(null);
  // a ledger of its own can be added under Asset, Liability, Income and Expense (Profit and Loss are worked out)
  const addable = only && only !== "profit" && only !== "loss" ? only : null;

  // the search: ledger and sub-group names, as they read in this language
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const fits = (name: string) => needle === "" || name.toLowerCase().includes(needle);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="sr-only">{only ? t(`heads.${only}`) : t("title")}</h1>

      {/* + New ledger, under this head */}
      {addable && (
        <button
          type="button"
          onClick={() => setSheet({ kind: "new", head: addable })}
          className="mb-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ivory px-5 font-heading text-lg font-bold text-chestnut sm:w-auto"
        >
          <Plus className="size-5" aria-hidden /> {t("newLedger")}
        </button>
      )}

      {overview.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : overview.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {heads.map((h) => {
            // what the search leaves
            const masters = h.masters.filter((m) => fits(t(`masters.${m.key}`)));
            const ledgers = h.ledgers.filter((l) => fits(nameOf(l)));
            return (
            <section key={h.head} aria-labelledby={`head-${h.head}`}>
              {/* the head and its total, staying under the page header while its accounts scroll by */}
              {/* the head, a search over its ledgers and sub-groups (on its own page), and its total, staying under
                  the page header while its accounts scroll by */}
              <header className="sticky top-16 z-10 -mx-4 mb-3 flex items-center gap-2 border-b border-ivory/20 bg-chestnut px-4 py-3 sm:-mx-6 sm:px-6">
                <h2 id={`head-${h.head}`} className="shrink-0 font-heading text-2xl font-bold">
                  {t(`heads.${h.head}`)}
                </h2>
                {addable ? <HeadSearch value={search} onChange={setSearch} label={t("search")} /> : <span className="flex-1" />}
                <SignedAmount balance={h.total} head={h.head} className="shrink-0 font-heading text-xl font-bold" />
              </header>

              {/* profit and loss: worked out, nothing posts to them */}
              {(h.head === "profit" || h.head === "loss") && <p className="text-sm text-ivory/70">{t("worked")}</p>}

              {/* its sub-groups */}
              {masters.length > 0 && (
                <ul className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {masters.map((m) => {
                    const href = MASTER_PAGE[m.key];
                    const body = (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-heading text-xl font-bold leading-7">{t(`masters.${m.key}`)}</span>
                          <span className="block text-sm text-chestnut/70">{t("ledgers", { count: m.ledgers })}</span>
                        </span>
                        <SignedAmount balance={m.total} head={h.head} className="shrink-0 font-heading text-lg font-bold" />
                        <ChevronRight className="size-5 shrink-0 text-chestnut/60" aria-hidden />
                      </>
                    );
                    const card = "on-ivory flex w-full items-center gap-3 rounded-control bg-ivory p-4 text-left text-chestnut";
                    return (
                      <li key={m.key}>
                        {href ? (
                          <Link href={href} className={card}>
                            {body}
                          </Link>
                        ) : (
                          <button type="button" onClick={soon} className={card}>
                            {body}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* the ledgers directly under it */}
              {ledgers.length > 0 && (
                <ul className="on-ivory divide-y divide-chestnut/10 overflow-hidden rounded-control bg-ivory text-chestnut">
                  {/* sorted by the name as it reads in this language */}
                  {[...ledgers].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map((l) => (
                    <li key={l.id}>
                      <Link href={`/account/ledgers/${l.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-chestnut/5">
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate font-medium" title={nameOf(l)}>
                            {nameOf(l)}
                          </span>
                          {/* one the admin added, and whether it's still in use */}
                          {l.custom && <span className="shrink-0 rounded-control border border-chestnut/40 px-1.5 py-0.5 text-[0.7rem]">{t("added")}</span>}
                          {!l.isActive && <span className="shrink-0 rounded-control border border-current px-1.5 py-0.5 text-[0.7rem]">{t("inactive")}</span>}
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                          <SignedAmount balance={l.balance.today} head={h.head} className="font-medium" />
                          {l.balance.postDated && <span className="tabular text-xs text-chestnut/70">{t("postDated", { amount: postDatedText(l.balance.postDated, h.head) })}</span>}
                        </span>
                        {/* the same arrow as the sub-group cards: this opens its ledger */}
                        <ChevronRight className="size-5 shrink-0 text-chestnut/60" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {/* nothing left after the search or the range */}
              {needle !== "" && masters.length + ledgers.length === 0 && <p className="py-8 text-center text-ivory/70">{t("noMatch")}</p>}
            </section>
            );
          })}
        </div>
      )}
      <LedgerSheet open={sheet} onClose={() => setSheet(null)} />
    </main>
  );
}
