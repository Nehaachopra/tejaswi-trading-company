"use client";

import { ChevronDown } from "lucide-react";

import { Reveal } from "~/components/ui/reveal";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

// a sum apart from the amount's own rows (a payment's Total cost, what a payment or receipt goes towards), as a tinted
// group: folded, its heading and figure with ▾; open, how it's made up
export function FoldGroup({
  title,
  figure,
  open,
  onOpen,
  children,
}: {
  title: string;
  figure: number;
  open: boolean;
  onOpen: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-3 flex flex-col rounded-control bg-chestnut/6 px-3 py-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
        className="tabular flex min-h-11 items-center justify-between gap-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
          {title}
        </span>
        <span className="flex items-center gap-2">
          {!open && <span className="font-heading text-lg font-bold">{rupees(figure)}</span>}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>
      <Reveal show={open} gap="0px">
        <div className="pb-2.5">{children}</div>
      </Reveal>
    </div>
  );
}

// how a payment or receipt splits against what was owed: the whole on top, two curved lines dropping from it into the
// part towards the due and the advance past it, then the share of what was owed it clears (only when something was)
export function DueFlow({
  wholeLabel,
  whole,
  dueLabel,
  due,
  advanceLabel,
  advance,
  paidLabel,
  owedBefore,
}: {
  wholeLabel: string;
  whole: number;
  dueLabel: string;
  due: number;
  advanceLabel: string;
  advance: number;
  paidLabel: string;
  owedBefore: number;
}) {
  const parts = [
    { key: "due", label: dueLabel, amount: due },
    { key: "advance", label: advanceLabel, amount: advance },
  ];
  return (
    <div className="tabular flex flex-col text-sm">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span>{wholeLabel}</span>
        <span className="font-heading text-lg font-bold">{rupees(whole)}</span>
      </div>
      {/* the lines leave from under the whole's name and end at Due and Advance (each row 32px, 2px apart) */}
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)]">
        <svg viewBox="0 0 28 68" className="h-[68px] w-7 overflow-visible" aria-hidden>
          <path
            d="M8 0 V 12 Q 8 20, 16 20 H 26"
            className="fill-none stroke-chestnut/55"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <path
            d="M8 0 V 46 Q 8 54, 16 54 H 26"
            className="fill-none stroke-chestnut/55"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
        <div className="flex flex-col gap-0.5 pt-1">
          {parts.map((p) => (
            <div key={p.key} className="flex h-8 items-center justify-between gap-3">
              <span>{p.label}</span>
              <span className="text-base font-semibold">{rupees(p.amount)}</span>
            </div>
          ))}
        </div>
      </div>
      {/* how much of what was owed it clears */}
      {owedBefore > 0 && (
        <div className="mt-1 flex min-h-8 items-center justify-between gap-3 border-t border-chestnut/15 pt-1">
          <span>{paidLabel}</span>
          <span className="text-base font-semibold">{`${Math.min(100, Math.round((due / owedBefore) * 100))}%`}</span>
        </div>
      )}
    </div>
  );
}
