"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { initials, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

// pieces /dues and a party's dues page share: the days, the shares, the short-name badge, and the due-and-overdue card
// with its money potli

// days from today (India) to a day: 0 today, negative once it's past
const todayNoon = () => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}T12:00:00+05:30`).getTime();
export const daysUntil = (day: string) => Math.round((new Date(`${day}T12:00:00+05:30`).getTime() - todayNoon()) / 86_400_000);

// due within this many days: a payment coming up
export const NEAR_DAYS = 2;

// a day as it reads on a due: "1 Sep 2026"
export const dayText = (day: string | Date) =>
  (typeof day === "string" ? new Date(`${day}T12:00:00+05:30`) : day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// a share of a whole, as a whole percent (never 0% for something there, never 100% for less than all)
export const percentOf = (part: number, whole: number) => {
  if (whole <= 0 || part <= 0) return 0;
  const p = Math.round((part / whole) * 100);
  return part < whole ? Math.min(Math.max(p, 1), 99) : 100;
};

// a party's short name (or its full name's initials), one width everywhere so names line up: red when something is
// overdue, else ivory with a chestnut edge
export function ShortNameBadge({ shortName, name, late, title, size = "md" }: { shortName: string | null; name: string; late: boolean; title?: string; size?: "md" | "lg" }) {
  const text = shortName ?? initials(titleCase(name));
  return (
    <span
      title={title}
      className={cn(
        "grid shrink-0 place-items-center rounded-control border-2 px-1 font-heading font-bold leading-none",
        size === "lg" ? "h-16 w-20" : "h-12 w-14",
        text.length > 4 ? "text-xs" : text.length > 3 ? "text-base" : size === "lg" ? "text-2xl" : "text-lg",
        late ? "border-danger bg-danger text-ivory" : "border-chestnut bg-ivory text-chestnut",
      )}
    >
      <span className="max-w-full truncate">{text}</span>
    </span>
  );
}

// what's due on the left and what's overdue on the right, with a money potli between them filled red as high as the
// overdue share, and an optional line under the potli (a party's average time to settle). With onOverdue, the potli
// and the overdue number are a button (on /dues: show only those overdue)
export function DueOverdueCard({
  total,
  overdue,
  totalNote,
  overdueNote,
  onOverdue,
  pressed = false,
  centerNote,
}: {
  total: number;
  overdue: number;
  totalNote: string;
  overdueNote: string;
  onOverdue?: () => void;
  pressed?: boolean;
  centerNote?: string;
}) {
  const t = useTranslations("dues.insights");
  const pct = percentOf(overdue, total);
  // the two numbers share one shape: a small label, the amount, a line under it
  const label = "text-[0.68rem] font-semibold uppercase tracking-[0.08em]";
  const amount = "tabular whitespace-nowrap font-heading text-[1.45rem] font-bold leading-none sm:text-[1.9rem]";
  const under = "text-[0.75rem] opacity-70 sm:text-[0.8rem]";
  const active = !!onOverdue && overdue > 0;
  const potli = (
    <span className="flex flex-col items-center gap-1">
      <MoneyPotli share={total > 0 ? overdue / total : 0} />
      {/* a chestnut pill with a clock, so it reads apart from the two numbers */}
      {centerNote && (
        <span className="tabular inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-chestnut px-2.5 py-1 text-[0.7rem] font-semibold text-ivory sm:text-xs">
          <Clock className="size-3" aria-hidden /> {centerNote}
        </span>
      )}
    </span>
  );
  const right = (
    <>
      <span className={cn(label, "text-danger")}>{t("overdue")}</span>
      <span className={cn(amount, overdue > 0 ? "text-danger" : "opacity-40")}>{rupees(overdue)}</span>
      <span className={under}>{overdue > 0 ? overdueNote : t("allOnTime")}</span>
    </>
  );

  return (
    <section aria-label={t("total")} className="on-ivory grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-ivory p-4 text-chestnut sm:gap-6 sm:px-8">
      <div className="flex min-w-0 flex-col items-start gap-1">
        <span className={cn(label, "opacity-60")}>{t("total")}</span>
        <span className={amount}>{rupees(total)}</span>
        <span className={under}>{totalNote}</span>
      </div>

      {active ? (
        <button
          type="button"
          onClick={onOverdue}
          aria-pressed={pressed}
          aria-label={t("ofDues", { pct })}
          className={cn("rounded-2xl transition-transform hover:scale-[1.03]", pressed && "ring-2 ring-danger ring-offset-2 ring-offset-ivory")}
        >
          {potli}
        </button>
      ) : (
        <span role="img" aria-label={t("ofDues", { pct })}>
          {potli}
        </span>
      )}

      {active ? (
        <button
          type="button"
          onClick={onOverdue}
          aria-pressed={pressed}
          className={cn("-m-1.5 flex min-w-0 flex-col items-end gap-1 rounded-xl p-1.5 text-right transition-colors hover:bg-danger/[0.06]", pressed && "bg-danger/[0.08]")}
        >
          {right}
        </button>
      ) : (
        <div className="flex min-w-0 flex-col items-end gap-1 text-right">{right}</div>
      )}
    </section>
  );
}

// the bag's outline, shared by its fill, its clip and its edge
const POTLI = "M44 34 C 20 48 14 76 22 96 C 30 114 90 114 98 96 C 106 76 100 48 76 34 Z";

// a tied cloth money bag with a gold cord and a ₹ medallion: light chestnut inside, and red risen from the bottom (with
// a soft wave on top) as high as the overdue share
function MoneyPotli({ share }: { share: number }) {
  const id = useId().replace(/:/g, "");
  // the bag runs from y 34 (its mouth) to about y 110 (its base); the red reaches that share of it
  const top = 110 - 76 * Math.min(1, Math.max(0, share));
  return (
    <svg viewBox="0 0 120 120" className="size-[92px] sm:size-[132px]" aria-hidden>
      <defs>
        <clipPath id={`bag-${id}`}>
          <path d={POTLI} />
        </clipPath>
        <clipPath id={`red-${id}`}>
          <path
            d="M0 0 Q 15 -5 30 0 T 60 0 T 90 0 T 120 0 V 130 H 0 Z"
            style={{ transform: `translateY(${top}px)`, transition: "transform 900ms cubic-bezier(.2,.8,.2,1)" }}
          />
        </clipPath>
      </defs>
      <path d={POTLI} fill="#5c2f1d" fillOpacity="0.09" />
      {share > 0 && (
        <g clipPath={`url(#bag-${id})`}>
          <g clipPath={`url(#red-${id})`}>
            <rect width="120" height="120" fill="#b42318" />
          </g>
        </g>
      )}
      <path d={POTLI} fill="none" stroke="#5c2f1d" strokeWidth="3" />
      {/* the neck, tied with a gold cord */}
      <path d="M44 34 C 40 22 50 14 60 20 C 70 14 80 22 76 34" fill="#f6f0e1" stroke="#5c2f1d" strokeWidth="3" strokeLinejoin="round" />
      <path d="M42 33 Q 60 40 78 33" fill="none" stroke="#c9962b" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="68" r="14" fill="#f6f0e1" stroke="#5c2f1d" strokeWidth="2.5" />
      <text x="60" y="74" textAnchor="middle" fontSize="17" fontWeight="800" fill="#5c2f1d">
        ₹
      </text>
    </svg>
  );
}
