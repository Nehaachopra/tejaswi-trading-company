"use client";

import { ChevronRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { balanceText, postDatedText } from "./balance";
import { useLedgerName } from "./ledger-name";

type Head = RouterOutputs["accounts"]["overview"]["heads"][number];

// where each sub-group's ledgers are listed; the rest come with their steps
const MASTER_PAGE: Record<string, string | undefined> = { bank: "/account/bank" };

// the side a head's balances usually sit on, for the post-dated note
const usual = (head: Head["head"]) => (head === "asset" || head === "expense" || head === "loss" ? "debit" : "credit");

// /account, admin only: every ledger account under its head (Asset, Liability, Income, Expense, Profit, Loss),
// each head with its total (or one head, on its own page). Sub-groups (Bank, Debtors ...) are cards with the total of their ledgers; the
// ledgers directly under a head are rows opening their statements; Profit and Loss are worked out
export function AccountsBoard({ only }: { only?: Head["head"] }) {
  const t = useTranslations("accounts.overview");
  const overview = trpc.accounts.overview.useQuery();
  const heads = (overview.data?.heads ?? []).filter((h) => !only || h.head === only);
  const soon = () => toast.info(t("comingSoon"));
  const nameOf = useLedgerName();

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
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
          {heads.map((h) => (
            <section key={h.head} aria-labelledby={`head-${h.head}`}>
              {/* the head and its total */}
              <header className="mb-3 flex items-baseline justify-between gap-3 border-b border-ivory/20 pb-2">
                <h2 id={`head-${h.head}`} className="font-heading text-2xl font-bold">
                  {t(`heads.${h.head}`)}
                </h2>
                <span className="tabular font-heading text-xl font-bold">{balanceText(h.total)}</span>
              </header>

              {/* profit and loss: worked out, nothing posts to them */}
              {(h.head === "profit" || h.head === "loss") && <p className="text-sm text-ivory/70">{t("worked")}</p>}

              {/* its sub-groups */}
              {h.masters.length > 0 && (
                <ul className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {h.masters.map((m) => {
                    const href = MASTER_PAGE[m.key];
                    const body = (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-heading text-xl font-bold leading-7">{t(`masters.${m.key}`)}</span>
                          <span className="block text-sm text-chestnut/70">{t("ledgers", { count: m.ledgers })}</span>
                        </span>
                        <span className="tabular shrink-0 font-heading text-lg font-bold">{balanceText(m.total)}</span>
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
              {h.ledgers.length > 0 && (
                <ul className="on-ivory divide-y divide-chestnut/10 overflow-hidden rounded-control bg-ivory text-chestnut">
                  {/* sorted by the name as it reads in this language */}
                  {[...h.ledgers].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map((l) => (
                    <li key={l.id}>
                      <Link href={`/account/ledgers/${l.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-chestnut/5">
                        <span className="min-w-0 flex-1 truncate font-medium" title={nameOf(l)}>
                          {nameOf(l)}
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                          <span className="tabular font-medium">{balanceText(l.balance.today)}</span>
                          {l.balance.postDated && <span className="tabular text-xs text-chestnut/70">{t("postDated", { amount: postDatedText(l.balance.postDated, usual(h.head)) })}</span>}
                        </span>
                        {/* the same arrow as the sub-group cards: this opens its ledger */}
                        <ChevronRight className="size-5 shrink-0 text-chestnut/60" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
