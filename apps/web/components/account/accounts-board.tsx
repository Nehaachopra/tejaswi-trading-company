"use client";

import { CircleAlert, Plus } from "lucide-react";

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
import { AccountCard, CARD_GRID, CARD_LINE, CardTag } from "./account-card";

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
  // people who lend to us, and brokers we pay
  personalLenders: "/account/group/personalLenders",
  agents: "/account/group/agents",
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
                  <SignedAmount
                    balance={h.total}
                    head={h.head}
                    badge
                    onChestnut
                    className="ml-1 shrink-0 font-heading text-lg font-bold"
                  />
                  {addable ? (
                    <HeadSearch value={search} onChange={setSearch} label={t("search")} />
                  ) : (
                    <span className="flex-1" />
                  )}
                  {/* + New ledger: right beside the search on wider screens; on a phone its own full-width row under
                      the search, above the header's line */}
                  {addable && (
                    <button
                      type="button"
                      onClick={() => setSheet({ kind: "new", head: addable })}
                      className={cn(ADD_BUTTON, "shrink-0")}
                    >
                      <Plus className="size-5" aria-hidden /> {t("newLedger")}
                    </button>
                  )}
                </header>

                {/* profit and loss: their total is worked out from everything; their own ledgers are listed under it */}
                {(h.head === "profit" || h.head === "loss") && (
                  <p className="text-sm text-ivory/70">{t("worked")}</p>
                )}

                {/* its sub-groups */}
                {/* its sub-groups: the name and how many ledgers, its total and the arrow that opens it */}
                {masters.length > 0 && (
                  <ul className={cn("mb-3", CARD_GRID)}>
                    {masters.map((m) => {
                      const href = MASTER_PAGE[m.key];
                      return (
                        <li key={m.key} className="min-w-0">
                          <AccountCard
                            href={href}
                            onClick={href ? undefined : soon}
                            name={t(`masters.${m.key}`)}
                            lines={
                              <span className={CARD_LINE}>
                                {t("ledgers", { count: m.ledgers })}
                              </span>
                            }
                            amount={
                              <SignedAmount
                                balance={m.total}
                                head={h.head}
                                className="font-heading text-xl font-bold leading-7"
                              />
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* the ledgers directly under it, the same cards; set apart from the sub-groups above by a line, so groups
                  and single ledgers read as two sets */}
                {ledgers.length > 0 && (
                  <ul
                    className={cn(
                      CARD_GRID,
                      masters.length > 0 && "mt-6 border-t border-ivory/25 pt-6",
                    )}
                  >
                    {/* sorted by the name as it reads in this language */}
                    {[...ledgers]
                      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
                      .map((l) => (
                        <li key={l.id} className="min-w-0">
                          <AccountCard
                            oneLine
                            href={`/account/ledgers/${l.id}`}
                            name={nameOf(l)}
                            title={nameOf(l)}
                            inactive={!l.isActive}
                            // one the admin added, and whether it's still in use
                            tags={
                              <>
                                {l.custom && <CardTag>{t("added")}</CardTag>}
                                {!l.isActive && <CardTag strong>{t("inactive")}</CardTag>}
                              </>
                            }
                            amount={
                              <SignedAmount
                                balance={l.balance.today}
                                head={h.head}
                                className="font-heading text-xl font-bold leading-7"
                              />
                            }
                            postDated={
                              l.balance.postDated
                                ? t("postDated", {
                                    amount: postDatedText(l.balance.postDated, h.head),
                                  })
                                : null
                            }
                          />
                        </li>
                      ))}
                  </ul>
                )}

                {/* nothing left after the search or the range */}
                {needle !== "" && masters.length + ledgers.length === 0 && (
                  <p className="py-8 text-center text-ivory/70">{t("noMatch")}</p>
                )}
              </section>
            );
          })}
        </div>
      )}
      <LedgerSheet open={sheet} onClose={() => setSheet(null)} />
    </main>
  );
}
