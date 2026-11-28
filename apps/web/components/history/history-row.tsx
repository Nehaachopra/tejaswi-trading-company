"use client";

import { CalendarDays, ChevronRight, Clock, Hash, Wallet } from "lucide-react";
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
// whole row opens it. Cancelled: faded, the amount struck through; a sale or purchase with goods back (any part of
// it): Returned, or Pending return while replaced packs are still to come; edited: a small Edited badge beside the type
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
            {/* a salary or advance reads as the payment it is */}
            {tt(row.type === "salary" ? "payment" : row.type)}
            {/* a salary paid: a Salary tag beside Payment, on green */}
            {row.salaryPaid && (
              <span className="rounded-control bg-success px-2 py-1 text-[0.75rem] font-semibold leading-none text-ivory">{tt("salary")}</span>
            )}
            {cancelled && <span className="rounded-control bg-chestnut/60 px-2 py-1 text-[0.75rem] font-semibold leading-none text-ivory">{t("cancelled")}</span>}
            {/* goods back on it, as the Edited badge: Returned on green; Pending return (replacements still to come) on
                red, the only red badge */}
            {!cancelled && row.returned && (
              <span className={cn("rounded-control px-2 py-1 text-[0.75rem] font-semibold leading-none text-ivory", row.returned === "pending" ? "bg-danger" : "bg-success")}>
                {t(row.returned === "pending" ? "pendingReturn" : "returned")}
              </span>
            )}
            {/* edited since it was saved: a small badge */}
            {!cancelled && row.lastEditedAt && (
              <span className="rounded-control bg-chestnut px-2 py-1 text-[0.75rem] font-semibold leading-none text-ivory">{t("edited")}</span>
            )}
          </span>
          <span className="tabular flex flex-col flex-wrap gap-x-3.5 gap-y-1 text-xs text-chestnut/60 sm:flex-row">
            <span className="flex items-center gap-1">
              <Hash className="size-3.5" aria-hidden />
              {row.assignedId}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />
              {when(new Date(row.dateTime), locale)}
            </span>
            {/* a sale or purchase: Cash or Credit, beside when */}
            {row.transactedIn && (
              <span className="flex items-center gap-1">
                {row.transactedIn === "credit" ? <Clock className="size-3.5" aria-hidden /> : <Wallet className="size-3.5" aria-hidden />}
                {t(row.transactedIn === "credit" ? "paidCredit" : "paidCash")}
              </span>
            )}
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
