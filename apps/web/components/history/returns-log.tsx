"use client";

import { ChevronRight, Hash, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { CopyButton } from "~/components/ui/copy-button";
import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";

// under a sale's invoice (not printed): its returns, oldest first, as a two-column table. Return: each one's ID (with
// its copy button), day and total, opening its credit note; Replacement: the sale it made for replaced items, the
// same way, opening its invoice ("–" when nothing was replaced). A purchase return's swap instead: Replaced ×N and the
// day they came, or Pending ×N with Receive replacement (`onReceive`, the admin's). Cancelled: faded, the totals struck
// through
export function ReturnsLog({ returns, onReceive }: { returns: HistoryTransaction["returns"]; onReceive?: (returnId: string) => void }) {
  const t = useTranslations("history");
  const locale = useLocale();
  if (returns.length === 0) return null;
  const dayOf = (d: Date) => d.toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  return (
    // at most this tall, its rows scrolling inside with the heading held at the top while they're in view
    <section aria-labelledby="returns-log" className="no-print mt-6 flex max-h-80 flex-col overflow-y-auto overscroll-contain rounded-control [scrollbar-width:thin]">
      <h2 id="returns-log" className="sticky top-0 z-10 bg-chestnut pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ivory/70">
        {t("returns")}
      </h2>
      <div className="on-ivory shrink-0 overflow-hidden rounded-control bg-ivory text-chestnut">
        <table className="w-full table-fixed border-collapse">
          {/* the two headings */}
          <thead>
            <tr className="border-b border-chestnut/15 text-left text-xs text-chestnut/65">
              <th className="px-3 pb-2 pt-2.5 font-semibold sm:px-4">{t("returnColumn")}</th>
              <th className="border-l border-chestnut/15 px-3 pb-2 pt-2.5 font-semibold sm:px-4">{t("replacement")}</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => {
              const cancelled = r.status === "cancelled";
              return (
                <tr key={r.transactionId} className={cn("border-t border-chestnut/15 first:border-t-0", cancelled && "opacity-60")}>
                  {/* the return: to its credit note */}
                  <td className="p-0 align-top">
                    <Cell
                      href={`/history/${r.transactionId}`}
                      id={r.assignedId}
                      day={dayOf(new Date(`${r.returnDate}T12:00:00+05:30`))}
                      total={r.total}
                      struck={cancelled}
                      openLabel={t("open")}
                    />
                  </td>
                  {/* the replacement sale: to its invoice */}
                  <td className="border-l border-chestnut/15 p-0 align-top">
                    {r.replacement ? (
                      <Cell
                        href={`/history/${r.replacement.transactionId}`}
                        id={r.replacement.assignedId}
                        day={dayOf(new Date(r.replacement.dateTime))}
                        total={r.replacement.total}
                        struck={cancelled}
                        openLabel={t("open")}
                      />
                    ) : r.swap ? (
                      <SwapCell swap={r.swap} dayOf={dayOf} onReceive={onReceive && !cancelled ? () => onReceive(r.transactionId) : undefined} />
                    ) : (
                      <span className="flex min-h-16 items-center px-3 py-2.5 font-semibold text-chestnut/40 sm:px-4">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// one cell: the ID (with its copy button) and day, then the total and the arrow; on a phone the total goes under the
// ID so both columns fit. The whole cell opens it; the copy button sits above the link, so a tap on it copies
function Cell({ href, id, day, total, struck, openLabel }: { href: string; id: string; day: string; total: number; struck: boolean; openLabel: string }) {
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
        <span className="tabular text-xs text-chestnut/65">{day}</span>
      </span>
      <span className="pointer-events-none flex shrink-0 items-center justify-between gap-1.5">
        <span className={cn("tabular font-heading text-base font-bold leading-none sm:text-lg", struck && "line-through")}>{rupees(total)}</span>
        <ChevronRight className="size-5 text-chestnut/50" aria-hidden />
      </span>
    </div>
  );
}

// a purchase return's swap: how many were replaced and the day they came; while some are still to come, Pending with
// Receive replacement under it
function SwapCell({
  swap,
  dayOf,
  onReceive,
}: {
  swap: NonNullable<HistoryTransaction["returns"][number]["swap"]>;
  dayOf: (d: Date) => string;
  onReceive?: () => void;
}) {
  const t = useTranslations("history");
  return (
    <div className="flex min-h-16 flex-col gap-1.5 px-3 py-2.5 sm:px-4 sm:py-3">
      {swap.pending > 0 ? (
        <>
          <span className="tabular text-sm font-semibold sm:text-[0.9375rem]">{t("pendingCount", { count: swap.pending })}</span>
          {onReceive && (
            <button type="button" onClick={onReceive} className={cn(ADD_ON_IVORY, "min-h-9 w-fit sm:w-fit")}>
              <PackageCheck className="size-4" aria-hidden /> {t("receive")}
            </button>
          )}
        </>
      ) : (
        <>
          <span className="tabular text-sm font-semibold sm:text-[0.9375rem]">{t("replacedCount", { count: swap.quantity })}</span>
          {swap.receivedAt && <span className="tabular text-xs text-chestnut/65">{dayOf(new Date(`${swap.receivedAt}T12:00:00+05:30`))}</span>}
        </>
      )}
    </div>
  );
}
