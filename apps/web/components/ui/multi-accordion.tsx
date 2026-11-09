"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

// several picks from a short list, as an accordion with the money pickers' look (PlacePicker): every choice open as a
// row in one box (a tick on each picked) while nothing's picked or it's opened; a tap picks or unpicks one and folds it,
// as the money pickers do, to one filled line naming the picks (or what none means) with ▾. A tap on that line opens it
// again for another; a tap outside or Escape folds it too
export function MultiAccordion<Id extends string>({
  label,
  options,
  value,
  onChange,
  noneLabel,
}: {
  label: string;
  options: { id: Id; name: string }[];
  value: Id[];
  onChange: (value: Id[]) => void;
  // what the folded line says with nothing picked
  noneLabel: string;
}) {
  // open to start with when nothing's picked yet (a new party); folded when editing one that has picks
  const [open, setOpen] = useState(value.length === 0);
  const root = useRef<HTMLDivElement>(null);

  // folds on a tap anywhere else, or Escape
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

  const picked = options.filter((o) => value.includes(o.id));
  return (
    <div ref={root} className="overflow-hidden rounded-control bg-ivory text-chestnut shadow-[0_0_5px_0] shadow-chestnut/40">
      {open ? (
        // every choice as a row, a tick on each picked one
        <div role="group" aria-label={label} className="flex flex-col gap-1 p-1.5">
          {options.map((o) => {
            const on = value.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                // kept in the list's own order
                onClick={() => {
                  onChange(on ? value.filter((v) => v !== o.id) : options.map((x) => x.id).filter((id) => id === o.id || value.includes(id)));
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-control px-3 text-left text-base font-semibold transition-colors",
                  on ? "bg-chestnut text-ivory" : "hover:bg-chestnut/[0.06]",
                )}
              >
                <span className="truncate">{o.name}</span>
                {on && <Check className="size-5 shrink-0" aria-hidden />}
              </button>
            );
          })}
        </div>
      ) : (
        // folded to the picks
        <button
          type="button"
          aria-label={label}
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className={cn(
            "flex min-h-14 w-full items-center justify-between gap-3 px-3 text-left text-base font-semibold",
            picked.length ? "bg-chestnut text-ivory" : "bg-ivory text-chestnut",
          )}
        >
          <span className="truncate">{picked.length ? picked.map((o) => o.name).join(", ") : noneLabel}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </button>
      )}
    </div>
  );
}
