"use client";

import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { cn } from "~/lib/utils";

// a dropdown on an ivory sheet: the trigger shows the current choice, the panel lists the options. A long list
// (`searchable`) has a search box at the top of the panel that narrows it as you type
export function PickMenu<T extends string | null>({
  label,
  current,
  options,
  picked,
  onPick,
  disabled,
  invalid,
  className,
  searchable = false,
  searchLabel,
  noMatch,
}: {
  label: string;
  current: string;
  options: { id: T; name: string; hint?: string }[];
  picked: T;
  onPick: (id: T) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  searchable?: boolean;
  // the search box's placeholder, and what shows when nothing matches
  searchLabel?: string;
  noMatch?: string;
}) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const shown = needle === "" ? options : options.filter((o) => o.name.toLowerCase().includes(needle) || (o.hint ?? "").toLowerCase().includes(needle));

  return (
    <Menu
      label={label}
      align="left"
      disabled={disabled}
      triggerClassName={cn("min-h-11 w-full min-w-0 justify-between px-3 text-sm", invalid && "border-2 border-danger", className)}
      trigger={
        <>
          <span className="truncate">{current}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </>
      }
    >
      {(close) => (
        <>
          {/* the search box stays at the top while the list scrolls under it */}
          {searchable && (
            <label className="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1 flex items-center gap-2 border-b border-chestnut/15 bg-ivory px-3 py-2">
              <Search className="size-4 shrink-0" aria-hidden />
              <input
                autoFocus
                type="search"
                value={search}
                maxLength={60}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  // Enter picks the only match
                  if (e.key === "Enter" && shown.length === 1) {
                    e.preventDefault();
                    onPick(shown[0]!.id);
                    setSearch("");
                    close();
                  }
                }}
                placeholder={searchLabel ?? label}
                aria-label={searchLabel ?? label}
                className="min-w-0 flex-1 bg-transparent text-sm text-chestnut outline-none placeholder:text-chestnut/60"
              />
            </label>
          )}
          {/* a long list shows its first 100; the search reaches the rest */}
          {shown.slice(0, 100).map((option) => (
            <MenuItem
              key={option.id ?? "none"}
              selected={picked === option.id}
              onClick={() => {
                onPick(option.id);
                setSearch("");
                close();
              }}
            >
              <span className="flex-1 truncate">{option.name}</span>
              {option.hint && <span className="tabular shrink-0 text-xs opacity-70">{option.hint}</span>}
            </MenuItem>
          ))}
          {shown.length === 0 && <p className="px-3 py-3 text-sm">{noMatch ?? "—"}</p>}
          {shown.length > 100 && <p className="px-3 py-2 text-xs">{`+${shown.length - 100}`}</p>}
        </>
      )}
    </Menu>
  );
}
