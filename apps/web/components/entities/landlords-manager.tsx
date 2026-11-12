"use client";

import { CircleAlert, MapPin, Pencil, Phone, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ClearButton } from "~/components/ui/clear-button";
import {
  ADD_BUTTON,
  FILTER_CONTROL,
  FILTER_ROW,
  FILTER_STACK,
  PAGE,
} from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { partyLabel } from "../account/party/party-kinds";
import { chip } from "../product/row-styles";
import { LandlordSheet } from "./landlord-sheet";

// /entities/landlords, admin only: where landlords are added, edited and made inactive. + Add landlord, then a search
// with Show inactive, then a row per landlord: name, phone and GSTIN; tapping a row edits it
export function LandlordsManager() {
  const tc = useTranslations("common");
  const t = useTranslations("landlords");
  const tf = useTranslations("accounts.party.form");
  const utils = trpc.useUtils();
  const setActive = trpc.accounts.landlord.setActive.useMutation();
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  // the sheet: a new landlord, or the one being edited
  const [open, setOpen] = useState<string | "new" | null>(null);

  const landlords = trpc.accounts.landlord.list.useQuery({ includeInactive: showInactive });
  const needle = search.trim().toLowerCase();
  const shown = (landlords.data ?? []).filter(
    (l) =>
      needle === "" ||
      [l.shortName ?? "", l.name, l.phone ?? ""].some((v) => v.toLowerCase().includes(needle)),
  );

  // mark a landlord inactive (only once no active godown is rented from them) or active again
  async function toggleActive(id: string, name: string, makeActive: boolean) {
    try {
      await setActive.mutateAsync({ id, isActive: makeActive });
      toast.success(t(makeActive ? "toast.reactivated" : "toast.deactivated", { name }));
      void utils.accounts.landlord.invalidate();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      toast.error(
        t(
          code === "PRECONDITION_FAILED"
            ? "errors.hasGodowns"
            : code === undefined
              ? "errors.network"
              : "errors.failed",
        ),
      );
    }
  }

  return (
    <main className={`${PAGE} pb-16`}>
      <h1 className="sr-only">{t("title")}</h1>

      {/* search and Show inactive, under the header while the list scrolls */}
      <div className={`mt-3 ${FILTER_STACK}`}>
        {/* as a head's header on the account pages: the name and how many there are on the left, the filters and the
            search on the right (each its own row on a phone) */}
        <div className={FILTER_ROW}>
          <h2 className="shrink-0 font-heading text-2xl font-bold">{t("title")}</h2>
          <span className="tabular ml-1 shrink-0 rounded-control bg-ivory px-2.5 py-0.5 font-heading text-lg font-bold text-chestnut">
            {shown.length}
          </span>
          <span className="basis-full sm:hidden" aria-hidden />
          <span className="hidden flex-1 sm:block" aria-hidden />
          {/* the filters, then the search at the right end */}
          <button
            type="button"
            aria-pressed={showInactive}
            onClick={() => setShowInactive((v) => !v)}
            className={cn(chip(showInactive), FILTER_CONTROL)}
          >
            {t("showInactive")}
          </button>
          <label className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-control border border-ivory/40 px-3 focus-within:border-ivory sm:w-56">
            <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
            <span className="sr-only">{t("search")}</span>
            <input
              type="search"
              value={search}
              maxLength={150}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="min-w-0 flex-1 bg-transparent text-base text-ivory outline-none placeholder:text-ivory/60"
            />
            {search && <ClearButton onClear={() => setSearch("")} label={tc("clearSearch")} />}
          </label>
        </div>
        {/* + Add under the search and filters, at the right end (full width on a phone) */}
        <div className={cn(FILTER_ROW, "sm:justify-end")}>
          <button
            type="button"
            onClick={() => setOpen("new")}
            className={cn(ADD_BUTTON, "shrink-0")}
          >
            <Plus className="size-5" aria-hidden /> {t("add")}
          </button>
        </div>
      </div>

      {/* the landlords */}
      {landlords.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : landlords.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{needle ? t("noMatch") : t("empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {shown.map((l) => (
            <li
              key={l.id}
              className={cn(
                "flex items-center gap-2 rounded-control border p-2 pl-4",
                l.isActive
                  ? "on-ivory border-ivory bg-ivory text-chestnut"
                  : "border-dashed border-ivory/60 text-ivory",
              )}
            >
              {/* the landlord: tap to edit */}
              <button
                type="button"
                onClick={() => setOpen(l.id)}
                className="min-w-0 flex-1 py-1.5 text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate font-heading text-xl font-bold leading-7">
                    {partyLabel(l)}
                  </span>
                  {!l.isActive && (
                    <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">
                      {t("inactive")}
                    </span>
                  )}
                </span>
                {l.shortName && (
                  <span className="block truncate text-sm" title={l.name}>
                    {l.name}
                  </span>
                )}
                {/* their phone and town, each with its icon, then their GSTIN (or unregistered) */}
                <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs opacity-70">
                  {l.phone && (
                    <span className="tabular flex items-center gap-1">
                      <Phone className="size-3.5" aria-hidden /> +91 {l.phone}
                    </span>
                  )}
                  {l.address?.city && (
                    <span className="flex min-w-0 items-center gap-1">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{l.address.city}</span>
                    </span>
                  )}
                  <span className="tabular">{l.gstin ?? tf("unregistered")}</span>
                </span>
              </button>

              {/* the pen: their details, where they can be made inactive (or active again) too */}
              <button
                type="button"
                onClick={() => setOpen(l.id)}
                aria-label={t("edit")}
                className="grid size-11 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <LandlordSheet
        landlordId={open}
        onClose={() => setOpen(null)}
        active={
          open && open !== "new"
            ? (() => {
                // gone from the list (inactive ones hidden): it was made inactive
                const l = (landlords.data ?? []).find((x) => x.id === open);
                return {
                  on: l?.isActive ?? false,
                  onFlip: (on: boolean) => void toggleActive(open, l ? partyLabel(l) : "", on),
                };
              })()
            : undefined
        }
      />
    </main>
  );
}
