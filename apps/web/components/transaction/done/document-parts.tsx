import { Fragment, type ReactNode } from "react";

import { cn } from "~/lib/utils";

// the parts the sale invoice and the vouchers share, so they read as one family: the title line, the table's last
// column and the breakup under it. What differs between them is only the table's columns and the breakup's rows

// the lines and boxes (as on the voucher)
const cell = "border-chestnut/40 px-2 py-1.5";

// the table's last column (Total, Amount): the breakup's figures sit right under it, so both are this wide (narrower
// printed, so every column fits the page)
export const LAST_COL = "w-40 min-w-40 print:w-32! print:min-w-32!";

// the title centred, with the jurisdiction on its line at the left, over our name; on a phone, under the title
// (`screenTitle`: shown on the screen in its place, with no jurisdiction; the printed copy keeps both)
export function DocHead({ title, screenTitle, jurisdiction }: { title: string; screenTitle?: string; jurisdiction: string }) {
  return (
    <div className="grid gap-0.5 pb-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:gap-3">
      <p className="text-center font-heading text-2xl font-bold sm:col-start-2 sm:row-start-1">
        {screenTitle ? (
          <>
            <span className="print:hidden">{screenTitle}</span>
            <span className="hidden print:inline">{title}</span>
          </>
        ) : (
          title
        )}
      </p>
      <p className={cn("text-center text-xs font-semibold sm:col-start-1 sm:row-start-1 sm:pb-1 sm:text-left", screenTitle && "hidden print:block")}>
        {jurisdiction}
      </p>
    </div>
  );
}

// a row's quantity after its returns (on screen only): what was billed struck, what's left beside it; printed, as billed
export function LeftQuantity({ billed, returned }: { billed: number; returned: number }) {
  if (returned <= 0 || returned >= billed) return <>{billed}</>;
  return (
    <>
      <span className="print:hidden">
        <s className="opacity-60">{billed}</s> <b>{billed - returned}</b>
      </span>
      <span className="hidden print:inline">{billed}</span>
    </>
  );
}

// the details the screen shows in place of the document's own (printed only): a row each, label left and value right,
// two pairs to a row on a wider screen (one alone at the end runs across); remarks, only when typed, across the bottom
export function ScreenDetails({ rows, remarks }: { rows: { key: string; label: string; value: ReactNode }[]; remarks: { label: string; text: string | null } }) {
  return (
    <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] print:hidden">
      {rows.map((r, i) => {
        const alone = i % 2 === 0 && i === rows.length - 1;
        return (
          <Fragment key={r.key}>
            <span className={cn(cell, "border-b border-r font-medium")}>{r.label}</span>
            <span className={cn(cell, "border-b break-words", alone ? "sm:col-span-3" : i % 2 === 0 && "sm:border-r")}>{r.value}</span>
          </Fragment>
        );
      })}
      {remarks.text && (
        <>
          <span className={cn(cell, "border-b border-r font-medium")}>{remarks.label}</span>
          <span className={cn(cell, "border-b break-words sm:col-span-3")}>{remarks.text}</span>
        </>
      )}
    </div>
  );
}

export type BreakupRow = { key: string; label: string; value: string };

// the breakup: Total first (when something comes off or goes on), each row after it, and the amount in the chestnut
// band. Labels end where the table's last column starts; the figures sit under it
export function Breakup({
  rows,
  label,
  amount,
}: {
  rows: BreakupRow[];
  label: string;
  amount: string;
}) {
  const line =
    "grid grid-cols-[1fr_10rem] text-right sm:grid-cols-[12rem_10rem] sm:border-l sm:border-chestnut/40 print:grid-cols-[12rem_8rem]!";
  return (
    <div className="tabular grid content-start">
      {rows.map((r) => (
        <p key={r.key} className={cn(line, "border-b border-chestnut/40")}>
          <span className={cn(cell, "border-r px-2.5 py-2")}>{r.label}</span>
          <span className={cn(cell, "px-2.5 py-2 font-semibold")}>{r.value}</span>
        </p>
      ))}
      <p className={cn(line, "bg-chestnut font-heading text-base font-bold text-ivory print:bg-[#3b1f14]")}>
        <span className={cn(cell, "border-r border-ivory/35 px-2.5 py-2")}>{label}</span>
        <span className={cn(cell, "px-2.5 py-2")}>{amount}</span>
      </p>
    </div>
  );
}

// the remarks under the details grid, filling what's left of that side
export function Remarks({ label, text }: { label: string; text: string | null }) {
  return (
    <p className={cn(cell, "flex-1 break-words")}>
      <span className="font-semibold">{label}:</span> {text ?? "—"}
    </p>
  );
}
