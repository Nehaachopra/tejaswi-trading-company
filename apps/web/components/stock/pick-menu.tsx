"use client";

import { ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ClearButton } from "~/components/ui/clear-button";
import { Menu, MenuItem } from "~/components/ui/menu";
import { cn } from "~/lib/utils";

// a dropdown on an ivory sheet: the trigger shows the current choice, the panel lists the options. A long list
// (`searchable`) has a search box at the top of the panel that narrows it as you type
export function PickMenu<T extends string | null>({
  label,
  current,
  currentSub,
  currentHint,
  options,
  picked,
  onPick,
  disabled,
  invalid,
  className,
  align = "left",
  matchWidth = false,
  inFlow = false,
  searchable = false,
  searchLabel,
  noMatch,
  onTyped,
  typedLabel,
  openSignal,
  moneyHints = false,
}: {
  label: string;
  current: string;
  // a second line under the current choice (a bank account's last digits)
  currentSub?: string;
  // beside the current choice, before the arrow
  currentHint?: string;
  // `sub` is a second line under the name, `hint` sits on the right
  // a disabled one shows muted and can't be picked
  options: { id: T; name: string; sub?: string; hint?: string; disabled?: boolean }[];
  picked: T;
  onPick: (id: T) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  // which edge of the trigger the panel lines up with
  align?: "left" | "right";
  // the panel exactly as wide as the trigger
  matchWidth?: boolean;
  // the panel pushes what's below it down instead of opening over it
  inFlow?: boolean;
  searchable?: boolean;
  // the search box's placeholder, and what shows when nothing matches
  searchLabel?: string;
  noMatch?: string;
  // a name the list doesn't have: what's typed in the search can be used as it is
  onTyped?: (text: string) => void;
  typedLabel?: (text: string) => string;
  // each new number opens the list (see Menu)
  openSignal?: number;
  // the hints are money (balances): shown large and bold, never muted
  moneyHints?: boolean;
}) {
  const tc = useTranslations("common");
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const shown =
    needle === ""
      ? options
      : options.filter(
          (o) =>
            o.name.toLowerCase().includes(needle) || (o.hint ?? "").toLowerCase().includes(needle),
        );

  return (
    <Menu
      label={label}
      align={align}
      boxed
      matchWidth={matchWidth}
      inFlow={inFlow}
      // a list that narrows as you search keeps one width, whatever names are showing
      panelClassName={searchable && !matchWidth ? "w-72 max-w-[calc(100vw-2rem)]" : undefined}
      disabled={disabled}
      openSignal={openSignal}
      triggerClassName={cn(
        "min-h-11 w-full min-w-0 justify-between border-0 px-3 text-sm shadow-[0_0_5px_0] shadow-chestnut/40",
        invalid && "shadow-danger/80",
        className,
      )}
      trigger={
        <>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate">{current}</span>
            {currentSub && (
              <span className="tabular block text-xs font-normal opacity-70">{currentSub}</span>
            )}
          </span>
          {currentHint && <span className="tabular shrink-0 font-semibold">{currentHint}</span>}
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
              {search && (
                <ClearButton
                  onClear={() => setSearch("")}
                  label={tc("clearSearch")}
                  surface="ivory"
                />
              )}
            </label>
          )}
          {/* a long list shows its first 100; the search reaches the rest. Each choice is a rounded row with room
              around it and a small gap between */}
          {shown.slice(0, 100).map((option) => (
            <MenuItem
              key={option.id ?? "none"}
              selected={picked === option.id}
              disabled={option.disabled}
              className="py-2.5 [&+&]:mt-1"
              onClick={() => {
                onPick(option.id);
                setSearch("");
                close();
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.name}</span>
                {option.sub && (
                  <span className="tabular block text-xs opacity-70">{option.sub}</span>
                )}
              </span>
              {option.hint && (
                <span
                  className={cn(
                    "tabular shrink-0",
                    moneyHints ? "font-heading text-lg font-bold" : "text-xs opacity-70",
                  )}
                >
                  {option.hint}
                </span>
              )}
            </MenuItem>
          ))}
          {shown.length === 0 && !onTyped && <p className="px-3 py-3 text-sm">{noMatch ?? "—"}</p>}
          {onTyped && needle !== "" && !options.some((o) => o.name.toLowerCase() === needle) && (
            <MenuItem
              onClick={() => {
                onTyped(search.trim());
                setSearch("");
                close();
              }}
            >
              <span className="flex-1 truncate font-semibold">
                {typedLabel?.(search.trim()) ?? search.trim()}
              </span>
            </MenuItem>
          )}
          {shown.length > 100 && <p className="px-3 py-2 text-xs">{`+${shown.length - 100}`}</p>}
        </>
      )}
    </Menu>
  );
}
