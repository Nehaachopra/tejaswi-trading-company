"use client";

import { Check, IndianRupee } from "lucide-react";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

// one figure over a thin bar with a gold ₹ coin riding on the end of what's filled: what's left to place on a payment's
// or receipt's cards, or what's left in cash and the bank after the salaries. `done`: green with a tick and its words in
// place of the figure; `over`: red, the bar full (past what there is)
export function Meter({
  label,
  figure,
  share,
  done = false,
  doneLabel,
  over = false,
  className,
}: {
  label: string;
  figure: number;
  // how far the bar is filled, 0 to 100
  share: number;
  done?: boolean;
  doneLabel?: string;
  over?: boolean;
  className?: string;
}) {
  const fill = Math.max(0, Math.min(100, share));
  return (
    <div className={cn("tabular flex min-w-0 flex-col gap-2", className)}>
      <div className={cn("flex items-baseline justify-between gap-3", over && "text-danger")}>
        <span className="text-sm">{label}</span>
        {done ? (
          <span className="flex items-center gap-1.5 font-heading text-lg font-bold text-success">
            <Check className="size-4" strokeWidth={2.5} aria-hidden />
            {doneLabel}
          </span>
        ) : (
          <span className="font-heading text-2xl font-bold leading-none">{rupees(figure)}</span>
        )}
      </div>
      {/* the bar, with the coin on the end of what's filled (a dark rim so it stands out on the ivory) */}
      <div className="relative py-1.5">
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fill)}
          className="h-1.5 overflow-hidden rounded-full bg-chestnut/10"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              over ? "bg-danger" : done ? "bg-success" : "bg-chestnut",
            )}
            style={{ width: `${fill}%` }}
          />
        </div>
        <span
          aria-hidden
          className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-amber-600 bg-amber-300 text-amber-900 shadow-[0_1px_3px_0] shadow-chestnut/50 ring-1 ring-chestnut/40 transition-[left] duration-300"
          style={{ left: `clamp(10px, ${fill}%, calc(100% - 10px))` }}
        >
          <IndianRupee className="size-2.5" strokeWidth={3} />
        </span>
      </div>
    </div>
  );
}
