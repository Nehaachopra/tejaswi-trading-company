"use client";

import type { ReactNode } from "react";

import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";

// a long figure steps down a size, so it stays whole in its column (the bigger the number, the smaller the text)
export const fitText = (shown: string) =>
  shown.length > 11 ? "text-xs" : shown.length > 8 ? "text-sm" : "text-base";

// one row of the table: what it is, the figure as it is now, and the box for this order's figure
export type FigureRow = {
  key: string;
  label: ReactNode;
  current?: string;
  // an icon before the current figure (the sack beside how many are free)
  icon?: ReactNode;
  input: ReactNode;
  // a row whose box carries notes under it: label and current sit at the box's top, not its middle
  top?: boolean;
};

// the order line's figures as a table: Basis | Current | New, one row each (rate per unit, price + GST, quantity …);
// without a Current heading (a purchase), only Basis | New. Basis wraps, Current shrinks and cuts before it pushes,
// New keeps its fixed width. Without headings (the price card), just the rows: label left, figure or box right
export function FiguresTable({
  headings,
  rows,
}: {
  headings?: { basis: string; current?: string; new: string };
  rows: FigureRow[];
}) {
  const withCurrent = headings?.current != null;
  return (
    <div
      className={cn(
        "grid items-center gap-x-3 gap-y-3 text-sm",
        withCurrent
          ? "grid-cols-[minmax(4.5rem,1fr)_minmax(0,max-content)_7rem]"
          : "grid-cols-[minmax(4.5rem,1fr)_8rem]",
      )}
    >
      {/* the headings, as the godowns' (Godown, Available, Quantity): small, bold, muted, a line under them */}
      {headings && (
        <>
          <span className="text-xs font-semibold opacity-60">{headings.basis}</span>
          {withCurrent && <span className="text-right text-xs font-semibold opacity-60">{headings.current}</span>}
          <span className="text-right text-xs font-semibold opacity-60">
            {headings.new}
            <RequiredMark />
          </span>
          <div className="col-span-full -my-1 border-t border-chestnut/15" />
        </>
      )}

      {/* the rows */}
      {rows.map((row) => (
        <Row key={row.key} row={row} withCurrent={withCurrent} />
      ))}
    </div>
  );
}

function Row({ row, withCurrent }: { row: FigureRow; withCurrent: boolean }) {
  return (
    <>
      <span className={cn("min-w-0 break-words", row.top && "self-start pt-3")}>{row.label}</span>
      {/* the current figure: smaller when long, cut (whole on hover) only if it still can't fit */}
      {withCurrent && (
        <span
          title={row.current}
          className={cn(
            "tabular flex min-w-0 items-center justify-end gap-1.5 font-bold",
            fitText(row.current ?? ""),
            row.top && "min-h-11 self-start",
          )}
        >
          {row.icon}
          <span className="truncate">{row.current ?? "–"}</span>
        </span>
      )}
      {row.input}
    </>
  );
}

// a ₹ box for the New column: no border, a soft shadow, ₹ on the left, the figure on the right (smaller when long)
export function MoneyBox({
  value,
  onChange,
  maxDigits,
  label,
  autoFocus,
  quiet = false,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  maxDigits: number;
  label: string;
  autoFocus?: boolean;
  // a box that can be typed in but needn't be (it follows another): no soft edge until it has the cursor
  quiet?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex min-h-11 w-full min-w-0 items-center gap-[3px] rounded-control px-2.5 shadow-[0_0_5px_0] transition-shadow focus-within:shadow-chestnut/80",
        quiet ? "shadow-transparent" : "shadow-chestnut/40",
        className,
      )}
    >
      <span className="text-base">₹</span>
      <NumberInput
        autoFocus={autoFocus}
        value={value}
        decimals={2}
        maxDigits={maxDigits}
        onChange={onChange}
        aria-label={label}
        className={cn(
          "tabular w-full min-w-0 flex-1 bg-transparent text-right font-bold outline-none",
          fitText(value),
        )}
      />
    </span>
  );
}
