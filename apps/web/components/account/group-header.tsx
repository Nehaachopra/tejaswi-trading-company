"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { ClearButton } from "~/components/ui/clear-button";
import { trpc } from "~/trpc/client";

import { type Head } from "./balance";
import { SignedAmount } from "./signed-amount";

// a sub-group's page header, laid out like a head's on /account: its name with its total beside it as an ivory pill
// on the left; its search and filters on the right (on a phone the search has a row of its own under the name, and the
// filters the row below it). It stays under the page header while the list scrolls. The total is the one /account
// shows on the sub-group's card
export function GroupHeader({ title, head, master, children }: { title: string; head: Head; master: string; children?: React.ReactNode }) {
  const overview = trpc.accounts.overview.useQuery();
  const total = overview.data?.heads.find((h) => h.head === head)?.masters.find((m) => m.key === master)?.total;
  return (
    <header className="sticky top-16 z-10 -mx-4 mt-3 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-ivory/20 bg-chestnut px-4 py-3 sm:-mx-6 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="min-w-0 truncate font-heading text-2xl font-bold">{title}</h1>
        {total && <SignedAmount balance={total} head={head} badge onChestnut className="shrink-0 font-heading text-lg font-bold" />}
      </div>
      {children && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap sm:justify-end [&>*:not(label)]:shrink-0">{children}</div>}
    </header>
  );
}

// the search in a sub-group's header: a small box (a full row on a phone), its magnifier inside on the left and ✕ to
// clear it once something is typed
export function GroupSearch({ value, onChange, label, maxLength }: { value: string; onChange: (value: string) => void; label: string; maxLength: number }) {
  const tc = useTranslations("common");
  return (
    <label className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-control border border-ivory/40 px-3 focus-within:border-ivory sm:w-56">
      <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder={label}
        className="min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none placeholder:text-ivory/60 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && <ClearButton onClear={() => onChange("")} label={tc("clearSearch")} />}
    </label>
  );
}
