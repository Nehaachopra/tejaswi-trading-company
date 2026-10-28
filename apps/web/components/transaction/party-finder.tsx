"use client";

import { MapPin, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { kindOf, partyLabel } from "../account/party/party-kinds";
import { SignedAmount } from "../account/signed-amount";
import type { Pickable, ReceiptKind } from "./ledger-picker";

// a phone as shown everywhere: with its country code
export const withCode = (phone: string) => `+91 ${phone}`;

// a party ledger as a pick shows it, to tell people apart: short name (or full name) with the admin's balance, the
// full name under it, then phone, town and type
export function PartyPick({ ledger, party }: { ledger: Pickable; party: NonNullable<Pickable["party"]> }) {
  const tt = useTranslations("accounts.party.form.types");
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-heading text-base font-bold">{partyLabel(party)}</span>
        {ledger.balance && <SignedAmount balance={ledger.balance.today} head={ledger.head} className="shrink-0 text-sm" />}
      </span>
      {party.shortName && <span className="truncate text-sm">{titleCase(party.name)}</span>}
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {party.phone && (
          <span className="tabular flex items-center gap-1">
            <Phone className="size-3.5" aria-hidden /> {withCode(party.phone)}
          </span>
        )}
        {party.city && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden /> {titleCase(party.city)}
          </span>
        )}
        <span className="rounded-control border border-current/40 px-1.5 py-0.5">{tt(kindOf(party.type))}</span>
      </span>
    </span>
  );
}

// the parties already added with a phone (once all 10 digits are in)
export function usePhoneMatches(phone: string, receiptKind: ReceiptKind) {
  const ready = phone.length === 10;
  const found = trpc.accounts.ledger.pickable.useQuery({ purpose: "receipt", receiptKind, search: phone }, { enabled: ready });
  return ready ? (found.data ?? []).filter((l) => l.party?.phone === phone) : [];
}

// parties with a name like the one typed (3 letters or more, asked once typing pauses): only a suggestion, as two
// people can share a name
export function useNameMatches(name: string, receiptKind: ReceiptKind) {
  const [asked, setAsked] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAsked(name.trim()), 300);
    return () => clearTimeout(timer);
  }, [name]);
  const ready = asked.length >= 3;
  const found = trpc.accounts.ledger.pickable.useQuery({ purpose: "receipt", receiptKind, search: asked }, { enabled: ready });
  return ready ? (found.data ?? []).filter((l) => l.party) : [];
}

// a dropdown of parties already added, under the phone (who has that number) or the name (similar names, with a way
// to close it); picking one uses them
export function PhoneMatches({ matches, onUse, title, onClose }: { matches: Pickable[]; onUse: (ledger: Pickable) => void; title?: string; onClose?: () => void }) {
  const t = useTranslations("transactions.receipt.finder");
  if (matches.length === 0) return null;

  return (
    <div role="listbox" aria-label={title ?? t("matches", { count: matches.length })} className="on-ivory absolute inset-x-0 top-full z-30 mt-1 flex max-h-80 flex-col overflow-y-auto rounded-control border border-chestnut/25 bg-ivory text-chestnut">
      <span className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-semibold">
        <span className="flex-1">{title ?? t("matches", { count: matches.length })}</span>
        {onClose && (
          <button type="button" onClick={onClose} className="min-h-8 rounded-control px-2 font-medium underline underline-offset-2">
            {t("noneOfThese")}
          </button>
        )}
      </span>
      {matches.map((l) => (
        <button key={l.id} type="button" role="option" aria-selected={false} onClick={() => onUse(l)} className="flex border-t border-chestnut/10 px-3 py-2.5 text-left hover:bg-chestnut/[0.06]">
          <PartyPick ledger={l} party={l.party!} />
        </button>
      ))}
    </div>
  );
}
