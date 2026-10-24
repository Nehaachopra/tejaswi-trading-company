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

import { type Balance, type Head, indiaDay, postDatedText, startOfIndiaDay } from "./balance";
import { SignedAmount } from "./signed-amount";

type Line = RouterOutputs["accounts"]["ledger"]["statement"]["lines"][number];
type Range = "month" | "year" | "all";

// where each quick range starts, in India: the 1st of this month, or 1 April of this financial year
function rangeStart(range: Range) {
  if (range === "all") return null;
  const [y, m] = indiaDay(new Date()).split("-").map(Number) as [number, number];
  if (range === "month") return startOfIndiaDay(`${y}-${String(m).padStart(2, "0")}-01`);
  return startOfIndiaDay(`${m >= 4 ? y : y - 1}-04-01`);
}

// a month's heading: a solid tint (so rows scrolling under it don't show through), stuck to the top of the entries
const monthBar = "sticky top-0 z-10 bg-[color-mix(in_srgb,var(--color-ivory)_90%,var(--color-chestnut))] px-4 py-1.5 text-xs font-semibold";

// the columns of one side from 768px: day, particulars, amount; and of a phone line: day, particulars, debit, credit
const sideCols = "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4";
const phoneCols = "grid grid-cols-[1.75rem_4.75rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 px-4";

const chip = (on: boolean) =>
  cn("min-h-9 shrink-0 rounded-control border px-4 text-sm transition-colors", on ? "border-chestnut bg-chestnut font-medium text-ivory" : "border-chestnut/50 hover:border-chestnut");

// one row on a side of the ledger: the day, what it was, the amount (b/f and c/d carry no number and open nothing)
type Row = { key: string; at: Date | null; what: string; number: string | null; amount: number; opens: boolean };

// the day of the month and the month an entry falls in, in India
const indiaParts = (d: Date | string) => {
  const [y, m, dd] = indiaDay(d).split("-") as [string, string, string];
  return { month: `${y}-${m}`, day: Number(dd) };
};

// rows in runs by month (b/f and c/d, which have no day, in runs of their own without a heading), so each
// month's heading sticks only while its own month scrolls by and the next one pushes it away
function byMonth<T extends { at: Date | null }>(rows: T[]) {
  const runs: { month: string | null; key: string; rows: T[] }[] = [];
  for (const [i, r] of rows.entries()) {
    const month = r.at ? indiaParts(r.at).month : null;
    const last = runs[runs.length - 1];
    if (last && last.month === month && month !== null) last.rows.push(r);
    else runs.push({ month, key: month ?? `plain-${i}`, rows: [r] });
  }
  return runs;
}

// a ledger's statement, sized to the screen: its name and today's balance on top with the quick ranges, the
// column headings, then only the entries scroll, with the totals always in view at the foot. From 768px a
// two-sided ledger, Debit on the left and Credit on the right, both closing on the same total (the opening
// balance and the balance brought into a range read Balance b/f, the closing balance is carried down as
// Balance c/d); on phones a line per entry with its Debit or Credit amount in its own column. Long particulars
// end in "…" with the full text on hover. Tapping an entry will open its transaction in History (coming with it)
export function LedgerStatement({
  ledgerId,
  name,
  head,
  balance,
}: {
  ledgerId: string;
  name: string;
  // the head it sits under, which signs its balance
  head: Head;
  balance: { today: Balance; postDated: Balance | null };
}) {
  const t = useTranslations("accounts.ledger");
  const tt = useTranslations("accounts.types");
  const format = useFormatter();
  const [range, setRange] = useState<Range>("year");
  const statement = trpc.accounts.ledger.statement.useQuery({ ledgerId, from: rangeStart(range), to: null });

  // "October 2026" over each month's entries, which show only their day
  const monthName = (month: string) => format.dateTime(new Date(`${month}-15T12:00:00+05:30`), { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const what = (l: Line) => `${tt(l.type as Parameters<typeof tt>[0])}${l.isReversal ? ` (${t("reversal")})` : ""}`;
  const open = () => toast.info(t("comingSoon"));

  // every entry as a row; an opening balance reads as Balance b/f
  const rows = (statement.data?.lines ?? []).map((l) => {
    const opening = l.type === "opening_balance";
    return {
      key: l.id,
      at: new Date(l.dateTime),
      side: l.side,
      what: opening ? t("balanceBf") : what(l),
      number: opening ? null : l.assignedId,
      amount: l.amount,
      opens: !opening,
    };
  });

  // the two sides: brought forward on its own side, each entry on its side, and the closing balance carried
  // down on the other side so both sides total the same
  const sides = (() => {
    if (!statement.data) return null;
    const { broughtForward: bf, closing } = statement.data;
    const debit: Row[] = [];
    const credit: Row[] = [];
    if (bf.amount !== 0) (bf.side === "debit" ? debit : credit).push({ key: "bf", at: null, what: t("balanceBf"), number: null, amount: bf.amount, opens: false });
    for (const r of rows) (r.side === "debit" ? debit : credit).push(r);
    if (closing.amount !== 0) (closing.side === "debit" ? credit : debit).push({ key: "cd", at: null, what: t("balanceCd"), number: null, amount: closing.amount, opens: false });
    const total = Math.max(...[debit, credit].map((side) => side.reduce((sum, r) => sum + r.amount, 0)));
    return { debit, credit, total };
  })();

  // what an entry says: its type and number, or b/f and c/d in italics
  const particulars = (r: { what: string; number: string | null; opens: boolean }) =>
    r.opens ? (
      <span className="min-w-0" title={`${r.what} · ${r.number}`}>
        <span className="block truncate text-sm font-medium">{r.what}</span>
        <span className="tabular block truncate text-xs text-chestnut/70">{r.number}</span>
      </span>
    ) : (
      <span className="truncate pr-0.5 text-sm italic text-chestnut/70" title={r.what}>
        {r.what}
      </span>
    );

  return (
    // as tall as the screen allows below the header and the back link (and above the phone's bottom bar)
    <section className="on-ivory flex max-h-[calc(100dvh-14rem)] min-h-80 flex-col overflow-hidden rounded-control bg-ivory text-chestnut lg:max-h-[calc(100dvh-10.75rem)]">
      {/* "Cash ledger" with today's balance beside it, then the quick ranges */}
      <header className="flex shrink-0 flex-col gap-3 border-b border-chestnut/15 p-4 md:flex-row md:items-center md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="min-w-0 truncate font-heading text-xl font-bold md:text-2xl" title={t("titleOf", { name })}>
              {t("titleOf", { name })}
            </h2>
            <SignedAmount balance={balance.today} head={head} badge className="shrink-0 font-heading text-base font-bold md:px-3 md:py-1 md:text-xl" />
          </div>
          {balance.postDated && (
            <p className="tabular mt-1 text-sm text-chestnut/70">{t("postDated", { amount: postDatedText(balance.postDated, head) })}</p>
          )}
        </div>
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
      ) : statement.isError || !sides ? (
        <p role="alert" className="flex items-center justify-center gap-2 py-12 text-sm">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : (
        <>
          {/* phones: the column headings, the entries (the only part that scrolls), the closing balance */}
          <div className="flex min-h-0 flex-1 flex-col md:hidden">
            <div className={cn(phoneCols, "shrink-0 border-b border-chestnut/15 py-2 text-xs text-chestnut/70")}>
              <span className="text-center">{t("day")}</span>
              <span>{t("particulars")}</span>
              <span className="text-right">{t("debit")}</span>
              <span className="text-right">{t("credit")}</span>
            </div>
            <ol className="min-h-0 flex-1 divide-y divide-chestnut/10 overflow-y-auto">
              {statement.data.broughtForward.amount !== 0 && (
                <li className={cn(phoneCols, "py-2.5")}>
                  <span />
                  <span className="whitespace-nowrap pr-0.5 text-sm italic text-chestnut/70">{t("balanceBf")}</span>
                  <span className="tabular text-right text-sm text-chestnut/70">{statement.data.broughtForward.side === "debit" ? rupees(statement.data.broughtForward.amount) : ""}</span>
                  <span className="tabular text-right text-sm text-chestnut/70">{statement.data.broughtForward.side === "credit" ? rupees(statement.data.broughtForward.amount) : ""}</span>
                </li>
              )}
              {byMonth(rows).map((run) => (
                <li key={run.key}>
                  {run.month && <p className={monthBar}>{monthName(run.month)}</p>}
                  <ol className="divide-y divide-chestnut/10">
                    {run.rows.map((item) => (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={item.opens ? open : undefined}
                          className={cn(phoneCols, "w-full gap-y-0.5 py-2.5 text-left", item.opens ? "hover:bg-chestnut/5" : "cursor-default")}
                        >
                          <span className="tabular row-span-2 text-center font-heading text-lg font-bold">{indiaParts(item.at).day}</span>
                          {/* first line: what it was; second: its number, and the amount under Debit or Credit */}
                          <span className={cn("col-span-3 min-w-0 truncate text-sm", item.opens ? "font-medium" : "pr-0.5 italic text-chestnut/70")} title={item.what}>
                            {item.what}
                          </span>
                          <span className="tabular text-xs text-chestnut/70">{item.number}</span>
                          <span className={cn("tabular text-right text-sm", item.opens && "font-medium")}>{item.side === "debit" ? rupees(item.amount) : ""}</span>
                          <span className={cn("tabular text-right text-sm", item.opens && "font-medium")}>{item.side === "credit" ? rupees(item.amount) : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
              {rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-chestnut/70">{t("empty")}</li>}
            </ol>
            <p className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-chestnut/30 px-4 py-3 font-medium">
              <span>{t("closing")}</span>
              <SignedAmount balance={statement.data.closing} head={head} className="font-heading text-base font-bold" />
            </p>
          </div>

          {/* from 768px: Debit on the left, Credit on the right; the headings and totals stay put, the two
              sides scroll together between them */}
          <div className="hidden min-h-0 flex-1 flex-col md:flex">
            <div className="grid shrink-0 grid-cols-2 divide-x divide-chestnut/15 border-b border-chestnut/15 overflow-y-hidden [scrollbar-gutter:stable]">
              {(["debit", "credit"] as const).map((side) => (
                <div key={side}>
                  <h3 className="border-b border-chestnut/10 px-4 py-2.5 text-center font-heading text-base font-bold">{t(side)}</h3>
                  <div className={cn(sideCols, "py-2 text-xs text-chestnut/70")}>
                    <span className="text-center">{t("day")}</span>
                    <span>{t("particulars")}</span>
                    <span className="text-right">{t("amount")}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-2 items-start divide-x divide-chestnut/15 overflow-y-auto [scrollbar-gutter:stable]">
              {(["debit", "credit"] as const).map((side) => (
                <ol key={side} className="min-h-full divide-y divide-chestnut/10">
                  {byMonth(sides[side]).map((run) => (
                    <li key={run.key}>
                      {run.month && <p className={monthBar}>{monthName(run.month)}</p>}
                      <ol className="divide-y divide-chestnut/10">
                        {run.rows.map((r) => (
                          <li key={r.key}>
                            <button type="button" onClick={r.opens ? open : undefined} className={cn(sideCols, "w-full py-2.5 text-left", r.opens ? "hover:bg-chestnut/5" : "cursor-default")}>
                              <span className="tabular text-center font-heading text-base font-bold">{r.at ? indiaParts(r.at).day : ""}</span>
                              {particulars(r)}
                              <span className={cn("tabular whitespace-nowrap text-right text-sm", !r.opens && "text-chestnut/70")}>{rupees(r.amount)}</span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </li>
                  ))}
                  {sides[side].length === 0 && <li className="px-4 py-6 text-center text-chestnut/50">—</li>}
                </ol>
              ))}
            </div>

            {/* the totals, at the foot of both sides */}
            <div className="grid shrink-0 grid-cols-2 divide-x divide-chestnut/15 border-t-2 border-chestnut/30 overflow-y-hidden [scrollbar-gutter:stable]">
              {(["debit", "credit"] as const).map((side) => (
                <p key={side} className="tabular flex justify-between px-4 py-2.5 font-heading text-base font-bold">
                  <span>{t("total")}</span>
                  <span>{rupees(sides.total)}</span>
                </p>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
