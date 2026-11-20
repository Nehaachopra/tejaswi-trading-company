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

// the parts a sum splits into, under the row it's in: a curved line from under that row's name into each part (each
// row 32px, 2px apart), its name on the left and its amount on the right
export function FlowParts({
  parts,
}: {
  parts: { key: string; label: React.ReactNode; amount: number }[];
}) {
  const height = parts.length * 34;
  return (
    <div className="tabular grid grid-cols-[1.75rem_minmax(0,1fr)] text-sm">
      <svg
        viewBox={`0 0 28 ${height}`}
        className="w-7 overflow-visible"
        style={{ height }}
        aria-hidden
      >
        {parts.map((p, i) => {
          const y = 20 + i * 34;
          return (
            <path
              key={p.key}
              d={`M8 0 V ${y - 8} Q 8 ${y}, 16 ${y} H 26`}
              className="fill-none stroke-chestnut/55"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="flex flex-col gap-0.5 pt-1">
        {parts.map((p) => (
          <div key={p.key} className="flex h-8 min-w-0 items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1">{p.label}</span>
            <span className="shrink-0 text-base font-semibold">{rupees(p.amount)}</span>
          </div>
        ))}
      </div>
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
  noWhole = false,
}: {
  // the whole is the row right above (a breakup's Payment): only the two parts, the lines leaving from it
  noWhole?: boolean;
  wholeLabel: string;
  whole: number;
  dueLabel: string;
  due: number;
  advanceLabel: string;
  advance: number;
  paidLabel: string;
  owedBefore: number;
}) {
  return (
    <div className="tabular flex flex-col text-sm">
      {!noWhole && (
        <div className="flex min-h-8 items-center justify-between gap-3">
          <span>{wholeLabel}</span>
          <span className="font-heading text-lg font-bold">{rupees(whole)}</span>
        </div>
      )}
      <FlowParts
        parts={[
          { key: "due", label: dueLabel, amount: due },
          { key: "advance", label: advanceLabel, amount: advance },
        ]}
      />
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
