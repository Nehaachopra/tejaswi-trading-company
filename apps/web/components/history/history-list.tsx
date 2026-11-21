"use client";

import { CircleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/icons/spinner";
import { cn } from "~/lib/utils";
import { useHistory } from "~/providers/history";

import { AMOUNT_RANGES, type HistoryFilterValues, HistoryFilters, type MonthKey, monthName } from "./history-filters";
import { HistoryRow, type HistoryRowData } from "./history-row";

// India is 5½ hours ahead of UTC
const IST_MS = 5.5 * 60 * 60 * 1000;

// a month's first and last moment in India
const monthSpan = (key: MonthKey) => {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return { from: new Date(Date.UTC(y, m - 1, 1) - IST_MS), to: new Date(Date.UTC(y, m, 1) - IST_MS - 1) };
};

// the month (in India) a moment falls in, as "YYYY-MM"
const monthOf = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(at).slice(0, 7);

// the rows in their months, newest first as they came
const byMonth = (rows: HistoryRowData[]) => {
  const groups: { month: MonthKey; rows: HistoryRowData[] }[] = [];
  for (const row of rows) {
    const month = monthOf(new Date(row.dateTime));
    const last = groups.at(-1);
    if (last?.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }
  return groups;
};

// /history: the filters stuck under the header, then each month's heading (stuck under the filters while its rows
// scroll) over one ivory card of its transactions; no wider than 2xl. More load on their own near the end
export function HistoryList() {
  const t = useTranslations("history");
  const locale = useLocale();
  const [filters, setFilters] = useState<HistoryFilterValues>({ type: null, month: null, amount: null, search: "" });
  // the search asked for once typing pauses
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(filters.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // the filters as the server takes them
  const range = filters.amount ? AMOUNT_RANGES[filters.amount] : null;
  const span = filters.month ? monthSpan(filters.month) : null;
  const list = useHistory({
    types: filters.type ? [filters.type] : [],
    from: span?.from ?? null,
    to: span?.to ?? null,
    minAmount: range?.min ?? null,
    maxAmount: range?.max ?? null,
    search,
  });
  // the next page once the end of the list comes near
  const end = useRef<HTMLDivElement>(null);
  const { rows, hasMore, loadingMore, loadMore } = list;
  useEffect(() => {
    const el = end.current;
    if (!el || !hasMore) return;
    const seen = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !loadingMore) void loadMore();
    }, { rootMargin: "400px" });
    seen.observe(el);
    return () => seen.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  return (
    <main className={`${PAGE} pb-16`}>
      <h1 className="sr-only">{t("title")}</h1>

      <HistoryFilters value={filters} onChange={setFilters} />

      {list.loading ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : list.loadFailed ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{t("empty")}</p>
      ) : (
        <div className={cn("flex max-w-2xl flex-col", list.stale && "opacity-60")}>
          {byMonth(rows).map((g) => (
            <section key={g.month} aria-label={monthName(g.month, locale)}>
              {/* the month, stuck under the filters (the header's 4rem and the filters' 3.25rem) */}
              <h2 className="sticky top-[7.25rem] z-10 bg-chestnut pb-2 pt-3 font-heading text-lg font-bold">
                {monthName(g.month, locale)}
              </h2>
              <ul className="overflow-hidden rounded-control bg-ivory text-chestnut">
                {g.rows.map((row) => (
                  <HistoryRow key={row.id} row={row} />
                ))}
              </ul>
            </section>
          ))}
          {/* where the next page starts loading */}
          <div ref={end} />
          {loadingMore && (
            <p className="mt-4 flex items-center justify-center gap-2 text-ivory/70">
              <Spinner /> {t("loading")}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
