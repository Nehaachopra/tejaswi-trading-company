"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

import { money } from "./form-basics";

// a place money comes into or goes out of: its name, what it holds (the admin only), and whether it can be used
export type Place<Id extends string> = { id: Id; name: string; hint?: string; disabled: boolean };

// the look of a place's button: stacked, name left, what it holds right; the picked one filled; one that can't be used
// muted; red edges when nothing's picked on a Next or Save
const placeButton = (on: boolean, disabled: boolean, invalid: boolean) =>
  cn(
    "flex w-full items-center justify-between gap-3 rounded-control border-2 px-3.5 py-2 text-left shadow-[0_2px_4px_0] shadow-chestnut/20 transition-colors",
    on ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50 bg-ivory text-chestnut hover:bg-chestnut/[0.06]",
    disabled && "cursor-not-allowed opacity-45 shadow-none hover:bg-ivory",
    invalid && !disabled && "border-danger",
  );

// Cash, Bank or Cash + Bank (a receipt's Received into, a payment's Paid from): every place as a button until one is
// picked; then only that one, as a dropdown (its name, what it holds, ▾). Tapping it lists all three again; a pick, a
// tap outside or Escape folds it back
export function PlacePicker<Id extends string>({
  label,
  places,
  value,
  onPick,
  invalid,
}: {
  label: string;
  places: Place<Id>[];
  value: Id | null;
  onPick: (id: Id) => void;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const picked = places.find((p) => p.id === value) ?? null;

  // the list folds back on a tap anywhere else, or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // picked and folded: only the pick, as a dropdown
  if (picked && !open)
    return (
      <div ref={root}>
        <button type="button" aria-haspopup="true" aria-expanded={false} aria-label={label} onClick={() => setOpen(true)} className={placeButton(true, false, false)}>
          <span className="text-base font-semibold">{picked.name}</span>
          <span className="flex items-center gap-2">
            {picked.hint && <span className={cn(money, "text-lg")}>{picked.hint}</span>}
            <ChevronDown className="size-5 shrink-0" aria-hidden />
          </span>
        </button>
      </div>
    );

  // nothing picked yet, or the dropdown opened: a button each
  return (
    <div ref={root} role="radiogroup" aria-label={label} className="grid gap-2">
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
            className={placeButton(on, o.disabled, invalid)}
          >
            <span className="text-base font-semibold">{o.name}</span>
            {o.hint && <span className={cn(money, "text-lg")}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
