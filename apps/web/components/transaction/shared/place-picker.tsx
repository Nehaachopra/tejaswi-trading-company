"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

// a place money comes into or goes out of (cash, a bank account ...): its name, a second line under it (an account's last
// digits), what it holds (the admin only), and whether it can be used
export type Place<Id extends string> = {
  id: Id;
  name: string;
  sub?: string;
  hint?: string;
  disabled: boolean;
};

// Cash, Bank or Cash + Bank (a receipt's Received into, a payment's Paid from), or one of the bank accounts, as an
// accordion: every choice open as a row in one box until one is picked (each with what it holds, large; one that
// can't be used muted), then collapsed to the pick, filled, with ▾. Tapping it opens them all again; a pick, a tap
// outside or Escape collapses it
export function PlacePicker<Id extends string>({
  label,
  places,
  value,
  onPick,
  invalid,
  hintPicked = false,
}: {
  label: string;
  places: Place<Id>[];
  value: Id | null;
  onPick: (id: Id) => void;
  invalid: boolean;
  // collapsed to the pick, what it holds still shows beside it, muted (a payment's bank cards)
  hintPicked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const picked = places.find((p) => p.id === value) ?? null;
  const expanded = !picked || open;

  // opened again from the pick: it collapses on a tap anywhere else, or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) =>
      !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className={cn(
        "overflow-hidden rounded-control bg-ivory text-chestnut shadow-[0_0_5px_0] shadow-chestnut/40",
        invalid && !picked && "shadow-danger/80",
      )}
    >
      {expanded ? (
        // every place as a row, the picked one filled
        <div role="radiogroup" aria-label={label} className="flex flex-col gap-1 p-1.5">
          {places.map((o) => {
            const on = value === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={o.disabled}
                onClick={() => {
                  setOpen(false);
                  if (!on) onPick(o.id);
                }}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-control px-3 text-left text-base font-semibold transition-colors disabled:opacity-40",
                  on ? "bg-chestnut text-ivory" : "hover:bg-chestnut/[0.06]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.name}</span>
                  {o.sub && (
                    <span className="tabular block text-xs font-normal opacity-70">{o.sub}</span>
                  )}
                </span>
                {o.hint && (
                  <span className="tabular shrink-0 font-heading text-lg font-bold">{o.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        // collapsed to the pick
        <button
          type="button"
          aria-label={label}
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="flex min-h-14 w-full items-center justify-between gap-3 bg-chestnut px-3 text-left text-base font-semibold text-ivory"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate">{picked.name}</span>
            {picked.sub && (
              <span className="tabular block text-xs font-normal opacity-70">{picked.sub}</span>
            )}
          </span>
          {hintPicked && picked.hint && (
            <span className="tabular shrink-0 text-sm font-normal opacity-70">{picked.hint}</span>
          )}
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </button>
      )}
    </div>
  );
}
