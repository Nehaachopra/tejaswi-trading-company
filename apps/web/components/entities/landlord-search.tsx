"use client";

import { Pencil, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { ADD_ON_IVORY, PICK_LIST, PICK_NEW, PICK_ROW, PICK_SEARCH, PICK_TWO_COLUMNS, PICKED } from "~/components/ui/page-styles";
import { cn } from "~/lib/utils";

import { partyLabel } from "../account/party/party-kinds";
import { LandlordAdd } from "./landlord-sheet";

type Landlord = { id: string; name: string; shortName: string | null };

// picking a landlord on an ivory card: a search that opens a dropdown of the matches when clicked, with + New landlord
// (the admin's) at its bottom to add one without leaving the form; the one picked shows with Change
export function LandlordSearch({
  landlords,
  picked,
  onPick,
  invalid = false,
  canAdd = true,
  startOpen = false,
  twoColumns = false,
  asksPan = true,
  canEdit = false,
}: {
  // a pen on who's picked, to change their details
  canEdit?: boolean;
  // off where the PAN is asked below the amount
  asksPan?: boolean;
  // the matches in two columns on a wide screen
  twoColumns?: boolean;
  landlords: Landlord[];
  picked: string | null;
  onPick: (id: string | null) => void;
  invalid?: boolean;
  canAdd?: boolean;
  // open from the start (and again after Change), where picking a landlord is the very next step
  startOpen?: boolean;
}) {
  const t = useTranslations("stock.form");
  const tp = useTranslations("transactions.picker");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(startOpen);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const chosen = landlords.find((l) => l.id === picked);

  // a click anywhere else closes it
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // who's picked, their details being changed right here
  if (chosen && editing) return <LandlordAdd landlordId={chosen.id} asksPan={asksPan} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />;

  if (chosen)
    return (
      <div className={PICKED}>
        <span className="min-w-0 flex-1 truncate font-semibold">{partyLabel(chosen)}</span>
        {canEdit && (
          <button type="button" aria-label={tp("edit")} onClick={() => setEditing(true)} className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-ivory/10">
            <Pencil className="size-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onPick(null);
            setOpen(startOpen);
          }}
          className="shrink-0 rounded-control px-2 py-1 text-sm font-semibold underline underline-offset-2"
        >
          {t("change")}
        </button>
      </div>
    );

  // someone new: their details right here, as a new party's are
  if (adding) {
    return (
      <LandlordAdd
        name={search.trim()}
        asksPan={asksPan}
        onSaved={(id) => {
          setAdding(false);
          setSearch("");
          onPick(id);
        }}
        onCancel={() => setAdding(false)}
      />
    );
  }

  const needle = search.trim().toLowerCase();
  const shown = landlords.filter((l) => needle === "" || [l.shortName ?? "", l.name].some((v) => v.toLowerCase().includes(needle)));

  return (
    <div ref={root}>
      <label className={cn(PICK_SEARCH, fieldClass(invalid))}>
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="sr-only">{t("searchLandlord")}</span>
        <input
          type="search"
          value={search}
          maxLength={150}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          placeholder={t("searchLandlord")}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-chestnut/60"
        />
      </label>

      {/* the matches, with + New landlord at the bottom; in the page's flow like the party and ledger searches, so what
          comes after moves down */}
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className={cn(PICK_LIST, twoColumns && PICK_TWO_COLUMNS)}>
            {shown.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setSearch("");
                  setOpen(false);
                  onPick(l.id);
                }}
                className={PICK_ROW}
              >
                <span className="truncate font-semibold">{partyLabel(l)}</span>
                {l.shortName && <span className="truncate text-sm opacity-70">{l.name}</span>}
              </button>
            ))}
            {shown.length === 0 && <p className="col-span-full px-1 py-2 text-sm">{t("noLandlord")}</p>}
            {canAdd && (
              <div className={PICK_NEW}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setAdding(true);
                  }}
                  className={ADD_ON_IVORY}
                >
                  <Plus className="size-4" aria-hidden /> {t("newLandlord")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
