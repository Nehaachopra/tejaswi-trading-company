"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { ClearButton } from "~/components/ui/clear-button";

// a head's search in its header: a small box always in view (like the customer list's search), its magnifier inside
// on the left and ✕ to clear it once something is typed; it sits between the head's name and its total
export function HeadSearch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const tc = useTranslations("common");
  return (
    <div className="mx-3 flex min-w-0 flex-1 justify-end sm:mx-6">
      <label className="flex min-h-10 w-full min-w-0 max-w-56 items-center gap-2 rounded-control border border-ivory/40 px-3 focus-within:border-ivory">
        <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
        <span className="sr-only">{label}</span>
        <input
          type="search"
          value={value}
          maxLength={150}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onChange("")}
          placeholder={label}
          className="min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none placeholder:text-ivory/60 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && <ClearButton onClear={() => onChange("")} label={tc("clearSearch")} />}
      </label>
    </div>
  );
}
