import { cn } from "~/lib/utils";

// the parts the sale invoice and the vouchers share, so they read as one family: the title line, the table's last
// column and the breakup under it. What differs between them is only the table's columns and the breakup's rows

// the lines and boxes (as on the voucher)
const cell = "border-chestnut/40 px-2 py-1.5";

// the table's last column (Total, Amount): the breakup's figures sit right under it, so both are this wide
export const LAST_COL = "w-40 min-w-40";

// the title centred, with the jurisdiction on its line at the left, over our name; on a phone, under the title
export function DocHead({ title, jurisdiction }: { title: string; jurisdiction: string }) {
  return (
    <div className="grid gap-0.5 pb-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:gap-3">
      <p className="text-center font-heading text-2xl font-bold sm:col-start-2 sm:row-start-1">{title}</p>
      <p className="text-center text-xs font-semibold sm:col-start-1 sm:row-start-1 sm:pb-1 sm:text-left">
        {jurisdiction}
      </p>
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
  const line = "grid grid-cols-[1fr_10rem] text-right sm:grid-cols-[12rem_10rem] sm:border-l sm:border-chestnut/40";
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
