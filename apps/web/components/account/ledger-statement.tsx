"use client";

import { CircleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { balanceText, indiaDay, startOfIndiaDay } from "./balance";

type Line = RouterOutputs["accounts"]["ledger"]["statement"]["lines"][number];
type Range = "month" | "year" | "all";

// where each quick range starts, in India: the 1st of this month, or 1 April of this financial year
function rangeStart(range: Range) {
  if (range === "all") return null;
  const [y, m] = indiaDay(new Date()).split("-").map(Number) as [number, number];
  if (range === "month") return startOfIndiaDay(`${y}-${String(m).padStart(2, "0")}-01`);
  return startOfIndiaDay(`${m >= 4 ? y : y - 1}-04-01`);
}

const chip = (on: boolean) =>
  cn("min-h-9 shrink-0 rounded-control border px-4 text-sm transition-colors", on ? "border-chestnut bg-chestnut font-medium text-ivory" : "border-chestnut/50 hover:border-chestnut");

// a ledger's statement under its details: quick ranges on top, then a line per entry in date order with the
// balance after it; on phones one line each, from 1024px a ledger with Debit and Credit columns. Tapping a
// line will open its transaction in History (coming with it)
export function LedgerStatement({ ledgerId }: { ledgerId: string }) {
  const t = useTranslations("accounts.ledger");
  const tt = useTranslations("accounts.types");
  const format = useFormatter();
  const [range, setRange] = useState<Range>("year");
  const statement = trpc.accounts.ledger.statement.useQuery({ ledgerId, from: rangeStart(range), to: null });

  const day = (d: Date | string) => format.dateTime(new Date(d), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const what = (l: Line) => `${tt(l.type as Parameters<typeof tt>[0])}${l.isReversal ? ` (${t("reversal")})` : ""}`;
  const open = () => toast.info(t("comingSoon"));

  return (
    <section className="on-ivory rounded-control bg-ivory text-chestnut">
      {/* the title and the quick ranges */}
      <header className="flex flex-wrap items-center gap-2 border-b border-chestnut/15 p-4">
        <h2 className="mr-auto font-heading text-xl font-bold">{t("title")}</h2>
        <div className="flex gap-1.5 overflow-x-auto">
          {(["month", "year", "all"] as const).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={chip(range === r)}>
              {t(`ranges.${r}`)}
            </button>
          ))}
        </div>
      </header>

      {statement.isPending ? (
        <p className="flex justify-center py-12 text-chestnut/70">
          <Spinner />
        </p>
      ) : statement.isError ? (
        <p role="alert" className="flex items-center justify-center gap-2 py-12 text-sm">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : (
        <>
          {/* phones: brought forward, one line per entry, the closing balance */}
          <ol className="divide-y divide-chestnut/10 lg:hidden">
            <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-chestnut/70">
              <span>{t("broughtForward")}</span>
              <span className="tabular">{balanceText(statement.data.broughtForward)}</span>
            </li>
            {statement.data.lines.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={open} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-chestnut/5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{what(l)}</span>
                    <span className="block truncate text-xs text-chestnut/70">
                      {day(l.dateTime)} · {l.assignedId}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="tabular font-heading text-base font-bold">
                      {rupees(l.amount)} {l.side === "debit" ? t("dr") : t("cr")}
                    </span>
                    <span className="tabular text-xs text-chestnut/70">{balanceText(l.balance)}</span>
                  </span>
                </button>
              </li>
            ))}
            {statement.data.lines.length === 0 && <li className="px-4 py-8 text-center text-sm text-chestnut/70">{t("empty")}</li>}
            <li className="flex items-center justify-between gap-3 px-4 py-3 font-medium">
              <span>{t("closing")}</span>
              <span className="tabular font-heading text-base font-bold">{balanceText(statement.data.closing)}</span>
            </li>
          </ol>

          {/* from 1024px: the ledger with Debit and Credit columns */}
          <table className="hidden w-full text-sm lg:table">
            <thead className="text-left text-chestnut/70">
              <tr className="border-b border-chestnut/15">
                <th className="px-4 py-2.5 font-normal">{t("date")}</th>
                <th className="px-4 py-2.5 font-normal">{t("particulars")}</th>
                <th className="px-4 py-2.5 font-normal">{t("number")}</th>
                <th className="px-4 py-2.5 text-right font-normal">{t("debit")}</th>
                <th className="px-4 py-2.5 text-right font-normal">{t("credit")}</th>
                <th className="px-4 py-2.5 text-right font-normal">{t("balance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-chestnut/10">
              <tr className="text-chestnut/70">
                <td className="px-4 py-2.5" colSpan={5}>
                  {t("broughtForward")}
                </td>
                <td className="tabular px-4 py-2.5 text-right">{balanceText(statement.data.broughtForward)}</td>
              </tr>
              {statement.data.lines.map((l) => (
                <tr key={l.id} onClick={open} className="cursor-pointer hover:bg-chestnut/5">
                  <td className="whitespace-nowrap px-4 py-2.5">{day(l.dateTime)}</td>
                  <td className="px-4 py-2.5 font-medium">
                    {/* a real button, so the line can be reached by keyboard */}
                    <button type="button" onClick={(e) => (e.stopPropagation(), open())} className="text-left">
                      {what(l)}
                    </button>
                  </td>
                  <td className="tabular px-4 py-2.5 text-chestnut/70">{l.assignedId}</td>
                  <td className="tabular px-4 py-2.5 text-right">{l.side === "debit" ? rupees(l.amount) : ""}</td>
                  <td className="tabular px-4 py-2.5 text-right">{l.side === "credit" ? rupees(l.amount) : ""}</td>
                  <td className="tabular px-4 py-2.5 text-right">{balanceText(l.balance)}</td>
                </tr>
              ))}
              {statement.data.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-chestnut/70">
                    {t("empty")}
                  </td>
                </tr>
              )}
              <tr className="font-medium">
                <td className="px-4 py-2.5" colSpan={5}>
                  {t("closing")}
                </td>
                <td className="tabular px-4 py-2.5 text-right font-heading text-base font-bold">{balanceText(statement.data.closing)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
