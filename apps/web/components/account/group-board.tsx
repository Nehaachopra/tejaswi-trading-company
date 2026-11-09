"use client";

import { ArrowLeft, ChevronRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { postDatedText } from "./balance";
import { GroupHeader, GroupSearch } from "./group-header";
import { useLedgerName } from "./ledger-name";
import { SignedAmount } from "./signed-amount";

type Group = "lenders" | "rentPayable" | "employees" | "gstPayable";

// /account/group/[master], admin only: the ledgers of one sub-group (bank loans, rent payable to landlords,
// employees), a card each like the ledgers on /account: the name (cut short with dots when long), its balance and the
// arrow on one line; a party's full name, an inactive tag or a post-dated balance on a second line when there are any.
// A card opens its ledger statement. They are added and changed in Entities, not here
export function GroupBoard({ master }: { master: Group }) {
  const t = useTranslations("accounts.overview");
  const nameOf = useLedgerName();
  const ledgers = trpc.accounts.ledger.group.useQuery({ master });
  // every one of these sits under Liability
  const head = "liability" as const;
  // a search over the ledger's name and a party's full name
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const shown = (ledgers.data ?? []).filter((l) => needle === "" || [nameOf(l), l.fullName ?? ""].some((v) => v.toLowerCase().includes(needle)));

  return (
    <main className={`${PAGE} pb-16`}>
      {/* back to the head it sits under */}
      <Link href={`/account/${head}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {t(`heads.${head}`)}
      </Link>

      {/* the group's name and total on the left; its search on the right */}
      <GroupHeader title={t(`masters.${master}`)} head={head} master={master}>
        <GroupSearch value={search} onChange={setSearch} label={t("searchName")} maxLength={150} />
      </GroupHeader>

      {ledgers.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : ledgers.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{needle ? t("noMatch") : t("ledgers", { count: 0 })}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* by name; GST payable keeps the server's order (output GST, then reverse charge) */}
          {[...shown]
            .sort((a, b) => (master === "gstPayable" ? 0 : nameOf(a).localeCompare(nameOf(b))))
            .map((l) => {
              const full = l.fullName && titleCase(l.fullName.toLowerCase()) !== nameOf(l) ? titleCase(l.fullName.toLowerCase()) : null;
              return (
                <li key={l.id} className="min-w-0">
                  <Link
                    href={`/account/ledgers/${l.id}`}
                    className={cn(
                      "flex min-w-0 flex-col gap-1 rounded-control border p-4",
                      l.isActive
                        ? "on-ivory border-ivory bg-ivory text-chestnut hover:bg-[color-mix(in_srgb,var(--color-ivory)_94%,var(--color-chestnut))]"
                        : "border-dashed border-ivory/60 text-ivory",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="min-w-0 flex-1 truncate font-heading text-xl font-bold leading-7" title={nameOf(l)}>
                        {nameOf(l)}
                      </span>
                      <SignedAmount balance={l.balance.today} head={head} className="shrink-0 font-heading text-lg font-bold" />
                      <ChevronRight className="size-5 shrink-0 opacity-60" aria-hidden />
                    </span>
                    {(full || !l.isActive || l.balance.postDated) && (
                      <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                        {full && (
                          <span className="min-w-0 truncate" title={full}>
                            {full}
                          </span>
                        )}
                        {!l.isActive && <span className="shrink-0 rounded-control border border-current px-1.5 py-0.5 text-[0.7rem]">{t("inactive")}</span>}
                        {l.balance.postDated && <span className="tabular text-xs opacity-70">{t("postDated", { amount: postDatedText(l.balance.postDated, head) })}</span>}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
        </ul>
      )}
    </main>
  );
}
