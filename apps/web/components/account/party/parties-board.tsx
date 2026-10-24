"use client";

import { ArrowLeft, ChevronDown, ChevronRight, CircleAlert, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { chip } from "../../product/row-styles";
import { postDatedText } from "../balance";
import { SignedAmount } from "../signed-amount";
import { PARTY_KINDS, type PartyType } from "./party-kinds";

// /account/debtor, /account/creditor and /account/debtor-creditor, admin only: the ledgers of one kind of party.
// A search over short name, name and phone, then a place filter and Show inactive (all staying under the header),
// then a card per party (short name, phone and city on the left, its balance signed by its head on the right)
// opening its page. Parties are added where they belong, not here: in Parties, or while making a transaction
export function PartiesBoard({ type }: { type: PartyType }) {
  const t = useTranslations("accounts.party");
  const th = useTranslations("accounts.overview.heads");
  const kind = PARTY_KINDS[type];
  const [showInactive, setShowInactive] = useState(false);
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  // a city from the default addresses, or every place
  const [city, setCity] = useState<string | null>(null);

  // search once typing pauses
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const parties = trpc.accounts.party.list.useQuery({ type, includeInactive: showInactive, search }, { placeholderData: (previous) => previous });
  // the places these parties are in, and the ones in the picked place
  const cities = [...new Set((parties.data ?? []).map((p) => p.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const shown = (parties.data ?? []).filter((p) => city === null || p.city === city);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="sr-only">{t(`titles.${type}`)}</h1>

      {/* back to the head it sits under */}
      <Link href={`/account/${kind.head}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {th(kind.head)}
      </Link>

      {/* search, then the place filter and Show inactive, under the header while the list scrolls */}
      <div className="sticky top-16 z-20 -mx-4 mt-2 flex flex-wrap items-center gap-2 bg-chestnut px-4 py-2 sm:-mx-6 sm:flex-nowrap sm:px-6">
        <label className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-control border border-ivory/40 px-3 focus-within:border-ivory sm:w-auto sm:flex-1">
          <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
          <span className="sr-only">{t("search")}</span>
          <input
            type="search"
            value={typed}
            maxLength={150}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("search")}
            className="min-w-0 flex-1 bg-transparent text-base text-ivory outline-none placeholder:text-ivory/60"
          />
        </label>
        <Menu
          label={t("place")}
          surface="chestnut"
          align="left"
          triggerClassName="min-h-9 max-w-48 gap-1.5 px-3 text-sm"
          trigger={
            <>
              <span className="truncate">{city ?? t("allPlaces")}</span>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </>
          }
        >
          {(close) =>
            [null, ...cities].map((c) => (
              <MenuItem
                key={c ?? "all"}
                selected={city === c}
                onClick={() => {
                  setCity(c);
                  close();
                }}
              >
                <span className="truncate">{c ?? t("allPlaces")}</span>
              </MenuItem>
            ))
          }
        </Menu>
        <button type="button" aria-pressed={showInactive} onClick={() => setShowInactive((v) => !v)} className={chip(showInactive)}>
          {t("showInactive")}
        </button>
      </div>

      {/* the parties */}
      {parties.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : parties.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{search || city ? t("noMatch") : t(`empty.${type}`)}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {shown.map((p) => (
            <li key={p.id}>
              <Link
                href={`${kind.path}/${p.id}`}
                className={cn(
                  "flex items-center gap-3 rounded-control border p-4",
                  p.isActive ? "on-ivory border-ivory bg-ivory text-chestnut" : "border-dashed border-ivory/60 text-ivory",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-heading text-xl font-bold leading-7">{p.shortName}</span>
                    {!p.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
                  </span>
                  <span className="tabular block truncate text-sm opacity-70">{[p.phone, p.city].filter(Boolean).join(" · ") || "—"}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <SignedAmount balance={p.balance.today} head={kind.head} className="font-heading text-xl font-bold leading-7" />
                  {p.balance.postDated && <span className="tabular text-xs opacity-70">{t("postDated", { amount: postDatedText(p.balance.postDated, kind.head) })}</span>}
                </span>
                <ChevronRight className="size-5 shrink-0 opacity-60" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

    </main>
  );
}
