"use client";

import { CalendarDays, ChevronRight, Hash } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { CopyButton } from "~/components/ui/copy-button";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";

// under a sale's invoice (not printed): its returns, oldest first, as History's rows: each one's ID (with its copy
// button) and day, how many items and how it was settled, its total, and an arrow to it (its credit note). Cancelled:
// faded, the total struck through
export function ReturnsLog({ returns }: { returns: HistoryTransaction["returns"] }) {
  const t = useTranslations("history");
  const locale = useLocale();
  if (returns.length === 0) return null;
  return (
    // at most this tall, its rows scrolling inside with the heading held at the top while they're in view
    <section aria-labelledby="returns-log" className="no-print mt-6 flex max-h-80 flex-col overflow-y-auto overscroll-contain rounded-control [scrollbar-width:thin]">
      <h2 id="returns-log" className="sticky top-0 z-10 bg-chestnut pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ivory/70">
        {t("returns")}
      </h2>
      <ul className="on-ivory shrink-0 overflow-hidden rounded-control bg-ivory text-chestnut">
        {returns.map((r) => {
          const cancelled = r.status === "cancelled";
          return (
            <li key={r.transactionId} className="border-t border-chestnut/15 first:border-t-0">
              <div className={cn("flex items-center justify-between gap-3 px-4 py-3", cancelled && "opacity-60")}>
                {/* the ID and day, then how many items and how it was settled */}
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="tabular flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-chestnut/70">
                    <span className="flex items-center gap-1 text-[0.9375rem] font-semibold text-chestnut">
                      <Hash className="size-3.5" aria-hidden />
                      {r.assignedId}
                      <CopyButton value={r.assignedId} />
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3.5" aria-hidden />
                      {new Date(`${r.returnDate}T12:00:00+05:30`).toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                    </span>
                  </span>
                  <span className="text-xs text-chestnut/70">
                    {t("returnItems", { count: r.items })}, {t(`settledIn.${r.settledIn}`)}
                    {cancelled && <span className="ml-2 font-semibold">{t("cancelled")}</span>}
                  </span>
                </span>
                {/* the total, and the arrow to the return */}
                <Link href={`/history/${r.transactionId}`} aria-label={`${t("open")}: ${r.assignedId}`} className="flex shrink-0 items-center gap-2">
                  <span className={cn("tabular font-heading text-lg font-bold leading-none", cancelled && "line-through")}>{rupees(r.total)}</span>
                  <ChevronRight className="size-5 text-chestnut/50" aria-hidden />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
