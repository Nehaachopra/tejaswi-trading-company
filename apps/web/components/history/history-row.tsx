"use client";

import { CalendarDays, ChevronRight, Hash } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import type { RouterOutputs } from "@repo/trpc/client";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

export type HistoryRowData = RouterOutputs["transactions"]["history"]["list"][number];

// when it happened, as the row shows it: "20 Nov, 4:12 pm"
const when = (at: Date, locale: string) => {
  const day = at.toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const time = at.toLocaleTimeString(`${locale}-IN`, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return `${day}, ${time}`;
};

// one transaction: its type on top, its ID and when under it side by side, the amount and an arrow on the right; the
// whole row opens it. Cancelled: faded, the amount struck through; a sale with goods back: Returned or Part returned;
// edited: a small Edited badge beside the type
export function HistoryRow({ row }: { row: HistoryRowData }) {
  const t = useTranslations("history");
  const tt = useTranslations("accounts.types");
  const locale = useLocale();
  const cancelled = row.status === "cancelled";
  return (
    <li className="border-t border-chestnut/15 first:border-t-0">
      <Link
        href={`/history/${row.id}`}
        className={cn("on-ivory flex items-center justify-between gap-3 px-4 py-3 hover:bg-chestnut/[0.04]", cancelled && "opacity-60")}
      >
        {/* the type, then the ID and when */}
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-baseline gap-2 text-[0.9375rem] font-semibold">
            {tt(row.type)}
            {cancelled && <span className="rounded-control bg-chestnut/60 px-2 py-1 text-[0.75rem] font-semibold leading-none text-ivory">{t("cancelled")}</span>}
            {/* a sale with goods back on it: Returned (all of it) or Part returned, as the Edited badge but on red */}
            {!cancelled && row.returned && (
              <span className="rounded-control bg-danger px-2 py-1 text-[0.75rem] font-semibold leading-none text-ivory">
                {t(row.returned === "all" ? "returned" : "partReturned")}
              </span>
            )}
            {/* edited since it was saved: a small badge */}
            {!cancelled && row.lastEditedAt && (
              <span className="rounded-control bg-chestnut px-2 py-1 text-[0.75rem] font-semibold leading-none text-ivory">{t("edited")}</span>
            )}
          </span>
          <span className="tabular flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-chestnut/60">
            <span className="flex items-center gap-1">
              <Hash className="size-3.5" aria-hidden />
              {row.assignedId}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />
              {when(new Date(row.dateTime), locale)}
            </span>
          </span>
        </span>
        {/* the amount and the arrow */}
        <span className="flex shrink-0 items-center gap-2">
          <span className={cn("tabular font-heading text-lg font-bold leading-none", cancelled && "line-through")}>{rupees(row.amount)}</span>
          <ChevronRight className="size-5 text-chestnut/50" aria-hidden />
        </span>
      </Link>
    </li>
  );
}
