"use client";

import { ArrowDown, ArrowUp, ChevronDown, CircleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { type Balance, type Head, indiaDay, postDatedText, startOfIndiaDay, usualSide } from "./balance";
import { useLedgerName } from "./ledger-name";
import { SignedAmount } from "./signed-amount";

type Line = RouterOutputs["accounts"]["ledger"]["statement"]["lines"][number];


// the last 12 months in India, newest first, as "2026-11"
function lastMonths() {
  const [y, m] = indiaDay(new Date()).split("-").map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, i) => {
    const at = y * 12 + (m - 1) - i;
    return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`;
  });
}

// the month after one: "2026-12" → "2027-01"
const monthAfter = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

// a month's heading: a solid tint (so rows scrolling under it don't show through), stuck to the top of the entries
const monthBar = "sticky top-0 z-10 bg-[color-mix(in_srgb,var(--color-ivory)_90%,var(--color-chestnut))] px-4 py-1.5 text-xs font-semibold";

// the columns of one side from 768px: day, particulars, amount; and of a phone line: day, particulars, debit, credit
const sideCols = "grid grid-cols-[2.5rem_minmax(0,1fr)_7rem] items-center gap-3 px-4";
// a debit entry on a phone, where the two sides share one list; a credit entry stays plain
const debitShade = "bg-chestnut/[0.045]";
// a phone line, like a paper ledger: day, particulars, then the amount under Debit or under Credit
const phoneCols = "grid grid-cols-[1.5rem_minmax(0,1fr)_5.25rem_5.25rem] items-center gap-x-2 px-4";

// an amount in a phone column: the figure alone (the column says what it is), so a crore still fits
const figure = (amount: number) => amount.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 });

const chip = (on: boolean) =>
  cn("min-h-9 shrink-0 rounded-control border px-3 text-sm transition-colors", on ? "border-chestnut bg-chestnut font-medium text-ivory" : "border-chestnut/50 hover:border-chestnut");

// one row on a side of the ledger: the day, what it was, the amount (b/f and c/d carry no number and open nothing)
type Row = { key: string; at: Date | null; what: string; number: string | null; amount: number; opens: boolean; contras?: Line["contras"] };

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
// end in "…" with the full text on hover. Filters (a search over number and remarks, an amount range, a
// custom date range) show only the matching entries, each side with the total of what's shown instead of b/f and
// c/d. Tapping an entry will open its transaction in History (coming with it)
export function LedgerStatement({
  ledgerId,
  name,
  head,
  balance,
  menu,
}: {
  ledgerId: string;
  name: string;
  // the head it sits under, which signs its balance
  head: Head;
  balance: { today: Balance; postDated: Balance | null };
  // the ledger's own ⋯ menu, beside its balance
  menu?: React.ReactNode;
}) {
  const t = useTranslations("accounts.ledger");
  const nameOf = useLedgerName();
  const tt = useTranslations("accounts.types");
  const format = useFormatter();
  // a month picked from the dropdown, or every entry (null)
  const [month, setMonth] = useState<string | null>(null);

  const statement = trpc.accounts.ledger.statement.useQuery(
    {
      ledgerId,
      from: month ? startOfIndiaDay(`${month}-01`) : null,
      // up to the last moment of that month
      to: month ? new Date(startOfIndiaDay(`${monthAfter(month)}-01`).getTime() - 1) : null,
      types: [],
      minAmount: null,
      maxAmount: null,
      search: "",
    },
    { placeholderData: (previous) => previous },
  );
  const narrowed = statement.data?.narrowed ?? null;

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
      contras: l.contras,
    };
  });

  // the two sides: brought forward on its own side, each entry on its side, and the closing balance carried
  // down on the other side so both sides total the same
  const sides = (() => {
    if (!statement.data) return null;
    const { broughtForward: bf, closing } = statement.data;
    const debit: Row[] = [];
    const credit: Row[] = [];
    if (!narrowed && bf.amount !== 0) (bf.side === "debit" ? debit : credit).push({ key: "bf", at: null, what: t("balanceBf"), number: null, amount: bf.amount, opens: false });
    for (const r of rows) (r.side === "debit" ? debit : credit).push(r);
    if (!narrowed && closing.amount !== 0) (closing.side === "debit" ? credit : debit).push({ key: "cd", at: null, what: t("balanceCd"), number: null, amount: closing.amount, opens: false });
    const total = Math.max(...[debit, credit].map((side) => side.reduce((sum, r) => sum + r.amount, 0)));
    // the foot of each side: the balancing total, or (narrowed) what that side shows
    return { debit, credit, foot: narrowed ? { debit: narrowed.debit, credit: narrowed.credit } : { debit: total, credit: total } };
  })();

  // Debit or Credit with an arrow: up on the side that raises this ledger (debit for an asset, expense or loss; credit
  // for the rest), down on the side that lowers it
  const sideLabel = (side: "debit" | "credit") => {
    const up = side === usualSide(head);
    const Arrow = up ? ArrowUp : ArrowDown;
    return (
      <span className="inline-flex items-center gap-1">
        {t(side)}
        {/* thick, green going up and red going down */}
        <Arrow strokeWidth={3.25} className={cn("size-[1.1em] shrink-0", up ? "text-success" : "text-danger")} aria-hidden />
      </span>
    );
  };

  // the other side of an entry: each ledger (a party by its short name, then its full name), and how much when there's
  // more than one (one is the entry's own amount)
  const contraLines = (contras: Line["contras"] = []) =>
    contras.map((c) => (
      <span key={c.name} className="tabular flex min-w-0 justify-between gap-2 text-sm">
        {c.partyName && titleCase(c.partyName) !== nameOf(c) ? (
          <span className="flex min-w-0 gap-1.5">
            <span className="shrink-0 font-semibold">{nameOf(c)}</span>
            <span className="truncate" title={titleCase(c.partyName)}>
              {titleCase(c.partyName)}
            </span>
          </span>
        ) : (
          <span className="truncate">{nameOf(c)}</span>
        )}
        {contras.length > 1 && <span className="shrink-0">{rupees(c.amount)}</span>}
      </span>
    ));

  // what an entry says: its number on top, then the other side of it; or b/f and c/d in italics
  const particulars = (r: Pick<Row, "what" | "number" | "opens" | "contras">) =>
    r.opens ? (
      <span className="flex min-w-0 flex-col gap-0.5" title={`${r.what} · ${r.number}`}>
        <span className="tabular truncate text-xs font-medium text-chestnut/70">{r.number}</span>
        {contraLines(r.contras)}
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
          <div className="flex min-w-0 items-center gap-5 sm:p-3">
            {/* every ledger's name starts each word with a capital (a short name in capitals stays as it is) */}
            <h2 className="min-w-0 truncate font-heading text-xl font-bold md:text-2xl" title={t("titleOf", { name: titleCase(name) })}>
              {t("titleOf", { name: titleCase(name) })}
            </h2>
            <SignedAmount balance={balance.today} head={head} badge className="shrink-0 font-heading text-base font-bold md:px-3 md:py-1 md:text-xl" />
            {menu && <div className="ml-auto shrink-0 md:ml-0">{menu}</div>}
          </div>
          {balance.postDated && (
            <p className="tabular mt-1 text-sm text-chestnut/70">{t("postDated", { amount: postDatedText(balance.postDated, head) })}</p>
          )}
        </div>
        {/* every entry, or one month from the dropdown: on a phone two equal halves across the card under the name; from
            768px on the right. The month list opens from the button's right edge, so it stays inside the card */}
        <div className="grid grid-cols-2 gap-1.5 md:ml-auto md:flex">
          <button type="button" aria-pressed={month === null} onClick={() => setMonth(null)} className={cn(chip(month === null))}>
            {t("ranges.all")}
          </button>
          <div className="min-w-0">
          <Menu
            label={t("ranges.pick")}
            align="right"
            boxed
            // rounded with a full edge and the same height as All, filled once a month is picked
            triggerClassName={cn(chip(month !== null), "flex w-full items-center gap-1.5 md:w-auto")}
            trigger={
              <>
                <span className="truncate">{month ? monthName(month) : t("ranges.pick")}</span>
                <ChevronDown className="size-4 shrink-0" aria-hidden />
              </>
            }
          >
            {(close) =>
              lastMonths().map((m) => (
                <MenuItem
                  key={m}
                  selected={month === m}
                  onClick={() => {
                    setMonth(m);
                    close();
                  }}
                >
                  {monthName(m)}
                </MenuItem>
              ))
            }
          </Menu>
          </div>
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
              <span className="flex justify-end">{sideLabel("debit")}</span>
              <span className="flex justify-end">{sideLabel("credit")}</span>
            </div>
            <ol className="min-h-0 flex-1 divide-y divide-chestnut/10 overflow-y-auto">
              {!narrowed && statement.data.broughtForward.amount !== 0 && (
                <li className={cn(phoneCols, "py-2.5", statement.data.broughtForward.side === "debit" && debitShade)}>
                  <span />
                  <span className="truncate pr-0.5 text-sm italic text-chestnut/70">{t("balanceBf")}</span>
                  <span className={cn("tabular text-right text-sm text-chestnut/70", statement.data.broughtForward.side === "credit" && "col-start-4")}>{figure(statement.data.broughtForward.amount)}</span>
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
                          className={cn(phoneCols, "w-full items-end py-2.5 text-left", !item.opens && "cursor-default", item.side === "debit" && debitShade)}
                        >
                          <span className="tabular self-start text-center font-heading text-lg font-bold">{indiaParts(item.at).day}</span>
                          {/* its number, then the other side of it; the amount on the last line, under Debit or Credit. A debit
                              entry is shaded */}
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className={cn("tabular min-w-0 truncate", item.opens ? "text-xs font-medium text-chestnut/70" : "pr-0.5 text-sm italic text-chestnut/70")} title={item.what}>
                              {item.number ?? item.what}
                            </span>
                            {item.contras?.length ? contraLines(item.contras) : null}
                          </span>
                          <span className={cn("tabular text-right text-sm", item.opens && "font-semibold", item.side === "credit" && "col-start-4")}>{figure(item.amount)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
              {rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-chestnut/70">{t("empty")}</li>}
            </ol>
            {narrowed ? (
              <p className={cn(phoneCols, "shrink-0 border-t-2 border-chestnut/30 py-3 font-medium")}>
                <span className="col-span-2 text-sm">{t("shownTotal")}</span>
                <span className="tabular text-right text-sm font-bold">{rupees(narrowed.debit)} Dr</span>
                <span className="tabular text-right text-sm font-bold">{rupees(narrowed.credit)} Cr</span>
              </p>
            ) : (
              <p className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-chestnut/30 bg-chestnut/10 px-4 py-3 font-semibold">
                <span>{t("closing")}</span>
                <SignedAmount balance={statement.data.closing} head={head} className="font-heading text-base font-bold" />
              </p>
            )}
          </div>

          {/* from 768px: Debit on the left, Credit on the right; the headings and totals stay put, the two
              sides scroll together between them */}
          <div className="hidden min-h-0 flex-1 flex-col md:flex">
            <div className="grid shrink-0 grid-cols-2 divide-x divide-chestnut/15 border-b border-chestnut/15 overflow-y-hidden [scrollbar-gutter:stable]">
              {(["debit", "credit"] as const).map((side) => (
                <div key={side}>
                  <h3 className="border-b border-chestnut/10 px-4 py-4 text-left font-heading text-base font-bold">{sideLabel(side)}</h3>
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
                            {/* the balance carried down stands out: a tint, in bold */}
                            <button type="button" onClick={r.opens ? open : undefined} className={cn(sideCols, "w-full py-2.5 text-left", r.opens ? "hover:bg-chestnut/5" : "cursor-default", r.key === "cd" && "bg-chestnut/10 font-semibold [&_*]:not-italic [&_*]:text-chestnut")}>
                              <span className="tabular self-start text-center font-heading text-base font-bold">{r.at ? indiaParts(r.at).day : ""}</span>
                              {particulars(r)}
                              {/* the amount sits level with the last account, set apart from their amounts by a line */}
                              <span className={cn("tabular whitespace-nowrap text-right text-sm", r.opens ? "flex items-end justify-end self-stretch border-l border-chestnut/15 pl-3" : "text-chestnut/70")}>{rupees(r.amount)}</span>
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
                  <span>{narrowed ? t("shownTotal") : t("total")}</span>
                  <span>{rupees(sides.foot[side])}</span>
                </p>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
