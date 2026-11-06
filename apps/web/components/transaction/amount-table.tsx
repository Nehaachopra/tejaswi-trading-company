"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

export type AmountRow = { key: string; label: React.ReactNode; amount: number | null; tone?: "total" | "advance"; gapBefore?: boolean };

// an amount's breakup under its field, a row each: what came in or went out, the TDS and reverse-charge GST, the total;
// then, a gap below, the due settled and the advance. A total gets a tint and a larger figure; an amount not known yet
// shows a dash
export function AmountTable({ rows }: { rows: AmountRow[] }) {
  const t = useTranslations("transactions.chat.sum");
  // past the amount (TDS, reverse-charge GST, the total) stays folded until the Breakdown heading is tapped
  const [open, setOpen] = useState(false);
  // a row marked gapBefore starts a new box
  const groups: AmountRow[][] = [];
  for (const r of rows) {
    if (groups.length === 0 || r.gapBefore) groups.push([]);
    groups[groups.length - 1]!.push(r);
  }
  // a Breakdown only when there's something to break down: TDS or reverse-charge GST taken off (between the amount and
  // the total), or an advance (the box after it). Otherwise just the amount shows
  const first = groups[0] ?? [];
  const totalAt = first.findIndex((r) => r.tone === "total");
  const taxed = totalAt > 1 && first.slice(1, totalAt).some((r) => (r.amount ?? 0) > 0);
  const folds = taxed || groups.length > 1;
  return (
    <div className="flex flex-col gap-2.5">
      {/* the Breakdown heading opens and closes it */}
      {folds && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="-mb-1 flex min-h-11 items-center gap-1.5 self-start text-xs font-semibold"
        >
          {t("breakdown")}
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      )}
      {groups.map((group, g) => {
        // folded, or nothing to break down: only the amount shows
        if (g > 0 && folds && !open) return null;
        const shown = g === 0 && (!folds || !open) ? group.slice(0, 1) : group;
        return (
          <table key={group[0]!.key} className="tabular w-full overflow-hidden rounded-control text-sm font-normal shadow-[0_0_5px_0] shadow-chestnut/25">
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.key} className={cn(i > 0 && "border-t border-chestnut/15", r.tone === "total" && "border-chestnut/40 bg-chestnut/[0.05]")}>
                  <td className={cn("px-3 py-2.5 align-middle", r.tone === "total" && "font-semibold")}>{r.label}</td>
                  <td className={cn("whitespace-nowrap px-3 py-2.5 text-right align-middle", r.tone ? "font-heading text-lg font-bold" : "font-semibold")}>
                    {r.amount === null ? "—" : rupees(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

// the advance's name in an outline, so it stands apart from the due
export function AdvanceTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-control border border-current/50 px-1.5 text-xs font-semibold">{children}</span>;
}
