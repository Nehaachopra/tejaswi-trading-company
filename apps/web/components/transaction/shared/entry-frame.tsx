"use client";

import { ArrowLeft, ArrowRight, ChevronDown, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { FieldMessage } from "~/components/ui/field-message";
import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { money, type SummaryLine } from "./form-basics";

// the frame the receipt and payment forms share: the page while it loads or can't, the card on its own with Back,
// its name and Next, and the summary beside it (wide screens) or folded into a bar above it (phones)

// a line of the summary: which card it goes back to, its heading, and what was answered
export type SummaryItem<S extends string> = {
  key: string;
  step: S;
  heading: string;
  value: SummaryLine | SummaryLine[] | null;
};

// the page with only a note in it: still loading, or what couldn't be had with Try again
export function EntryNote({
  title,
  loading,
  failed,
  onRetry,
  children,
}: {
  title: string;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("transactions.payment.form");
  return (
    <main className={`${PAGE} pb-28`}>
      <h1 className="sr-only">{title}</h1>
      {loading ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {children}
        </p>
      ) : (
        <div
          role={failed ? "alert" : undefined}
          className="on-ivory flex flex-col gap-4 rounded-2xl bg-ivory p-5 text-chestnut sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden /> {children}
          </p>
          {failed && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex min-h-11 w-full items-center justify-center rounded-control bg-chestnut px-5 font-semibold text-ivory sm:w-auto"
            >
              {t("tryAgain")}
            </button>
          )}
        </div>
      )}
    </main>
  );
}

// the form's page: the card on the left (the summary bar above it on a phone, once there's something in it) and the
// summary on the right on a wide screen
export function EntryPage({
  title,
  summaryLabel,
  showBar,
  bar,
  summary,
  children,
}: {
  title: string;
  summaryLabel: string;
  showBar: boolean;
  bar: React.ReactNode;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-6xl items-start gap-6 px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
      <h1 className="sr-only">{title}</h1>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {showBar && <div className="lg:hidden">{bar}</div>}
        {children}
      </div>
      <aside aria-label={summaryLabel} className="sticky top-20 hidden w-80 shrink-0 lg:block">
        {summary}
      </aside>
    </main>
  );
}

// one card: Back to the card before, its name (Change beside it for someone new), what it still needs once Next or
// Save was tapped, what it holds, then Next (or the card's own end, as Save on the last). Keyed by the caller with its
// id, so each card comes in fresh
export function StepCard({
  id,
  name,
  onBack,
  onChange,
  missing,
  end,
  children,
}: {
  id: string;
  name: string;
  onBack: (() => void) | null;
  onChange: (() => void) | null;
  missing: string | null;
  // Next, the save, or nothing (a card that moves on by itself)
  end: React.ReactNode;
  children: React.ReactNode;
}) {
  const tr = useTranslations("transactions.receipt");
  const tpick = useTranslations("transactions.picker");
  return (
    <section
      aria-labelledby={`card-${id}`}
      className="txn-card on-ivory chat-rise flex flex-col gap-4 rounded-2xl bg-ivory p-4 text-chestnut sm:p-5"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="-mb-1 flex min-h-9 w-fit items-center gap-1.5 text-sm font-semibold"
        >
          <ArrowLeft className="size-4" aria-hidden /> {tr("back")}
        </button>
      )}
      <div className="-mb-1 flex items-center justify-between gap-2">
        <h2
          id={`card-${id}`}
          className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60"
        >
          {name}
        </h2>
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            className="text-sm font-semibold underline underline-offset-2"
          >
            {tpick("change")}
          </button>
        )}
      </div>
      {missing && <FieldMessage className="mt-0">{missing}</FieldMessage>}
      {children}
      {end}
    </section>
  );
}

// Next: on to the card after this one
export function NextButton({ onClick }: { onClick: () => void }) {
  const tr = useTranslations("transactions.receipt");
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-colors hover:bg-chestnut/90"
    >
      {tr("next")} <ArrowRight className="size-5" aria-hidden />
    </button>
  );
}

// phones: the total, in a bar that opens to the summary's lines
export function SummaryBar({
  label,
  total,
  open,
  onToggle,
  children,
}: {
  label: string;
  total: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="on-ivory flow-root rounded-2xl bg-ivory text-chestnut">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
          {label}
        </span>
        <span className="flex items-center gap-3">
          <span className={cn(money, "text-lg")}>{rupees(total)}</span>
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// wide screens: its name, what it comes to (its breakup is under the amount), then the lines
export function SummaryCard({
  label,
  total,
  children,
}: {
  label: string;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="on-ivory flex flex-col gap-3 rounded-2xl bg-ivory p-4 text-chestnut">
      <h2 className="-mb-1 text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
        {label}
      </h2>
      <p className={cn(money, "text-3xl")}>{rupees(total)}</p>
      {children}
    </div>
  );
}

// a line for each card answered (one left empty has none); a line goes back to its card, up to the first one not yet
// filled in
export function SummaryLines<S extends string>({
  items,
  current,
  reachable,
  onPick,
}: {
  items: SummaryItem<S>[];
  current: S;
  reachable: (s: S) => boolean;
  onPick: (s: S) => void;
}) {
  const lines = items.filter(
    (l) => l.value !== null && l.value !== "" && !(Array.isArray(l.value) && l.value.length === 0),
  );
  if (lines.length === 0) return null;
  return (
    <dl className="flex flex-col border-t border-chestnut/15">
      {lines.map((l) => (
        <button
          key={l.key}
          type="button"
          disabled={!reachable(l.step)}
          onClick={() => onPick(l.step)}
          className={cn(
            "flex flex-col items-start gap-0.5 border-b border-chestnut/15 py-2 text-left hover:bg-chestnut/4",
            l.step === current && "font-bold",
          )}
        >
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] opacity-60">
            {l.heading}
          </dt>
          <dd className="flex w-full flex-col font-semibold">
            {(Array.isArray(l.value) ? l.value : [l.value!]).map((line, i) =>
              typeof line === "string" ? (
                <span key={i} className="truncate">
                  {line}
                </span>
              ) : (
                <span key={i} className="flex justify-between gap-3">
                  <span className="truncate">{line.name}</span>
                  <span className="tabular shrink-0">{line.amount}</span>
                </span>
              ),
            )}
          </dd>
        </button>
      ))}
    </dl>
  );
}
