"use client";

import { Search, X } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "~/lib/utils";

// a search that waits as a button in a header and, when tapped, glides left into a box (half the free space from
// 640px, all of it on phones) while the field and ✕ fade in; it folds back the same way when left empty or with ✕,
// which also clears it
export function HeadSearch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const shown = open || value !== "";
  const close = () => {
    onChange("");
    setOpen(false);
  };

  return (
    <div className="mx-3 flex min-w-0 flex-1 justify-end sm:mx-6">
      <div
        className={cn(
          "flex min-h-10 items-center overflow-hidden rounded-control border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          shown ? "w-full border-ivory/50 bg-ivory/[0.06] focus-within:border-ivory sm:w-1/2" : "w-10 border-transparent",
        )}
      >
        <button
          type="button"
          aria-label={label}
          aria-expanded={shown}
          onClick={() => {
            setOpen(true);
            box.current?.focus();
          }}
          className="grid size-10 shrink-0 place-items-center text-ivory/80 transition-colors hover:text-ivory"
        >
          <Search className="size-4" aria-hidden />
        </button>
        {/* always there, so it can fade in as the box widens */}
        <input
          ref={box}
          type="search"
          value={value}
          maxLength={150}
          tabIndex={shown ? 0 : -1}
          aria-hidden={!shown}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => value === "" && setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && close()}
          placeholder={label}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-base text-ivory outline-none transition-opacity duration-200 placeholder:text-ivory/60 [&::-webkit-search-cancel-button]:hidden",
            shown ? "opacity-100 delay-100" : "opacity-0",
          )}
        />
        <button
          type="button"
          aria-label="✕"
          tabIndex={shown ? 0 : -1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={close}
          className={cn("grid size-10 shrink-0 place-items-center text-ivory/80 transition-opacity duration-200 hover:text-ivory", shown ? "opacity-100 delay-100" : "pointer-events-none opacity-0")}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
