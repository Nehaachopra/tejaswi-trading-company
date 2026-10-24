"use client";

import { ChevronDown, CircleAlert, Ellipsis, Pencil, Plus, Power, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import type { PartyType } from "../account/party/party-kinds";
import { PartySheet } from "../account/party/party-sheet";
import { chip } from "../product/row-styles";

// a dropdown filter on the chestnut page: the trigger shows the current choice
function Filter<T extends string | null>({ label, current, options, picked, onPick }: { label: string; current: string; options: { id: T; name: string }[]; picked: T; onPick: (id: T) => void }) {
  return (
    <Menu
      label={label}
      surface="chestnut"
      align="left"
      triggerClassName="min-h-9 max-w-44 gap-1.5 px-3 text-sm"
      trigger={
        <>
          <span className="truncate">{current}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </>
      }
    >
      {(close) =>
        options.map((o) => (
          <MenuItem
            key={o.id ?? "all"}
            selected={picked === o.id}
            onClick={() => {
              onPick(o.id);
              close();
            }}
          >
            <span className="truncate">{o.name}</span>
          </MenuItem>
        ))
      }
    </Menu>
  );
}

// /party, admin only: where parties are added, edited and made inactive (Accounts only shows their ledgers).
// + Add party, then a search over short name, name and phone with type and place filters and Show inactive (all
// staying under the header), then a row per party: short name and type, full name, phone and city; tapping a row
// edits it, its ⋯ menu also marks it inactive or active
export function PartiesManager() {
  const t = useTranslations("parties");
  const tf = useTranslations("accounts.party.form");
  const utils = trpc.useUtils();
  const setActive = trpc.accounts.party.setActive.useMutation();

  const [type, setType] = useState<PartyType | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  // the sheet: a new party, or the one being edited
  const [open, setOpen] = useState<{ id: string | "new"; type: PartyType } | null>(null);

  // search once typing pauses
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const parties = trpc.accounts.party.list.useQuery({ type: type ?? undefined, includeInactive: showInactive, search }, { placeholderData: (previous) => previous });
  const cities = [...new Set((parties.data ?? []).map((p) => p.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const shown = (parties.data ?? []).filter((p) => city === null || p.city === city);

  // mark a party inactive (only with nothing owed either way and no pending orders) or active again
  async function toggleActive(id: string, shortName: string, makeActive: boolean) {
    try {
      await setActive.mutateAsync({ id, isActive: makeActive });
      toast.success(t(makeActive ? "toast.reactivated" : "toast.deactivated", { name: shortName }));
      void utils.accounts.invalidate();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      toast.error(t(code === "PRECONDITION_FAILED" ? "errors.hasBalance" : code === "CONFLICT" ? "errors.hasOrders" : code === undefined ? "errors.network" : "errors.failed"));
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      <button
        type="button"
        onClick={() => setOpen({ id: "new", type: type ?? "customer" })}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ivory px-5 font-heading text-lg font-bold text-chestnut sm:w-auto"
      >
        <Plus className="size-5" aria-hidden /> {t("add")}
      </button>

      {/* search, then the filters, under the header while the list scrolls */}
      <div className="sticky top-16 z-20 -mx-4 mt-3 flex flex-wrap items-center gap-2 bg-chestnut px-4 py-2 sm:-mx-6 sm:px-6">
        <label className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-control border border-ivory/40 px-3 focus-within:border-ivory">
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
        <Filter
          label={t("type")}
          current={type ? tf(`types.${type}`) : t("allTypes")}
          options={[{ id: null, name: t("allTypes") }, ...(["customer", "supplier", "both"] as const).map((id) => ({ id, name: tf(`types.${id}`) }))]}
          picked={type}
          onPick={setType}
        />
        <Filter label={t("place")} current={city ?? t("allPlaces")} options={[{ id: null, name: t("allPlaces") }, ...cities.map((c) => ({ id: c, name: c }))]} picked={city} onPick={setCity} />
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
        <p className="mt-16 text-center text-ivory/70">{search || city || type ? t("noMatch") : t("empty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {shown.map((p) => (
            <li
              key={p.id}
              className={cn("flex items-center gap-2 rounded-control border p-2 pl-4", p.isActive ? "on-ivory border-ivory bg-ivory text-chestnut" : "border-dashed border-ivory/60 text-ivory")}
            >
              {/* the party: tap to edit */}
              <button type="button" onClick={() => setOpen({ id: p.id, type: p.type })} className="min-w-0 flex-1 py-1.5 text-left">
                <span className="flex items-center gap-2">
                  <span className="truncate font-heading text-xl font-bold leading-7">{p.shortName}</span>
                  <span className="shrink-0 rounded-control border border-current/40 px-2 py-0.5 text-xs">{tf(`types.${p.type}`)}</span>
                  {!p.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
                </span>
                <span className="block truncate text-sm" title={p.name}>
                  {p.name}
                </span>
                <span className="tabular block truncate text-xs opacity-70">{[p.phone, p.city].filter(Boolean).join(" · ") || "—"}</span>
              </button>

              {/* edit, or mark inactive / active */}
              <Menu plain label={t("menu")} surface={p.isActive ? "ivory" : "chestnut"} triggerClassName="size-11 shrink-0" trigger={<Ellipsis className="size-5" aria-hidden />}>
                {(close) => (
                  <>
                    <MenuItem
                      onClick={() => {
                        close();
                        setOpen({ id: p.id, type: p.type });
                      }}
                    >
                      <Pencil className="size-4" aria-hidden /> {t("edit")}
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        close();
                        void toggleActive(p.id, p.shortName, !p.isActive);
                      }}
                    >
                      <Power className="size-4" aria-hidden /> {p.isActive ? t("deactivate") : t("reactivate")}
                    </MenuItem>
                  </>
                )}
              </Menu>
            </li>
          ))}
        </ul>
      )}

      <PartySheet partyId={open?.id ?? null} type={open?.type ?? "customer"} onClose={() => setOpen(null)} />
    </main>
  );
}
