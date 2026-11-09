"use client";

import { ChevronRight, CircleAlert, Plus } from "lucide-react";
import Link from "next/link";

import { cn } from "~/lib/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ADD_BUTTON, PAGE } from "~/components/ui/page-styles";
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
  parties: "/account/parties",
  // bank loans, the rent owed to each landlord, and employees: their ledgers listed on one page (they are added and
  // changed in Entities)
  lenders: "/account/group/lenders",
  rentPayable: "/account/group/rentPayable",
  employees: "/account/group/employees",
  // the GST owed: output and reverse-charge GST together
  gstPayable: "/account/group/gstPayable",
};

// /account, admin only: every ledger account under its head (Asset, Liability, Income, Expense, Profit, Loss),
// each head with its total (or one head, on its own page). Sub-groups (Bank, Debtors ...) are cards with the total of their ledgers; the
// ledgers directly under a head are rows opening their statements; Profit and Loss show the worked-out result, with their
// own ledgers under it
export function AccountsBoard({ only }: { only?: Head["head"] }) {
  const t = useTranslations("accounts.overview");
  const overview = trpc.accounts.overview.useQuery();
  const heads = (overview.data?.heads ?? []).filter((h) => !only || h.head === only);
  const soon = () => toast.info(t("comingSoon"));
  const nameOf = useLedgerName();
  const [sheet, setSheet] = useState<LedgerSheetFor | null>(null);
  // a ledger of its own can be added under any of the six heads (one under Profit or Loss counts in the worked-out result)
  const addable = only ?? null;

  // the search: ledger and sub-group names, as they read in this language
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const fits = (name: string) => needle === "" || name.toLowerCase().includes(needle);

  return (
    <main className={`${PAGE} pb-16`}>
      <h1 className="sr-only">{only ? t(`heads.${only}`) : t("title")}</h1>

      {/* + New ledger, under this head */}
      {addable && (
        <button
          type="button"
          onClick={() => setSheet({ kind: "new", head: addable })}
          className={`mb-6 ${ADD_BUTTON}`}
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
              {/* the head with its total beside it, then a search over its ledgers and sub-groups (on its own page),
                  staying under the page header while its accounts scroll by */}
              <header className="sticky top-16 z-10 -mx-4 mb-3 flex flex-wrap items-center gap-x-2 gap-y-2.5 border-b border-ivory/20 bg-chestnut px-4 py-3 sm:-mx-6 sm:flex-nowrap sm:px-6">
                <h2 id={`head-${h.head}`} className="shrink-0 font-heading text-2xl font-bold">
                  {t(`heads.${h.head}`)}
                </h2>
                {/* its total right beside the name, an ivory pill (red when it's the wrong way round) */}
                <SignedAmount balance={h.total} head={h.head} badge onChestnut className="ml-1 shrink-0 font-heading text-lg font-bold" />
                {addable ? <HeadSearch value={search} onChange={setSearch} label={t("search")} /> : <span className="flex-1" />}
              </header>

              {/* profit and loss: their total is worked out from everything; their own ledgers are listed under it */}
              {(h.head === "profit" || h.head === "loss") && <p className="text-sm text-ivory/70">{t("worked")}</p>}

              {/* its sub-groups */}
              {masters.length > 0 && (
                <ul className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {masters.map((m) => {
                    const href = MASTER_PAGE[m.key];
                    // two lines: the name with its balance, then how many ledgers with the arrow that opens them
                    const body = (
                      <>
                        <span className="flex min-w-0 items-baseline gap-3">
                          <span className="min-w-0 flex-1 truncate font-heading text-xl font-bold leading-7">{t(`masters.${m.key}`)}</span>
                          <SignedAmount balance={m.total} head={h.head} className="shrink-0 font-heading text-lg font-bold" />
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 text-sm text-chestnut/70">{t("ledgers", { count: m.ledgers })}</span>
                          <ChevronRight className="size-5 shrink-0 text-chestnut/60" aria-hidden />
                        </span>
                      </>
                    );
                    const card = "on-ivory flex w-full flex-col gap-0.5 rounded-control bg-ivory p-4 text-left text-chestnut";
                    return (
                      <li key={m.key} className="min-w-0">
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

              {/* the ledgers directly under it: a card each, in the same grid as the sub-groups, so a name sits close to
                  its balance on a wide screen */}
              {/* set apart from the sub-groups above by a line, so groups and single ledgers read as two sets */}
              {ledgers.length > 0 && (
                <ul className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", masters.length > 0 && "mt-6 border-t border-ivory/25 pt-6")}>
                  {/* sorted by the name as it reads in this language */}
                  {[...ledgers].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map((l) => (
                    <li key={l.id} className="min-w-0">
                      {/* one line: the name (cut short with dots when long), its balance and the arrow that opens it; its tags
                          and any post-dated balance on a second line only when it has them */}
                      <Link href={`/account/ledgers/${l.id}`} className="on-ivory flex flex-col gap-1 rounded-control bg-ivory p-4 text-chestnut hover:bg-[color-mix(in_srgb,var(--color-ivory)_94%,var(--color-chestnut))]">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="min-w-0 flex-1 truncate font-heading text-xl font-bold leading-7" title={nameOf(l)}>
                            {nameOf(l)}
                          </span>
                          <SignedAmount balance={l.balance.today} head={h.head} className="shrink-0 font-heading text-lg font-bold" />
                          <ChevronRight className="size-5 shrink-0 text-chestnut/60" aria-hidden />
                        </span>
                        {(l.custom || !l.isActive || l.balance.postDated) && (
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            {/* one the admin added, and whether it's still in use */}
                            {l.custom && <span className="shrink-0 rounded-control border border-chestnut/40 px-1.5 py-0.5 text-[0.7rem]">{t("added")}</span>}
                            {!l.isActive && <span className="shrink-0 rounded-control border border-current px-1.5 py-0.5 text-[0.7rem]">{t("inactive")}</span>}
                            {l.balance.postDated && <span className="tabular text-xs text-chestnut/70">{t("postDated", { amount: postDatedText(l.balance.postDated, h.head) })}</span>}
                          </span>
                        )}
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
