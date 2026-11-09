"use client";

import { ArrowLeft, ChevronDown, ChevronRight, CircleAlert, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { FILTER_TRIGGER, PAGE } from "~/components/ui/page-styles";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { chip } from "../../product/row-styles";
import { postDatedText } from "../balance";
import { GroupHeader, GroupSearch } from "../group-header";
import { SignedAmount } from "../signed-amount";
import { PARTY_KINDS, partyLabel, type PartyType } from "./party-kinds";

// /account/debtor, /account/creditor and /account/debtor-creditor, admin only: the ledgers of one kind of party.
// A search over short name, name and phone, then a place filter and Show inactive (all staying under the header),
// then a card per party (short name, phone and city on the left, its balance signed by its head on the right)
// opening its page. Parties are added where they belong, not here: in Parties, or while making a transaction
export function PartiesBoard({ type }: { type: PartyType }) {
  const t = useTranslations("accounts.party");
  const tf = useTranslations("accounts.party.form");
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
    <main className={`${PAGE} pb-16`}>
      {/* back to the head it sits under */}
      <Link href={`/account/${kind.head}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {th(kind.head)}
      </Link>

      {/* the group's name and total on the left; the search, the place filter and Show inactive on the right */}
      <GroupHeader title={t(`titles.${type}`)} head={kind.head} master={kind.master}>
        <GroupSearch value={typed} onChange={setTyped} label={t("search")} maxLength={150} />
        <Menu
          label={t("place")}
          surface="chestnut"
          align="left"
          boxed
          triggerClassName={FILTER_TRIGGER}
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
      </GroupHeader>

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
        // none yet: they're added in Entities → Parties
        <p className="mt-16 text-center text-ivory/70">
          {search || city ? (
            t("noMatch")
          ) : (
            <>
              {t(`empty.${type}`)}{" "}
              <Link href="/entities/parties" className="font-semibold text-ivory underline underline-offset-4">
                {t("addFirst")}
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((p) => (
            <li key={p.id} className="min-w-0">
              <Link
                href={`${kind.path}/${p.id}`}
                className={cn(
                  "flex min-w-0 flex-col gap-0.5 rounded-control border p-4",
                  p.isActive ? "on-ivory border-ivory bg-ivory text-chestnut" : "border-dashed border-ivory/60 text-ivory",
                )}
              >
                {/* the short name (when there is one); the full name with the balance; the phone and town with the arrow */}
                {p.shortName && (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-heading text-xl font-bold leading-7">{partyLabel(p)}</span>
                    {!p.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
                  </span>
                )}
                <span className="flex min-w-0 items-start gap-3">
                  <span className={cn("min-w-0 flex-1 truncate", p.shortName ? "pt-0.5 text-base" : "font-heading text-xl font-bold leading-7")}>{titleCase(p.name.toLowerCase())}</span>
                  {!p.shortName && !p.isActive && <span className="shrink-0 self-center rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
                  <span className="flex shrink-0 flex-col items-end">
                    <SignedAmount balance={p.balance.today} head={kind.head} className="font-heading text-xl font-bold leading-7" />
                    {p.balance.postDated && <span className="tabular text-xs opacity-70">{t("postDated", { amount: postDatedText(p.balance.postDated, kind.head) })}</span>}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-3 text-sm">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 opacity-70">
                    {p.phone && (
                      <span className="tabular flex items-center gap-1">
                        <Phone className="size-3.5" aria-hidden /> +91 {p.phone}
                      </span>
                    )}
                    {p.city && (
                      <span className="flex min-w-0 items-center gap-1">
                        <MapPin className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{titleCase(p.city)}</span>
                      </span>
                    )}
                    {!p.phone && !p.city && "—"}
                  </span>
                  <ChevronRight className="size-5 shrink-0 opacity-60" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

    </main>
  );
}
