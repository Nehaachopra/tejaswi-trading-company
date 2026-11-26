"use client";

import { CalendarDays, ChevronRight, Hash } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { CopyButton } from "~/components/ui/copy-button";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";

// a day as the log rows show it: "26 Nov 2026"
export const logDay = (d: Date, locale: string) =>
  d.toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

// under a sale's invoice (not printed): its returns, oldest first, as a two-column table. Return: each one's ID (with
// its copy button), day and total, opening its credit note; Replacement: the sale it made for replaced items, the
// same way, opening its invoice ("–" when nothing was replaced). `returnOnly` (a purchase's): the Return column alone,
// each return with replaced packs still to come carrying a bar of how much is pending under its total. Cancelled:
// faded, the totals struck through
export function ReturnsLog({ returns, returnOnly = false }: { returns: HistoryTransaction["returns"]; returnOnly?: boolean }) {
  const t = useTranslations("history");
  const locale = useLocale();
  if (returns.length === 0) return null;
  return (
    <LogSection id="returns-log" heading={t("returns")}>
      <table className="w-full table-fixed border-collapse">
        {/* the two headings */}
        <thead>
          <tr className="border-b border-chestnut/15 text-left text-xs text-chestnut/65">
            <th className="px-3 pb-2 pt-2.5 font-semibold sm:px-4">{t("returnColumn")}</th>
            {!returnOnly && <th className="border-l border-chestnut/15 px-3 pb-2 pt-2.5 font-semibold sm:px-4">{t("replacement")}</th>}
          </tr>
        </thead>
        <tbody>
          {returns.map((r) => {
            const cancelled = r.status === "cancelled";
            // replaced packs still to come: how much of them is pending
            const pending = r.replaced && r.replaced.back < r.replaced.sent ? Math.round(((r.replaced.sent - r.replaced.back) / r.replaced.sent) * 100) : null;
            return (
              <tr key={r.transactionId} className={cn("border-t border-chestnut/15 first:border-t-0", cancelled && "opacity-60")}>
                {/* the return: to its credit (or debit) note */}
                <td className="p-0 align-top">
                  <LogCell
                    href={`/history/${r.transactionId}`}
                    id={r.assignedId}
                    day={logDay(new Date(`${r.returnDate}T12:00:00+05:30`), locale)}
                    total={r.total}
                    struck={cancelled}
                    openLabel={t("open")}
                    under={pending !== null && !cancelled ? <PendingBar share={pending} label={t("replacedPending", { share: pending })} /> : undefined}
                  />
                </td>
                {/* the replacement sale: to its invoice */}
                {!returnOnly && (
                  <td className="border-l border-chestnut/15 p-0 align-top">
                    {r.replacement ? (
                      <LogCell
                        href={`/history/${r.replacement.transactionId}`}
                        id={r.replacement.assignedId}
                        day={logDay(new Date(r.replacement.dateTime), locale)}
                        total={r.replacement.total}
                        struck={cancelled}
                        openLabel={t("open")}
                      />
                    ) : (
                      <span className="flex min-h-16 items-center px-3 py-2.5 font-semibold text-chestnut/40 sm:px-4">–</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </LogSection>
  );
}

// a log under a document (not printed): its small heading, then the ivory box; at most this tall, its rows scrolling
// inside with the heading held at the top while they're in view
export function LogSection({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="no-print mt-6 flex max-h-80 flex-col overflow-y-auto overscroll-contain rounded-control [scrollbar-width:thin]">
      <h2 id={id} className="sticky top-0 z-10 bg-chestnut pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ivory/70">
        {heading}
      </h2>
      <div className="on-ivory shrink-0 overflow-hidden rounded-control bg-ivory text-chestnut">{children}</div>
    </section>
  );
}

// one cell: the ID (with its copy button) and the day (with its calendar icon), then the total and the arrow, anything
// `under` it below the total; on a phone the total goes under the ID so two columns fit. The whole cell opens it; the
// copy button sits above the link, so a tap on it copies
export function LogCell({
  href,
  id,
  day,
  total,
  struck,
  openLabel,
  under,
}: {
  href: string;
  id: string;
  day: string;
  total: number;
  struck: boolean;
  openLabel: string;
  under?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-16 flex-col gap-1.5 px-3 py-2.5 hover:bg-chestnut/[0.05] sm:flex-row sm:items-center sm:justify-between sm:gap-2.5 sm:px-4 sm:py-3">
      <Link href={href} aria-label={`${openLabel}: ${id}`} className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-chestnut" />
      <span className="pointer-events-none flex min-w-0 flex-col gap-0.5">
        <span className="tabular flex items-center gap-1 text-sm font-semibold sm:text-[0.9375rem]">
          <Hash className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{id}</span>
          <span className="pointer-events-auto relative">
            <CopyButton value={id} />
          </span>
        </span>
        <span className="tabular flex items-center gap-1 text-xs text-chestnut/65">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          {day}
        </span>
      </span>
      <span className="pointer-events-none flex shrink-0 items-center justify-between gap-1.5">
        <span className="flex flex-col gap-1.5 sm:items-end">
          <span className={cn("tabular font-heading text-base font-bold leading-none sm:text-lg", struck && "line-through")}>{rupees(total)}</span>
          {under}
        </span>
        <ChevronRight className="size-5 text-chestnut/50" aria-hidden />
      </span>
    </div>
  );
}

// how much of a return's replaced packs is still to come: a thin bar, chestnut only for what has come back (the rest
// the light track), the share pending under it
function PendingBar({ share, label }: { share: number; label: string }) {
  return (
    <span className="flex w-28 flex-col gap-1 sm:items-end">
      <span role="progressbar" aria-valuenow={100 - share} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="block h-1.5 w-full overflow-hidden rounded-full bg-chestnut/12">
        <i className="block h-full rounded-full bg-chestnut" style={{ width: `${100 - share}%` }} />
      </span>
      <span className="tabular text-[0.6875rem] font-semibold text-chestnut/65">{label}</span>
    </span>
  );
}
