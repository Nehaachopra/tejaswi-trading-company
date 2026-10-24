"use client";

import { X } from "lucide-react";

import { cn } from "~/lib/utils";

// the ✕ at the end of a search box that has something in it: ivory on the chestnut page, chestnut on ivory panels
export function ClearButton({ onClear, label, surface = "chestnut" }: { onClear: () => void; label: string; surface?: "chestnut" | "ivory" }) {
  return (
    <button
      type="button"
      aria-label={label}
      // keep the focus in the box while clearing it
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClear}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full transition-colors",
        surface === "chestnut" ? "text-ivory hover:bg-ivory/15" : "text-chestnut hover:bg-chestnut/10",
      )}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
