"use client";

import { ArrowLeft, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { postDatedText } from "./balance";
import { GroupHeader, GroupSearch } from "./group-header";
import { useLedgerName } from "./ledger-name";
import { SignedAmount } from "./signed-amount";
import { AccountCard, CARD_GRID, CardTag } from "./account-card";

type Group = "lenders" | "personalLenders" | "agents" | "rentPayable" | "employees" | "gstPayable";

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
  const shown = (ledgers.data ?? []).filter(
    (l) =>
      needle === "" || [nameOf(l), l.fullName ?? ""].some((v) => v.toLowerCase().includes(needle)),
  );

  return (
    <main className={`${PAGE} pb-16`}>
      {/* back to the head it sits under */}
      <Link
        href={`/account/${head}`}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory"
      >
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
        <p className="mt-16 text-center text-ivory/70">
          {needle ? t("noMatch") : t("ledgers", { count: 0 })}
        </p>
      ) : (
        <ul className={CARD_GRID}>
          {/* by name; GST payable keeps the server's order (output GST, then reverse charge) */}
          {[...shown]
            .sort((a, b) => (master === "gstPayable" ? 0 : nameOf(a).localeCompare(nameOf(b))))
            .map((l) => {
              const full =
                l.fullName && titleCase(l.fullName.toLowerCase()) !== nameOf(l)
                  ? titleCase(l.fullName.toLowerCase())
                  : null;
              return (
                <li key={l.id} className="min-w-0">
                  <AccountCard
                    oneLine
                    href={`/account/ledgers/${l.id}`}
                    name={nameOf(l)}
                    title={nameOf(l)}
                    inactive={!l.isActive}
                    tags={!l.isActive && <CardTag strong>{t("inactive")}</CardTag>}
                    // its full name under a short one
                    lines={
                      full && (
                        <span className="block truncate text-sm" title={full}>
                          {full}
                        </span>
                      )
                    }
                    amount={
                      <SignedAmount
                        balance={l.balance.today}
                        head={head}
                        className="font-heading text-xl font-bold leading-7"
                      />
                    }
                    postDated={
                      l.balance.postDated
                        ? t("postDated", { amount: postDatedText(l.balance.postDated, head) })
                        : null
                    }
                  />
                </li>
              );
            })}
        </ul>
      )}
    </main>
  );
}
