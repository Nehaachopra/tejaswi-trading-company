"use client";

import { cn } from "~/lib/utils";

// an on/off switch on an ivory surface; `labelledBy` is the id of the words beside it
export function Switch({ on, onFlip, labelledBy, disabled }: { on: boolean; onFlip: (on: boolean) => void; labelledBy: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onFlip(!on)}
      className={cn("relative h-8 w-14 shrink-0 rounded-full border-2 border-chestnut transition-colors disabled:opacity-70", on ? "bg-chestnut" : "bg-transparent")}
    >
      <span aria-hidden className={cn("absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-all", on ? "left-7 bg-ivory" : "left-1 bg-chestnut")} />
    </button>
  );
}
