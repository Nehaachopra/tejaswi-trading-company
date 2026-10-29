"use client";

import { ArrowDownUp, ArrowLeft, Ban, BookOpen, ChevronDown, CircleAlert, Info, MapPin, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { WhatsAppIcon } from "~/components/ui/whatsapp-icon";
import { rupees } from "~/lib/format";
import { useLocalLetters } from "~/lib/use-local-letters";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { kindOf, PARTY_KINDS } from "../account/party/party-kinds";
import { TAB_ICON } from "./dues-board";
import type { DueKind } from "./due-kinds";
import { dayText, daysUntil, NEAR_DAYS, ShortNameBadge } from "./due-parts";

type Page = RouterOutputs["transactions"]["due"]["party"];
type Due = Page["dues"][number];

const REMARKS_MAX = 100;

// the table's filters: all, overdue, or due within 2 days; and its order
type Status = "overdue" | "near";
const STATUSES: Status[] = ["overdue", "near"];
const isNear = (d: Due) => d.dueOn !== null && daysUntil(d.dueOn) >= 0 && daysUntil(d.dueOn) <= NEAR_DAYS;
type Sort = "oldest" | "late" | "largest";
const SORTS: Sort[] = ["oldest", "late", "largest"];
// how late a due is, in days (none due yet sort after every late one)
const lateBy = (d: Due) => (d.dueOn ? -daysUntil(d.dueOn) : -Infinity);

// money owed to us (a debtor, a loan we gave): each due can be reminded on WhatsApp or booked as a bad debt; a receipt
// records it. Money we owe is recorded with a payment
const OWED_TO_US: DueKind[] = ["debtor", "loanGiven"];

// a receipt's or payment's own page, where one made the due (an old due has none)
const pageOf = (d: Due) =>
  d.old ? null : d.kind === "loanGiven" ? `/transaction/payment/${d.transactionId}` : d.kind === "loanTaken" ? `/transaction/receipt/${d.transactionId}` : null;

// how soon a due falls due, in words: so many days late, today, or in so many days
const useDueIn = () => {
  const tp = useTranslations("dues.party");
  return (days: number) => (days < 0 ? tp("late", { n: -days }) : days === 0 ? tp("today") : tp("inDays", { n: days }));
};

// /dues/[kind]/[party], admin only: one party's dues of one kind. On top the party (short name, name, phone, town) with
// Record receipt (or payment) and its Ledger; then due and overdue with the potli and the party's average time to
// settle under it; then its open dues, oldest first, each with a WhatsApp reminder and Book as bad debt (asked first,
// on the row) when it's owed to us
export function PartyDues({ kind, partyId }: { kind: DueKind; partyId: string }) {
  const t = useTranslations("dues");
  const tp = useTranslations("dues.party");
  const ti = useTranslations("dues.insights");
  const local = useLocalLetters();
  const page = trpc.transactions.due.party.useQuery({ kind, partyId });
  const BackIcon = TAB_ICON[kind];

  const back = (
    <Link href={`/dues?kind=${kind}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
      <ArrowLeft className="size-4" aria-hidden /> <BackIcon className="size-4" aria-hidden /> {t(`tabs.${kind}`)}
    </Link>
  );

  if (page.isPending || page.isError)
    return (
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        {back}
        {page.isPending ? (
          <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
            <Spinner /> {t("loading")}
          </p>
        ) : (
          <p role="alert" className="mt-16 flex items-center justify-center gap-2">
            <CircleAlert className="size-4" aria-hidden /> {tp("loadError")}
          </p>
        )}
      </main>
    );

  const d = page.data;
  const name = local(d.party.name);
  const owedToUs = OWED_TO_US.includes(kind);
  const ledger = `${PARTY_KINDS[kindOf(d.party.type)].path}/${d.party.id}`;
  const oldestLate = d.dues.filter((x) => x.overdue && x.dueOn).reduce((most, x) => Math.max(most, -daysUntil(x.dueOn!)), 0);
  const button =
    "inline-flex min-h-10 items-center gap-2 rounded-control border-2 border-chestnut px-3.5 text-sm font-semibold transition-colors hover:bg-chestnut/[0.06]";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-16 pt-4 sm:px-6">
      <h1 className="sr-only">{name}</h1>
      {back}

      {/* the party, with recording the money and its ledger */}
      <section className="on-ivory flex flex-col gap-4 rounded-2xl bg-ivory p-4 text-chestnut sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <ShortNameBadge shortName={d.party.shortName} name={d.party.name} late={d.overdue > 0} size="lg" />
          <div className="min-w-0 flex-1">
            {/* a roomy line, so the marks above Kannada and Hindi letters aren't cut off */}
            <p className="truncate py-1 font-heading text-2xl font-bold leading-[1.45]">{name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm opacity-75">
              {d.party.phone && (
                <span className="tabular inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Phone className="size-3.5" aria-hidden /> +91 {d.party.phone}
                </span>
              )}
              {d.party.city && (
                <span className="inline-flex items-center gap-1.5 leading-normal">
                  <MapPin className="size-3.5" aria-hidden /> {local(d.party.city)}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={owedToUs ? "/transaction/receipt" : "/transaction/payment"} className={button}>
            <Plus className="size-4" aria-hidden /> {tp(owedToUs ? "recordReceipt" : "recordPayment")}
          </Link>
          <Link href={ledger} className={button}>
            <BookOpen className="size-4" aria-hidden /> {tp("ledger")}
          </Link>
        </div>
      </section>

      {/* three numbers: what's due, what of it is overdue, and how long this party takes to settle */}
      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="on-ivory flex min-w-0 flex-col gap-1 rounded-2xl bg-ivory p-3 text-chestnut sm:p-4">
          <dt className="text-[0.68rem] font-semibold uppercase leading-tight tracking-[0.08em] opacity-60">{tp("tiles.total")}</dt>
          <dd className="tabular whitespace-nowrap font-heading text-lg font-bold leading-tight sm:text-2xl">{rupees(d.left)}</dd>
          <dd className="text-xs opacity-70">{tp("duesN", { n: d.dues.length })}</dd>
        </div>
        <div className="on-ivory flex min-w-0 flex-col gap-1 rounded-2xl bg-ivory p-3 text-chestnut sm:p-4">
          <dt className="text-[0.68rem] font-semibold uppercase leading-tight tracking-[0.08em] text-danger">{tp("tiles.overdue")}</dt>
          <dd className={cn("tabular whitespace-nowrap font-heading text-lg font-bold leading-tight sm:text-2xl", d.overdue > 0 ? "text-danger" : "opacity-40")}>
            {rupees(d.overdue)}
          </dd>
          <dd className="text-xs opacity-70">{oldestLate > 0 ? tp("oldestLate", { n: oldestLate }) : tp("onTime")}</dd>
        </div>
        <div className="on-ivory flex min-w-0 flex-col gap-1 rounded-2xl bg-ivory p-3 text-chestnut sm:p-4">
          <dt className="text-[0.68rem] font-semibold uppercase leading-tight tracking-[0.08em] opacity-60">{tp("tiles.average")}</dt>
          <dd className="tabular whitespace-nowrap font-heading text-lg font-bold leading-tight sm:text-2xl">
            {d.averageDays === null ? "—" : tp("daysN", { n: d.averageDays })}
          </dd>
          <dd className="text-xs opacity-70">{d.averageDays === null ? tp("nothingSettled") : tp("fromDue")}</dd>
        </div>
      </dl>

      {/* the open dues, oldest first */}
      <section aria-labelledby="open-dues" className="flex flex-col gap-2">
        <h2 id="open-dues" className="px-1 text-xs font-semibold uppercase tracking-[0.08em] opacity-70">
          {tp("openDues")} · {ti("dues", { n: d.dues.length })}
        </h2>
        {d.dues.length === 0 ? (
          <p className="on-ivory rounded-2xl bg-ivory p-5 text-center text-sm text-chestnut/70">{tp("noDues")}</p>
        ) : (
          <DuesTable page={d} kind={kind} partyName={name} actions={owedToUs} />
        )}
      </section>
    </main>
  );
}

// the open dues, one table at every width: transaction (and its date), the due (overdue out of its total, or what's
// due), and its actions. Booking one as a bad debt asks first, right under that due
function DuesTable({ page, kind, partyName, actions }: { page: Page; kind: DueKind; partyName: string; actions: boolean }) {
  const t = useTranslations("dues");
  const tp = useTranslations("dues.party");
  const tf = useTranslations("transactions.loan.frequencies");
  const dueIn = useDueIn();
  const utils = trpc.useUtils();
  const writeOff = trpc.transactions.due.writeOff.useMutation();
  const tfl = useTranslations("dues.filters");
  const [status, setStatus] = useState<Status | null>(null);
  const [sort, setSort] = useState<Sort>("oldest");
  const shown = page.dues
    .filter((x) => status === null || (status === "overdue" ? x.overdue : isNear(x)))
    .sort((a, b) =>
      sort === "late" ? lateBy(b) - lateBy(a) : sort === "largest" ? b.left - a.left : new Date(a.dated).getTime() - new Date(b.dated).getTime(),
    );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [failed, setFailed] = useState(false);

  const tone = (x: Due) =>
    x.overdue ? "font-semibold text-danger" : x.dueOn && daysUntil(x.dueOn) <= NEAR_DAYS ? "font-semibold text-[#93370d]" : "opacity-70";
  const when = (x: Due) => (x.dueOn ? dueIn(daysUntil(x.dueOn)) : "—");
  const terms = (x: Due) => (x.interestRate !== null ? `${x.interestRate}% · ${x.frequency ? tf(x.frequency) : ""}` : null);

  // a reminder about one due: WhatsApp on the party's chat (or a contact to pick, with no phone) with the message ready
  const reminder = (x: Due) => {
    const values = { name: partyName, left: rupees(x.left), id: x.assignedId, dated: dayText(new Date(x.dated)) };
    const text = !x.dueOn
      ? tp("rowReminderOpen", values)
      : x.overdue
        ? tp("rowReminderLate", { ...values, on: dayText(x.dueOn) })
        : tp("rowReminder", { ...values, by: dayText(x.dueOn) });
    const p = page.party;
    const to = p.phone ? `${(p.countryCode ?? "+91").replace(/\D/g, "")}${p.phone.replace(/\D/g, "").slice(-10)}` : "";
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  };

  // booking one due as a bad debt, once confirmed
  async function bookBadDebt(x: Due) {
    setFailed(false);
    try {
      const r = await writeOff.mutateAsync({ kind: kind as "debtor" | "loanGiven", partyId: page.party.id, dueId: x.id, remarks: reason });
      utils.transactions.due.party.setData({ kind, partyId: page.party.id }, r);
      void utils.transactions.due.list.invalidate();
      void utils.accounts.invalidate();
      setConfirming(null);
      setReason("");
    } catch {
      setFailed(true);
    }
  }

  const txn = (x: Due) => {
    const href = pageOf(x);
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {href ? (
          <Link href={href} className="tabular font-semibold underline decoration-chestnut/30 underline-offset-4 hover:decoration-chestnut">
            {x.assignedId}
          </Link>
        ) : (
          <span className="tabular font-semibold">{x.assignedId}</span>
        )}
        {/* this due's transaction history (the page comes with History) */}
        <Link
          href={`/history?txn=${x.transactionId}`}
          title={tp("history")}
          aria-label={tp("history")}
          className="-m-1 grid size-7 place-items-center rounded-full opacity-60 transition-opacity hover:opacity-100"
        >
          <Info className="size-4" aria-hidden />
        </Link>
      </span>
    );
  };

  // the two actions for a due owed to us: the reminder only once it's overdue
  const act = "inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-2 text-xs font-semibold transition-colors sm:px-2.5";
  const rowActions = (x: Due) => (
    <span className="flex items-center justify-end gap-1.5">
      {x.overdue && (
        <a href={reminder(x)} target="_blank" rel="noreferrer" title={tp("reminder")} className={cn(act, "bg-chestnut text-ivory hover:bg-chestnut/90")}>
          <WhatsAppIcon className="size-3.5" /> <span className="max-sm:sr-only">{tp("remind")}</span>
        </a>
      )}
      <button
        type="button"
        onClick={() => {
          setConfirming(confirming === x.id ? null : x.id);
          setFailed(false);
        }}
        aria-expanded={confirming === x.id}
        title={tp("badDebt")}
        className={cn(act, "border border-danger text-danger hover:bg-danger/[0.06]", confirming === x.id && "bg-danger/[0.08]")}
      >
        <Ban className="size-3.5" aria-hidden /> <span className="max-sm:sr-only">{tp("badDebtShort")}</span>
      </button>
    </span>
  );

  // the question before booking a bad debt: what it does, an optional reason, and the two answers
  const confirm = (x: Due) => (
    <div role="alertdialog" aria-labelledby={`bad-${x.id}`} className="flex flex-col gap-3 rounded-xl border-2 border-danger bg-danger/[0.05] p-4 text-left">
      <p id={`bad-${x.id}`} className="font-heading text-base font-bold text-danger">
        {tp("badDebtConfirm", { amount: rupees(x.left), id: x.assignedId })}
      </p>
      <p className="text-sm opacity-80">{tp("badDebtNote", { name: partyName })}</p>
      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`reason-${x.id}`}>
        {tp("reason")}
        <input
          id={`reason-${x.id}`}
          value={reason}
          maxLength={REMARKS_MAX}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-11 rounded-control border border-chestnut/40 bg-ivory px-3 font-normal outline-none focus:border-chestnut"
        />
      </label>
      {failed && (
        <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-danger">
          <CircleAlert className="size-4" aria-hidden /> {tp("badDebtFailed")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void bookBadDebt(x)}
          disabled={writeOff.isPending}
          aria-busy={writeOff.isPending}
          className="inline-flex min-h-10 items-center gap-2 rounded-control bg-danger px-3.5 text-sm font-semibold text-ivory aria-busy:opacity-80"
        >
          {writeOff.isPending ? <Spinner className="size-4" /> : <Ban className="size-4" aria-hidden />} {tp("confirm")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(null)}
          className="inline-flex min-h-10 items-center rounded-control border-2 border-chestnut px-3.5 text-sm font-semibold hover:bg-chestnut/[0.06]"
        >
          {tp("cancel")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* the filters: status on the left, the order on the right */}
      <div className="flex items-center gap-2">
        <Menu
          label={tfl("status")}
          surface="chestnut"
          align="left"
          triggerClassName="min-h-9 gap-1.5 px-3 text-sm"
          trigger={
            <>
              <span className="truncate">{status ? tfl(status) : tfl("allStatus")}</span>
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
                {s ? tfl(s) : tfl("allStatus")}
              </MenuItem>
            ))
          }
        </Menu>
        <div className="ml-auto">
          <Menu
            label={tfl("sort")}
            surface="chestnut"
            align="right"
            triggerClassName="min-h-9 gap-1.5 px-3 text-sm"
            trigger={
              <>
                <ArrowDownUp className="size-3.5 shrink-0" aria-hidden />
                <span>{tp(`sorts.${sort}`)}</span>
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
                  {tp(`sorts.${s}`)}
                </MenuItem>
              ))
            }
          </Menu>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="on-ivory rounded-2xl bg-ivory p-5 text-center text-sm text-chestnut/70">{tfl("noMatch")}</p>
      ) : (
        <div className="on-ivory overflow-hidden rounded-2xl bg-ivory text-chestnut">
          {/* the table, at every width: on a phone the date sits under the transaction and the actions are icons */}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.68rem] uppercase tracking-[0.08em] text-chestnut/60">
                <th className="py-2.5 pl-3 pr-2 font-semibold sm:px-4">{tp("cols.txn")}</th>
                <th className="hidden px-2 py-2.5 font-semibold sm:table-cell">{tp("cols.date")}</th>
                <th className="px-2 py-2.5 text-right font-semibold sm:hidden">{tp("cols.due")}</th>
                <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">{tp("cols.overdue")}</th>
                <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">{tp("cols.totalDue")}</th>
                {actions && (
                  <th className="py-2.5 pl-1 pr-3 sm:px-4">
                    <span className="sr-only">{tp("cols.actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-chestnut/10 border-t border-chestnut/10">
              {shown.map((x) => (
                <Fragment key={x.id}>
                  <tr className={cn(x.overdue && "bg-danger/[0.04]")}>
                    <td className="py-3 pl-3 pr-2 sm:px-4">
                      {txn(x)}
                      <span className="tabular block text-xs opacity-60 sm:hidden">{dayText(new Date(x.dated))}</span>
                      {/* how late (or how soon) sits here with the row's details: always on a phone, on a wider screen only
                          when more than a day late */}
                      <span className={cn("tabular flex items-center gap-1 text-xs", tone(x), !(x.overdue && lateBy(x) > 1) && "sm:hidden")}>
                        {x.overdue && <CircleAlert className="size-3" aria-hidden />}
                        {x.dueOn ? when(x) : tp("noDueDate")}
                      </span>
                      {terms(x) && <span className="tabular block text-xs opacity-60">{terms(x)}</span>}
                    </td>
                    <td className="tabular hidden whitespace-nowrap px-2 py-3 sm:table-cell">{dayText(new Date(x.dated))}</td>
                    {/* a phone: one due cell; when overdue, three lines (what's overdue in red, "of", its total), else its
                        total due */}
                    <td className="tabular whitespace-nowrap px-2 py-3 text-right sm:hidden">
                      {x.overdue ? (
                        <span className="flex flex-col items-end leading-tight">
                          <span className="font-heading text-base font-bold text-danger">{rupees(x.left)}</span>
                          <span className="text-[0.7rem] opacity-60">{tp("of")}</span>
                          <span className="font-semibold">{rupees(x.amount)}</span>
                        </span>
                      ) : (
                        <span className="block font-heading text-base font-bold">{rupees(x.left)}</span>
                      )}
                    </td>
                    {/* a wider screen: what's overdue, and the total due, each in its own column */}
                    <td className="tabular hidden whitespace-nowrap px-2 py-3 text-right font-heading text-base font-bold text-danger sm:table-cell">
                      {x.overdue ? rupees(x.left) : <span className="font-normal text-chestnut/40">—</span>}
                    </td>
                    <td className="tabular hidden whitespace-nowrap px-2 py-3 text-right font-heading text-base font-bold sm:table-cell">
                      {rupees(x.overdue ? x.amount : x.left)}
                    </td>
                    {actions && <td className="py-3 pl-1 pr-3 sm:px-4">{rowActions(x)}</td>}
                  </tr>
                  {actions && confirming === x.id && (
                    <tr>
                      <td colSpan={5} className="px-3 pb-4 sm:px-4">
                        {confirm(x)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
