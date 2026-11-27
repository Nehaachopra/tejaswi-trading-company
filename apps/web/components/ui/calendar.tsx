"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

// a day ("2026-11-14") moved by some days or months, and today's in India; all as "yyyy-mm-dd"
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (day: string, n: number) => dayOf(new Date(asDate(day).getTime() + n * 86_400_000));
const monthOf = (day: string) => day.slice(0, 7);
const plusMonths = (month: string, n: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return dayOf(d).slice(0, 7);
};
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

// A month to pick a day from, in the app's look: the month and year between ‹ and ›, the weekday letters (Sunday first),
// then the days. The day picked is filled chestnut, today is bold, and days outside `min`–`max` are faded and can't be
// picked; the arrows stop at the months those allow. Arrow keys move a day or a week, Page Up and Page Down a month,
// Enter picks. Any form can use it on its own; DateInput opens it under its field
export function Calendar({
  value,
  onPick,
  min,
  max,
  label,
  className,
}: {
  value: string;
  onPick: (day: string) => void;
  min?: string;
  max?: string;
  // what it's for, read out
  label: string;
  className?: string;
}) {
  const locale = useLocale();
  const today = todayInIndia();
  // the day the keyboard is on: the one picked, else today, kept within what can be picked
  const start = value || (max && today > max ? max : min && today < min ? min : today);
  const [focus, setFocus] = useState(start);
  const [month, setMonth] = useState(monthOf(start));
  const grid = useRef<HTMLDivElement>(null);
  // the keyboard moved to a day: the cursor goes with it once it's shown
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, month]);

  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max);
  const canBack = !min || plusMonths(month, -1) >= monthOf(min);
  const canOn = !max || plusMonths(month, 1) <= monthOf(max);

  // the month's name and year, and the weekday letters, in the app's language
  const title = new Intl.DateTimeFormat(`${locale}-IN`, { month: "long", year: "numeric", timeZone: "UTC" }).format(asDate(`${month}-01`));
  // (4 January 2026 was a Sunday)
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(`${locale}-IN`, { weekday: "narrow", timeZone: "UTC" }).format(asDate(plusDays("2026-01-04", i))),
  );
  const first = `${month}-01`;
  const blanks = asDate(first).getUTCDay();
  const length = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const days = Array.from({ length }, (_, i) => plusDays(first, i));

  // the keyboard: a day, a week or a month at a time, never past what can be picked
  function onKey(e: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | null = null;
    if (e.key in step) next = plusDays(focus, step[e.key]!);
    else if (e.key === "PageUp" || e.key === "PageDown") {
      const to = plusMonths(monthOf(focus), e.key === "PageUp" ? -1 : 1);
      const last = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0)).getUTCDate();
      next = `${to}-${String(Math.min(Number(focus.slice(8)), last)).padStart(2, "0")}`;
    } else if (e.key === "Home") next = first;
    else if (e.key === "End") next = days[days.length - 1]!;
    if (!next) return;
    e.preventDefault();
    if (!allowed(next)) return;
    moved.current = true;
    setFocus(next);
    setMonth(monthOf(next));
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("on-ivory flex w-full max-w-80 flex-col gap-2 rounded-control bg-ivory p-3 text-chestnut shadow-[0_0_5px_0] shadow-chestnut/40", className)}
    >
      {/* the month, with the months before and after either side */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={new Intl.DateTimeFormat(`${locale}-IN`, { month: "long", year: "numeric", timeZone: "UTC" }).format(asDate(`${plusMonths(month, -1)}-01`))}
          disabled={!canBack}
          onClick={() => setMonth(plusMonths(month, -1))}
          className="grid size-11 place-items-center rounded-control transition-colors hover:bg-chestnut/[0.06] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <p aria-live="polite" className="text-sm font-semibold">
          {title}
        </p>
        <button
          type="button"
          aria-label={new Intl.DateTimeFormat(`${locale}-IN`, { month: "long", year: "numeric", timeZone: "UTC" }).format(asDate(`${plusMonths(month, 1)}-01`))}
          disabled={!canOn}
          onClick={() => setMonth(plusMonths(month, 1))}
          className="grid size-11 place-items-center rounded-control transition-colors hover:bg-chestnut/[0.06] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      {/* the weekday letters, then the days under them */}
      <div ref={grid} onKeyDown={onKey} className="tabular grid grid-cols-7 gap-1 text-center text-xs">
        {weekdays.map((w, i) => (
          <span key={i} aria-hidden className="py-1 font-semibold text-chestnut/70">
            {w}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} aria-hidden />
        ))}
        {days.map((day) => {
          const on = day === value;
          const can = allowed(day);
          // one day takes the Tab key (the keyboard's day, or the month's first that can be picked); the arrows move on
          const tabDay = monthOf(focus) === month ? focus : days.find(allowed);
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              tabIndex={day === tabDay ? 0 : -1}
              disabled={!can}
              aria-pressed={on}
              aria-label={new Intl.DateTimeFormat(`${locale}-IN`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(asDate(day))}
              aria-current={day === today ? "date" : undefined}
              onClick={() => onPick(day)}
              className={cn(
                "grid min-h-10 place-items-center rounded-control text-sm transition-colors",
                on ? "bg-chestnut font-bold text-ivory" : "hover:bg-chestnut/[0.06]",
                day === today && !on && "font-bold underline underline-offset-4",
                !can && "opacity-30 hover:bg-transparent",
              )}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
