"use client";

import { ArrowDownLeft, ArrowDownUp, ArrowUpRight, ChevronDown, ChevronRight, CircleAlert, Clock, HandCoins, Landmark, type LucideIcon, MapPin, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { rupees } from "~/lib/format";
import { useLocalLetters } from "~/lib/use-local-letters";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { DUE_KINDS, type DueKind } from "./due-kinds";
import { DueOverdueCard, dayText, daysUntil, NEAR_DAYS, percentOf, ShortNameBadge } from "./due-parts";

// each tab's sign: money coming in from debtors, going out to creditors, a loan we gave, a loan from a lender
export const TAB_ICON: Record<DueKind, LucideIcon> = { debtor: ArrowDownLeft, creditor: ArrowUpRight, loanGiven: HandCoins, loanTaken: Landmark };

type Board = RouterOutputs["transactions"]["due"]["list"];
type Party = Board["list"][number];
type Due = Party["dues"][number];

// the status filter: everyone overdue, or due within 2 days (a payment coming up)
type Status = "overdue" | "near";
const STATUSES: Status[] = ["overdue", "near"];
const isNear = (d: Due) => d.dueOn !== null && d.left > 0 && daysUntil(d.dueOn) >= 0 && daysUntil(d.dueOn) <= NEAR_DAYS;
const inStatus = (d: Due, s: Status) => (s === "overdue" ? d.overdue : isNear(d));
const STATUS_FILL: Record<Status, string> = { overdue: "#b42318", near: "#f79009" };

type Sort = "overdue" | "amount" | "oldest" | "name";
const SORTS: Sort[] = ["overdue", "amount", "oldest", "name"];

// a status's colour, beside its name in the filter
function Swatch({ status }: { status: Status }) {
  return <span className="size-2.5 shrink-0 rounded-sm" style={{ background: STATUS_FILL[status] }} aria-hidden />;
}

// /dues, admin only: what's owed both ways. Under the header stay the four tabs. Then what's due and what's overdue
// with a money potli between them, then the filters (status, town, order, + Old due; they stay under the tabs too),
// then a card per party, its short name red when overdue; tapping one opens that party's dues page
export function DuesBoard({ initialKind }: { initialKind: DueKind }) {
  const t = useTranslations("dues");
  const ti = useTranslations("dues.insights");
  const tf = useTranslations("dues.filters");
  // names and towns in the app's letters
  const local = useLocalLetters();
  const [kind, setKind] = useState<DueKind>(initialKind);
  const [status, setStatus] = useState<Status | null>(null);
  const [town, setTown] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("overdue");
  const dues = trpc.transactions.due.list.useQuery({ kind }, { placeholderData: (previous) => previous });
  // the tab picked stays in view on a phone
  const tabs = useRef<Partial<Record<DueKind, HTMLButtonElement | null>>>({});
  useEffect(() => {
    tabs.current[kind]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [kind]);

  // a tab picked: it's kept in the link, so a reload or the way back lands on it; its filters start afresh
  function pick(k: DueKind) {
    setKind(k);
    setStatus(null);
    setTown(null);
    window.history.replaceState(null, "", `/dues?kind=${k}`);
  }

  const board = dues.data;
  const towns = [...new Set((board?.list ?? []).map((p) => p.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  // the town narrows the numbers too; the status only narrows the cards
  const inTown = (board?.list ?? []).filter((p) => town === null || p.city === town);
  const shown = inTown
    .filter((p) => status === null || p.dues.some((d) => inStatus(d, status)))
    .sort((a, b) =>
      sort === "amount"
        ? b.left - a.left
        : sort === "oldest"
          ? new Date(a.dues[0]!.dated).getTime() - new Date(b.dues[0]!.dated).getTime()
          : sort === "name"
            ? a.partyName.localeCompare(b.partyName)
            : b.overdue - a.overdue || b.left - a.left,
    );
  const total = inTown.reduce((sum, p) => sum + Math.round(p.left * 100), 0) / 100;
  const overdue = inTown.reduce((sum, p) => sum + Math.round(p.overdue * 100), 0) / 100;
  const late = inTown.filter((p) => p.overdue > 0).length;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* the four kinds as one switch, unlike the filters below: equal parts in a darker bar, the one picked filled
          ivory, each with its sign (on a phone the sign sits above a short label); it stays under the header */}
      <div className="sticky top-16 z-20 -mx-4 bg-chestnut px-4 py-2 sm:-mx-6 sm:px-6">
        <div role="tablist" aria-label={t("title")} className="grid grid-cols-4 gap-1 rounded-xl bg-black/25 p-1">
          {DUE_KINDS.map((k) => {
            const Icon = TAB_ICON[k];
            return (
              <button
                key={k}
                ref={(el) => {
                  tabs.current[k] = el;
                }}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => pick(k)}
                className={cn(
                  "flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[0.7rem] font-semibold leading-tight transition-colors sm:h-10 sm:flex-row sm:gap-2 sm:text-sm",
                  kind === k ? "on-ivory bg-ivory text-chestnut shadow-sm" : "text-ivory/75 hover:bg-ivory/10 hover:text-ivory",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="max-w-full truncate sm:hidden">{t(`tabsShort.${k}`)}</span>
                <span className="hidden truncate sm:inline">{t(`tabs.${k}`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {dues.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : dues.isError || !board ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : board.list.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center text-ivory/70">
          <p>{t(`empty.${kind}`)}</p>
          <OldDueLink kind={kind} labelled />
        </div>
      ) : (
        <div className={cn("transition-opacity", dues.isPlaceholderData && "opacity-60")}>
          <div className="mt-3">
            <DueOverdueCard
              total={total}
              overdue={overdue}
              totalNote={ti("parties", { n: inTown.length })}
              overdueNote={`${percentOf(overdue, total)}% · ${ti("parties", { n: late })}`}
              onOverdue={() => setStatus(status === "overdue" ? null : "overdue")}
              pressed={status === "overdue"}
            />
          </div>

          {/* the filters, under the tabs while the list scrolls */}
          <div className="sticky top-[8.5rem] z-10 -mx-4 mt-2 flex items-center gap-2 bg-chestnut px-4 py-2 sm:top-32 sm:-mx-6 sm:px-6">
            {/* status: all, overdue, or due within 2 days */}
            <Menu
              label={tf("status")}
              surface="chestnut"
              align="left"
              triggerClassName="min-h-9 max-w-44 gap-1.5 px-3 text-sm"
              trigger={
                <>
                  {status && <Swatch status={status} />}
                  <span className="truncate">{status ? tf(status) : tf("allStatus")}</span>
                  <ChevronDown className="size-4 shrink-0" aria-hidden />
                </>
              }
            >
              {(close) =>
                [null, ...STATUSES].map((s) => (
                  <MenuItem
                    key={s ?? "all"}
                    selected={status === s}
                    onClick={() => {
                      setStatus(s);
                      close();
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {s && <Swatch status={s} />}
                      {s ? tf(s) : tf("allStatus")}
                    </span>
                  </MenuItem>
                ))
              }
            </Menu>
            {/* the town of the party's default address */}
            {towns.length > 1 && (
              <Menu
                label={tf("town")}
                surface="chestnut"
                align="left"
                triggerClassName="min-h-9 max-w-40 gap-1.5 px-3 text-sm"
                trigger={
                  <>
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{town ? local(town) : tf("allTowns")}</span>
                    <ChevronDown className="size-4 shrink-0" aria-hidden />
                  </>
                }
              >
                {(close) =>
                  [null, ...towns].map((c) => (
                    <MenuItem
                      key={c ?? "all"}
                      selected={town === c}
                      onClick={() => {
                        setTown(c);
                        close();
                      }}
                    >
                      <span className="truncate">{c ? local(c) : tf("allTowns")}</span>
                    </MenuItem>
                  ))
                }
              </Menu>
            )}
            {/* the order and + Old due, on the right */}
            <div className="ml-auto flex items-center gap-2">
              <Menu
                label={tf("sort")}
                surface="chestnut"
                align="right"
                triggerClassName="min-h-9 gap-1.5 px-3 text-sm"
                trigger={
                  <>
                    <ArrowDownUp className="size-3.5 shrink-0" aria-hidden />
                    <span className="max-sm:sr-only">{tf(`sorts.${sort}`)}</span>
                  </>
                }
              >
                {(close) =>
                  SORTS.map((s) => (
                    <MenuItem
                      key={s}
                      selected={sort === s}
                      onClick={() => {
                        setSort(s);
                        close();
                      }}
                    >
                      {tf(`sorts.${s}`)}
                    </MenuItem>
                  ))
                }
              </Menu>
              <OldDueLink kind={kind} />
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="mt-10 text-center text-ivory/70">{tf("noMatch")}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3">
              {shown.map((p) => (
                <PartyCard key={p.partyId} kind={kind} party={p} />
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

// + Old due, for a due from before the app of this tab's kind (its word hidden on a phone, unless asked for)
function OldDueLink({ kind, labelled = false }: { kind: DueKind; labelled?: boolean }) {
  const t = useTranslations("dues");
  return (
    <Link
      href={`/dues/old?kind=${kind}`}
      aria-label={t("oldDue")}
      className="on-ivory flex min-h-9 shrink-0 items-center gap-1.5 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut"
    >
      <Plus className="size-4" aria-hidden /> <span className={labelled ? undefined : "max-sm:sr-only"}>{t("oldDue")}</span>
    </Link>
  );
}

// one party: its short name, red when overdue and ivory otherwise; the full name, phone and town; total due and overdue
// (or how soon it's due) on the right. Tapping it opens the party's dues page
function PartyCard({ kind, party: p }: { kind: DueKind; party: Party }) {
  const t = useTranslations("dues");
  const tf = useTranslations("dues.filters");
  const local = useLocalLetters();
  const soonIn = p.nextDueOn ? daysUntil(p.nextDueOn) : null;

  return (
    <li>
      <Link href={`/dues/${kind}/${p.partyId}`} className="on-ivory flex items-center gap-3 rounded-2xl bg-ivory p-4 text-chestnut hover:bg-[#fbf7ee]">
        <ShortNameBadge shortName={p.shortName} name={p.partyName} late={p.overdue > 0} title={p.overdue > 0 ? tf("overdue") : undefined} />

        <span className="min-w-0 flex-1">
          {/* a roomy line, so the marks above Kannada and Hindi letters aren't cut off by the truncation */}
          <span className="block truncate py-1 font-heading text-xl font-bold leading-[1.45]">{local(p.partyName)}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs opacity-70">
            {p.partyPhone && (
              <span className="tabular inline-flex items-center gap-1 whitespace-nowrap">
                <Phone className="size-3" aria-hidden /> +91 {p.partyPhone}
              </span>
            )}
            {p.city && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3 shrink-0" aria-hidden /> <span className="truncate leading-normal">{local(p.city)}</span>
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="tabular font-heading text-xl font-bold leading-6">{rupees(p.left)}</span>
          {p.overdue > 0 ? (
            <span className="tabular inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
              <CircleAlert className="size-3" aria-hidden /> {rupees(p.overdue)}
            </span>
          ) : soonIn !== null && soonIn <= NEAR_DAYS ? (
            <span className="tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "#f7900926", color: "#93370d" }}>
              <Clock className="size-3" aria-hidden /> {t("dueIn", { n: soonIn })}
            </span>
          ) : (
            p.nextDueOn && <span className="tabular text-xs opacity-60">{t("nextDue", { day: dayText(p.nextDueOn) })}</span>
          )}
        </span>
        <ChevronRight className="size-5 shrink-0 opacity-50" aria-hidden />
      </Link>
    </li>
  );
}
