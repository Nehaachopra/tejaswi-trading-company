"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

export type AmountRow = {
  key: string;
  label: React.ReactNode;
  amount: number | null;
  tone?: "total";
  // taken out of what's above it (a bill's TDS): shown with a minus; added on top (reverse-charge GST): a plus
  minus?: boolean;
  plus?: boolean;
  // shown in place of the sum (a share paid: 60%)
  text?: string;
};

// whether there's anything to break down: TDS or reverse-charge GST (the rows between the amount and the total, still
// being worked out or above nil), or a due and advance (the rows after the total)
export function hasBreakdown(rows: AmountRow[]) {
  const totalAt = rows.findIndex((r) => r.tone === "total");
  if (totalAt < 0) return false;
  const taxed = rows.slice(1, totalAt).some((r) => r.amount !== 0);
  return taxed || rows.length > totalAt + 1;
}

// the arrow beside an amount's field, just the icon, that opens its breakdown below (only where there's one)
export function BreakdownButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useTranslations("transactions.chat.sum");
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={t("breakdown")}
      title={t("breakdown")}
      onClick={onToggle}
      className="flex min-h-14 shrink-0 items-center text-chestnut"
    >
      <ChevronDown
        className={cn("size-6 transition-transform", open && "rotate-180")}
        aria-hidden
      />
    </button>
  );
}

// an amount's breakdown under its field, in one box, a row each: what came in or went out, the TDS and reverse-charge
// GST, the total, then the due settled and the advance. The total gets a tint and a larger figure; an amount not known
// yet shows a dash. It shows by itself whenever there's something to break down; with nothing, only when opened from
// the arrow and `always` is set (where a row holds something to set, like a receipt's TDS switch)
export function AmountTable({
  rows,
  open,
  always = false,
  plain = false,
}: {
  rows: AmountRow[];
  open: boolean;
  always?: boolean;
  // no box, lines or tint: just the rows, each label on the left and its figure on the right (a payment's)
  plain?: boolean;
}) {
  const t = useTranslations("transactions.chat.sum");
  if (!hasBreakdown(rows) && !(always && open)) return null;
  // the rows up to the total in one box; those after it (a due and an advance) in a box of their own, a gap above it
  const totalAt = rows.findIndex((r) => r.tone === "total");
  const main = totalAt >= 0 ? rows.slice(0, totalAt + 1) : rows;
  const rest = totalAt >= 0 ? rows.slice(totalAt + 1) : [];
  return (
    <div className="flex flex-col gap-4">
      {/* headed like the cards' Breakdown */}
      <h3 className="-mb-1 text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
        {t("breakup")}
      </h3>
      {plain ? <PlainRows rows={main} /> : <RowsBox rows={main} />}
      {rest.length > 0 && (plain ? <PlainRows rows={rest} /> : <RowsBox rows={rest} />)}
    </div>
  );
}

// the breakdown's rows with nothing around them: the label on the left, its figure in bold on the right, the
// total bolder and larger
export function PlainRows({ rows }: { rows: AmountRow[] }) {
  return (
    <div className="tabular flex flex-col gap-2.5 text-sm font-normal">
      {rows.map((r) => (
        <div
          key={r.key}
          className={cn(
            "flex items-baseline justify-between gap-3",
            // a line above the total, as under a sum
            r.tone === "total" && "border-t border-chestnut/30 pt-2.5",
          )}
        >
          <span className={cn("min-w-0", r.tone === "total" && "font-bold")}>{r.label}</span>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap",
              // the total: its label bold too, its figure larger in the heading's letters
              r.tone === "total" ? "font-heading text-xl font-bold" : "text-base font-semibold",
            )}
          >
            {r.text !== undefined
              ? r.text
              : r.amount === null
                ? "—"
                : `${r.amount > 0 ? (r.minus ? "− " : r.plus ? "+ " : "") : ""}${rupees(r.amount)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// one box of the breakdown's rows: a line between each, the total tinted with a larger figure
function RowsBox({ rows }: { rows: AmountRow[] }) {
  return (
    <table className="tabular w-full overflow-hidden rounded-control text-sm font-normal shadow-[0_0_5px_0] shadow-chestnut/25">
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.key}
            className={cn(
              i > 0 && "border-t border-chestnut/15",
              r.tone === "total" && "border-chestnut/40 bg-chestnut/[0.05]",
            )}
          >
            <td className={cn("px-3 py-2.5 align-middle", r.tone === "total" && "font-semibold")}>
              {r.label}
            </td>
            <td
              className={cn(
                "whitespace-nowrap px-3 py-2.5 text-right align-middle",
                r.tone ? "font-heading text-lg font-bold" : "font-semibold",
              )}
            >
              {r.amount === null ? "—" : rupees(r.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
