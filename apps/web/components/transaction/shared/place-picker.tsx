"use client";

import { ChevronDown, Plus } from "lucide-react";
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
  quiet = false,
  bare = false,
  alignEnd = false,
  pickEnd = false,
  addLabel,
  onAdd,
}: {
  label: string;
  places: Place<Id>[];
  value: Id | null;
  onPick: (id: Id) => void;
  invalid: boolean;
  // collapsed to the pick, what it holds still shows beside it, muted (a payment's bank cards)
  hintPicked?: boolean;
  // inside a bank card, where only the typed amount is filled: the pick is a plain ivory field, and the picked row a
  // light tint, never chestnut
  quiet?: boolean;
  // collapsed to the pick, no fill, edge or shadow: only its words and the ▾ (a payment's bank cards, where only the
  // amount is filled once everything's in)
  bare?: boolean;
  // collapsed to the pick, its words sit at the right end, beside the ▾ (a payment's bank cards, whose values all
  // line up on the right)
  alignEnd?: boolean;
  // only the collapsed pick at the right end; the open rows stay on the left (Add product's rows)
  pickEnd?: boolean;
  // a last row, + New ..., that starts adding a choice (a product's category or sub-category)
  addLabel?: string;
  onAdd?: () => void;
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
        "overflow-hidden rounded-control text-chestnut",
        // bare and closed to its pick: see-through; otherwise ivory
        bare && !expanded ? "bg-transparent" : "bg-ivory",
        // a soft shadow while open; closed to its filled pick, none (a filled field has no shadow); quiet, always
        (expanded || (quiet && !bare)) && "shadow-[0_0_5px_0] shadow-chestnut/40",
        invalid && !picked && "shadow-danger/80",
      )}
    >
      {expanded ? (
        // every place as a row, the picked one filled
        <div role="radiogroup" aria-label={label} className="flex flex-col">
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
                  "flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-base font-medium transition-colors disabled:opacity-40",
                  o.sub ? "min-h-14" : "min-h-12",
                  on
                    ? quiet
                      ? "bg-chestnut/10"
                      : "bg-chestnut text-ivory"
                    : "hover:bg-chestnut/[0.06]",
                )}
              >
                {/* a long name wraps rather than being cut short (the right column is narrow on a bank card) */}
                {/* what's read first: the name (largest, boldest), then what it holds (smaller, medium), then the
                    account's last digits (smallest, faint) */}
                {/* its words at the right end too, where the pick's are and there's no figure beside them */}
                <span className={cn("min-w-0 flex-1", alignEnd && !o.hint && "text-right")}>
                  <span className="block break-words">{o.name}</span>
                  {o.sub && (
                    <span className="tabular block text-[13px] font-normal opacity-65">{o.sub}</span>
                  )}
                </span>
                {o.hint && <span className="tabular shrink-0 text-[15px] font-semibold">{o.hint}</span>}
              </button>
            );
          })}
          {/* + New ..., under the choices */}
          {addLabel && onAdd && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAdd();
              }}
              className={cn(
                "flex min-h-12 w-full items-center gap-2 border-t border-chestnut/15 px-3.5 py-2 text-base font-medium hover:bg-chestnut/[0.06]",
                alignEnd ? "justify-end text-right" : "text-left",
              )}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              {addLabel}
            </button>
          )}
        </div>
      ) : (
        // collapsed to the pick
        <button
          type="button"
          aria-label={label}
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className={cn(
            "flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-base font-medium",
            bare ? "bg-transparent text-chestnut" : quiet ? "bg-ivory text-chestnut" : "bg-chestnut text-ivory",
            picked.sub ? "min-h-14" : "min-h-12",
          )}
        >
          <span className={cn("min-w-0 flex-1", (alignEnd || pickEnd) && "text-right")}>
            <span className="block break-words">{picked.name}</span>
            {picked.sub && (
              <span className="tabular block text-[13px] font-normal opacity-65">{picked.sub}</span>
            )}
          </span>
          {hintPicked && picked.hint && (
            <span className="tabular shrink-0 text-[15px] font-normal opacity-70">{picked.hint}</span>
          )}
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </button>
      )}
    </div>
  );
}
