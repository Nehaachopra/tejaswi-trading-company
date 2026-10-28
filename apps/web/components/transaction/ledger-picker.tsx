"use client";

import { ChevronDown, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ClearButton } from "~/components/ui/clear-button";
import { MicButton } from "~/components/ui/mic-button";
import { fieldClass } from "~/components/ui/card-form";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";

import { useLedgerName } from "../account/ledger-name";
import { SignedAmount } from "../account/signed-amount";
import { PartyPick } from "./party-finder";

export type Pickable = RouterOutputs["accounts"]["ledger"]["pickable"][number];
export type ReceiptKind = NonNullable<RouterInputs["accounts"]["ledger"]["pickable"]["receiptKind"]>;
export type PaymentKind = NonNullable<RouterInputs["accounts"]["ledger"]["pickable"]["paymentKind"]>;

// what's picked: an existing ledger, a new one to be made in the same save (its place set by the kind), or a new
// party (a customer or a lender, filled in on the next step)
export type LedgerChoice = { kind: "ledger"; ledger: Pickable } | { kind: "new"; name: string } | { kind: "party" } | null;

// the most matches the server sends back; at that many, typing more narrows them
const PICK_LIMIT = 20;

// a search over the ledgers of one kind a receipt can come from, asked of the server as you type so the list never
// holds every ledger: a few at first (used last, then that kind's own), then up to 20 matches. The admin sees
// balances and, where the kind allows, adds a new ledger by name (made when it's saved); a new customer is added
// as a party instead
export function LedgerPicker({
  purpose,
  receiptKind,
  value,
  onChange,
  canAdd,
  addParty = false,
  invalid,
  placeholder,
}: {
  purpose: "receipt" | "payment";
  receiptKind: ReceiptKind | null;
  value: LedgerChoice;
  onChange: (choice: LedgerChoice) => void;
  canAdd: boolean;
  // a payment or a loan comes from a party: + New party instead of + New ledger
  addParty?: boolean;
  invalid?: boolean;
  placeholder: string;
}) {
  const t = useTranslations("transactions.picker");
  const tc = useTranslations("common");
  const nameOf = useLedgerName();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // ask once typing pauses
  const [asked, setAsked] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAsked(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const found = trpc.accounts.ledger.pickable.useQuery({ purpose, receiptKind, search: asked }, { enabled: open, placeholderData: (previous) => previous });
  const shown = found.data ?? [];

  // a tap anywhere else closes it
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const current = value?.kind === "ledger" ? nameOf(value.ledger) : value?.kind === "new" ? `${value.name} · ${t("new")}` : value?.kind === "party" ? t("newParty") : null;

  return (
    <div ref={root} className="relative">
      {/* the trigger: what's picked (a party with its details), with its balance */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn("flex min-h-11 w-full items-center gap-2 px-3 text-left text-base", value?.kind === "ledger" && value.ledger.party && "py-2", fieldClass(!!invalid))}
      >
        {value?.kind === "ledger" && value.ledger.party ? (
          <PartyPick ledger={value.ledger} party={value.ledger.party} />
        ) : (
          <>
            <span className={cn("min-w-0 flex-1 truncate", !current && "text-chestnut/60")}>{current ?? placeholder}</span>
            {value?.kind === "ledger" && value.ledger.balance && <SignedAmount balance={value.ledger.balance.today} head={value.ledger.head} className="shrink-0 text-sm" />}
          </>
        )}
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </button>

      {open && (
        <div className="on-ivory absolute top-full z-40 mt-1 flex max-h-96 w-full flex-col overflow-hidden rounded-control border border-chestnut/25 bg-ivory text-chestnut">
          {/* the search */}
          <label className="relative flex shrink-0 items-center gap-2 border-b border-chestnut/15 px-3 py-2">
            <Search className="size-4 shrink-0" aria-hidden />
            <input
              autoFocus
              type="search"
              value={search}
              maxLength={60}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-chestnut/60"
            />
            {search && <ClearButton onClear={() => setSearch("")} label={tc("clearSearch")} surface="ivory" />}
            <MicButton onText={setSearch} />
          </label>

          {/* the ledgers */}
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {shown.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onChange({ kind: "ledger", ledger: l });
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm hover:bg-chestnut/[0.06]",
                  l.party && "border-b border-chestnut/10 py-2 last-of-type:border-b-0",
                  value?.kind === "ledger" && value.ledger.id === l.id && "bg-chestnut text-ivory hover:bg-chestnut",
                )}
              >
                {/* a party with its details; any other ledger by its name */}
                {l.party ? (
                  <PartyPick ledger={l} party={l.party} />
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate">{nameOf(l)}</span>
                    {l.balance && <SignedAmount balance={l.balance.today} head={l.head} className="shrink-0 text-xs" />}
                  </>
                )}
              </button>
            ))}
            {found.isPending ? (
              <p className="flex items-center gap-2 px-3 py-3 text-sm">
                <Spinner className="size-4" /> {t("searching")}
              </p>
            ) : (
              shown.length === 0 && <p className="px-3 py-3 text-sm">{t(asked === "" ? "typeToFind" : "noMatch")}</p>
            )}
            {asked !== "" && shown.length >= PICK_LIMIT && <p className="px-3 py-2 text-xs">{t("narrow")}</p>}
          </div>

          {/* + New party: found by phone or name, or added, on the next step */}
          {canAdd && addParty && (
            <button
              type="button"
              onClick={() => {
                onChange({ kind: "party" });
                setOpen(false);
              }}
              className="flex min-h-10 shrink-0 items-center justify-center gap-2 border-t border-chestnut/15 text-sm font-medium hover:bg-chestnut/[0.06]"
            >
              <Plus className="size-4" aria-hidden /> {t("newParty")}
            </button>
          )}

          {/* + New ledger: just its name; the kind puts it in its place, and it's made when the receipt is saved */}
          {canAdd && !addParty && (
            <div className="shrink-0 border-t border-chestnut/15 p-2">
              {adding !== null ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={adding}
                    maxLength={150}
                    onChange={(e) => setAdding(e.target.value)}
                    placeholder={t("newName")}
                    className={cn("min-h-10 min-w-0 flex-1 px-3 text-sm", fieldClass(false))}
                  />
                  <button
                    type="button"
                    disabled={adding.trim() === ""}
                    onClick={() => {
                      onChange({ kind: "new", name: adding.trim() });
                      setAdding(null);
                      setOpen(false);
                    }}
                    className="min-h-10 shrink-0 rounded-control bg-chestnut px-4 text-sm font-semibold text-ivory disabled:opacity-40"
                  >
                    {t("useNew")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(search.trim())}
                  className="flex min-h-10 w-full items-center justify-center gap-2 rounded-control text-sm font-medium hover:bg-chestnut/[0.06]"
                >
                  <Plus className="size-4" aria-hidden /> {t("newLedger")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
