"use client";

import { ChevronDown, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ADD_ON_IVORY, PICK_LIST, PICK_NEW, PICK_ROW, PICK_SEARCH, PICK_TWO_COLUMNS } from "~/components/ui/page-styles";
import { ClearButton } from "~/components/ui/clear-button";
import { MicButton } from "~/components/ui/mic-button";
import { fieldClass } from "~/components/ui/card-form";
import { Spinner } from "~/components/ui/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";

import { useLedgerName } from "../account/ledger-name";
import { SignedAmount } from "../account/signed-amount";
import { PickedCard } from "./picked-card";
import { PartyPick } from "./party-finder";

export type Pickable = RouterOutputs["accounts"]["ledger"]["pickable"][number];
export type ReceiptKind = NonNullable<
  RouterInputs["accounts"]["ledger"]["pickable"]["receiptKind"]
>;
export type PaymentKind = NonNullable<
  RouterInputs["accounts"]["ledger"]["pickable"]["paymentKind"]
>;

// what's picked: an existing ledger, a new one to be made in the same save (its place set by the kind), or a new
// party (a customer or a lender, filled in on the next step)
export type LedgerChoice =
  { kind: "ledger"; ledger: Pickable } | { kind: "new"; name: string } | { kind: "party" } | null;

// the most matches the server sends back; at that many, typing more narrows them
const PICK_LIMIT = 20;

// a tax paid's ledgers, under GST, reverse charge (kept apart for GSTR-3B) and income tax, in that order
const TAX_GROUPS = [
  { group: "gst", keys: ["outputCgst", "outputSgst", "outputIgst"] },
  { group: "rcm", keys: ["rcmCgstPayable", "rcmSgstPayable", "rcmIgstPayable"] },
  { group: "incomeTax", keys: ["tdsPayable", "tcs"] },
] as const;

// a search over the ledgers of one kind a receipt can come from, asked of the server as you type so the list never
// holds every ledger: a few at first (used last, then that kind's own), then up to 20 matches. The admin sees
// balances and, where the kind allows, adds a new ledger by name (made when it's saved); a new customer is added
// as a party instead
export function LedgerPicker({
  purpose,
  receiptKind,
  paymentKind = null,
  value,
  onChange,
  canAdd,
  addParty = false,
  invalid,
  placeholder,
}: {
  purpose: "receipt" | "payment";
  receiptKind: ReceiptKind | null;
  // a payment's kind: which ledgers it can go to
  paymentKind?: PaymentKind | null;
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
  const found = trpc.accounts.ledger.pickable.useQuery(
    { purpose, receiptKind, paymentKind, search: asked },
    { enabled: open, placeholderData: (previous) => previous },
  );
  const shown = found.data ?? [];

  // a tap anywhere else closes it
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const current =
    value?.kind === "ledger"
      ? nameOf(value.ledger)
      : value?.kind === "new"
        ? `${value.name} · ${t("new")}`
        : value?.kind === "party"
          ? t("newParty")
          : null;

  return (
    <div ref={root} className="relative">
      {/* the trigger: what's picked (a party with its details), with its balance */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 px-3 text-left text-base",
          value?.kind === "ledger" && value.ledger.party && "py-2",
          fieldClass(!!invalid),
        )}
      >
        {value?.kind === "ledger" && value.ledger.party ? (
          <PartyPick ledger={value.ledger} party={value.ledger.party} />
        ) : (
          <>
            <span className={cn("min-w-0 flex-1 truncate", !current && "text-chestnut/60")}>
              {current ?? placeholder}
            </span>
            {value?.kind === "ledger" && value.ledger.balance && (
              <SignedAmount
                balance={value.ledger.balance.today}
                head={value.ledger.head}
                className="shrink-0 text-sm"
              />
            )}
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
            {search && (
              <ClearButton
                onClear={() => setSearch("")}
                label={tc("clearSearch")}
                surface="ivory"
              />
            )}
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
                  value?.kind === "ledger" &&
                    value.ledger.id === l.id &&
                    "bg-chestnut text-ivory hover:bg-chestnut",
                )}
              >
                {/* a party with its details; any other ledger by its name */}
                {l.party ? (
                  <PartyPick ledger={l} party={l.party} />
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate">{nameOf(l)}</span>
                    {l.balance && (
                      <SignedAmount
                        balance={l.balance.today}
                        head={l.head}
                        className="shrink-0 text-xs"
                      />
                    )}
                  </>
                )}
              </button>
            ))}
            {found.isPending ? (
              <p className="flex items-center gap-2 px-3 py-3 text-sm">
                <Spinner className="size-4" /> {t("searching")}
              </p>
            ) : (
              shown.length === 0 && (
                <p className="px-3 py-3 text-sm">{t(asked === "" ? "typeToFind" : "noMatch")}</p>
              )
            )}
            {asked !== "" && shown.length >= PICK_LIMIT && (
              <p className="px-3 py-2 text-xs">{t("narrow")}</p>
            )}
          </div>

          {/* + New party: found by phone or name, or added, on the next step */}
          {canAdd && addParty && (
            <button
              type="button"
              onClick={() => {
                onChange({ kind: "party" });
                setOpen(false);
              }}
              className={`m-2 shrink-0 ${ADD_ON_IVORY}`}
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
                  className={`w-full ${ADD_ON_IVORY}`}
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

// the same search, laid out in the page instead of a dropdown: the search box, and under it the matches (the ones used
// last before anything's typed) with + New party or + New ledger at the end. Once one is picked it shows alone, filled
// chestnut; typing again (or Change) brings the matches back
export function LedgerSearch({
  purpose,
  receiptKind,
  paymentKind = null,
  payee = null,
  value,
  onChange,
  canAdd,
  addParty = false,
  placeholder,
  besideNew,
  onEdit,
}: {
  purpose: "receipt" | "payment";
  receiptKind: ReceiptKind | null;
  paymentKind?: PaymentKind | null;
  // who an expense was paid to, never a customer or supplier: for rent the landlords
  payee?: "other" | null;
  value: LedgerChoice;
  onChange: (choice: LedgerChoice) => void;
  canAdd: boolean;
  addParty?: boolean;
  placeholder: string;
  // another choice in the list's last row, like Skip
  besideNew?: React.ReactNode;
  // a pen on what's picked, to change its details
  onEdit?: () => void;
}) {
  const t = useTranslations("transactions.picker");
  const tc = useTranslations("common");
  const nameOf = useLedgerName();
  const [search, setSearch] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  // ask once typing pauses
  const [asked, setAsked] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAsked(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const listing = value === null || browsing || search !== "";
  // which side of a party's balance is a due: a customer paying us owes on the debit side, a supplier we pay on the
  // credit side; the other side is an advance
  const owedBy = purpose === "receipt" && receiptKind === "customer" ? "debit" : purpose === "payment" && paymentKind === "supplier" ? "credit" : null;
  const found = trpc.accounts.ledger.pickable.useQuery(
    { purpose, receiptKind, paymentKind, payee, search: asked },
    { enabled: listing, placeholderData: (previous) => previous },
  );
  // a tax with nothing owed can't be paid, so it isn't offered (staff see no balances, so they see them all)
  const shown = (found.data ?? []).filter((l) => paymentKind !== "taxPaid" || !l.balance || l.balance.today.amount > 0);

  const pick = (choice: LedgerChoice) => {
    onChange(choice);
    setSearch("");
    setBrowsing(false);
    setAdding(null);
  };

  // one match: a party with its details, any other ledger by its name and balance; a line under each, no box
  const ledgerRow = (l: Pickable) => (
    <button
      key={l.id}
      type="button"
      onClick={() => pick({ kind: "ledger", ledger: l })}
      className={PICK_ROW}
    >
      {l.party ? (
        <>
          <PartyPick ledger={l} party={l.party} />
          {owedBy && <PartyOwes ledger={l} owedBy={owedBy} />}
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate font-semibold">{nameOf(l)}</span>
          {l.balance && l.balance.today.amount !== 0 && <SignedAmount balance={l.balance.today} head={l.head} className="shrink-0 text-sm" />}
        </>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* the search, only while choosing: gone once someone is picked (Change brings it back) and while a new
          party's own details are typed */}
      {(value === null || browsing) && (
        <label className={cn(PICK_SEARCH, fieldClass(false))}>
          <Search className="size-4 shrink-0" aria-hidden />
          <input
            type="search"
            value={search}
            maxLength={60}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-chestnut/60"
          />
          {search && (
            <ClearButton onClear={() => setSearch("")} label={tc("clearSearch")} surface="ivory" />
          )}
          <MicButton onText={setSearch} />
        </label>
      )}

      {/* what's picked, alone: who it is (and what's due or advanced) on top, then Edit and Change as a row of their
          own under it, both in words (someone new has theirs beside the card's name, over their details) */}
      {!listing && value !== null && value.kind !== "party" && (
        <PickedCard
          oneLine={!(value.kind === "ledger" && value.ledger.party)}
          aside={
            value.kind === "ledger" && value.ledger.party && owedBy ? (
              <PartyOwes ledger={value.ledger} owedBy={owedBy} picked />
            ) : undefined
          }
          onEdit={onEdit}
          onChange={() => {
            onChange(null);
            setBrowsing(true);
          }}
        >
          {value.kind === "ledger" && value.ledger.party ? (
            <PartyPick ledger={value.ledger} party={value.ledger.party} />
          ) : (
            <span className="min-w-0 flex-1 truncate font-semibold">
              {value.kind === "ledger" ? nameOf(value.ledger) : `${value.name} · ${t("new")}`}
            </span>
          )}
        </PickedCard>
      )}

      {/* the matches in two columns on a wide screen, then someone new */}
      {listing && (
        <>
          <div className={cn(PICK_LIST, PICK_TWO_COLUMNS)}>
            {/* a tax under its sub-heading (GST, reverse charge, income tax); anything else in one list */}
            {paymentKind === "taxPaid"
              ? TAX_GROUPS.map(({ group, keys }) => {
                  const inGroup = shown.filter((l) => (keys as readonly string[]).includes(l.key ?? ""));
                  if (inGroup.length === 0) return null;
                  return (
                    <div key={group} role="group" aria-labelledby={`tax-${group}`} className="flex flex-col">
                      <h3
                        id={`tax-${group}`}
                        className="px-1 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.08em] opacity-60"
                      >
                        {t(`taxGroups.${group}`)}
                      </h3>
                      {inGroup.map(ledgerRow)}
                    </div>
                  );
                })
              : shown.map(ledgerRow)}
            {found.isPending ? (
              <p className="flex items-center gap-2 px-1 py-2 text-sm">
                <Spinner className="size-4" /> {t("searching")}
              </p>
            ) : (
              shown.length === 0 && (
                <p className="col-span-full px-1 py-2 text-sm">{t(asked !== "" ? "noMatch" : paymentKind === "taxPaid" ? "noTaxDue" : "typeToFind")}</p>
              )
            )}
            {asked !== "" && shown.length >= PICK_LIMIT && (
              <p className="px-1 text-xs">{t("narrow")}</p>
            )}

            {/* someone or something new, the dropdown's last row, always in view as it scrolls */}
            {(canAdd || besideNew) && (
              <div className={PICK_NEW}>
                {addParty && (
                  <button
                    type="button"
                    onClick={() => pick({ kind: "party" })}
                    className={ADD_ON_IVORY}
                  >
                    <Plus className="size-4" aria-hidden /> {t("newParty")}
                  </button>
                )}
                {!addParty &&
                  (adding !== null ? (
                    <div className="flex w-full gap-2">
                      <input
                        autoFocus
                        value={adding}
                        maxLength={150}
                        onChange={(e) => setAdding(e.target.value)}
                        placeholder={t("newName")}
                        className={cn("min-h-11 min-w-0 flex-1 px-3 text-base", fieldClass(false))}
                      />
                      <button
                        type="button"
                        disabled={adding.trim() === ""}
                        onClick={() => pick({ kind: "new", name: adding.trim() })}
                        className="min-h-11 shrink-0 rounded-control bg-chestnut px-3 text-sm font-semibold text-ivory disabled:opacity-40"
                      >
                        {t("useNew")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAdding(search.trim())}
                      className={ADD_ON_IVORY}
                    >
                      <Plus className="size-4" aria-hidden /> {t("newLedger")}
                    </button>
                  ))}
                {besideNew}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// an expense head of our own, its name changed right where it's picked; built-in heads keep theirs
export function HeadEdit({ ledgerId, name, onSaved, onCancel }: { ledgerId: string; name: string; onSaved: (name: string) => void; onCancel: () => void }) {
  const t = useTranslations("transactions.picker");
  const tc = useTranslations("transactions.chat");
  const tf = useTranslations("accounts.party.form");
  const utils = trpc.useUtils();
  const update = trpc.accounts.ledger.update.useMutation();
  const [typed, setTyped] = useState(name);
  const [failed, setFailed] = useState(false);

  async function save() {
    if (typed.trim() === "") return;
    setFailed(false);
    try {
      const saved = await update.mutateAsync({ id: ledgerId, name: typed.trim() });
      void utils.accounts.invalidate();
      onSaved(saved.name);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input autoFocus value={typed} maxLength={150} aria-label={t("edit")} onChange={(e) => setTyped(e.target.value)} className={cn("min-h-11 min-w-0 px-3 text-base sm:w-80", fieldClass(typed.trim() === ""))} />
      {failed && <p className="text-sm text-danger">{t("headTaken")}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-control border border-chestnut/50 px-5 text-sm font-semibold hover:border-chestnut">
          {tc("oldLoanCancel")}
        </button>
        <button type="button" onClick={() => void save()} disabled={update.isPending} className="min-h-11 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory disabled:opacity-60">
          {tf("saveDetails")}
        </button>
      </div>
    </div>
  );
}

// what a party owes, or the advance they have with us, beside them: the amount, then "due" under it, or "advance" in an
// outline so it stands apart (nothing when they're square, or for staff, who see no balances)
// picked: on the chestnut card of what's picked, where an advance is an ivory label
function PartyOwes({ ledger, owedBy, picked = false }: { ledger: Pickable; owedBy: "debit" | "credit"; picked?: boolean }) {
  const t = useTranslations("transactions.picker");
  const b = ledger.balance?.today;
  if (!b || b.amount <= 0) return null;
  const due = b.side === owedBy;
  return (
    // picked: the amount level with the name, the label down on the phone and town line
    <span className={cn("flex shrink-0 flex-col items-end gap-0.5 text-right", picked && "justify-between self-stretch")}>
      <span className="tabular text-sm font-semibold">{rupees(b.amount)}</span>
      <span
        className={cn(
          "text-xs",
          due
            ? "opacity-70"
            : picked
              ? "rounded-control bg-ivory px-1.5 font-semibold text-chestnut"
              : "rounded-control border border-current/50 px-1.5 font-semibold",
        )}
      >{due ? t("due") : t("advance")}</span>
    </span>
  );
}
