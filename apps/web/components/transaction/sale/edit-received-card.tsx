"use client";

import { Check, ChevronLeft, ChevronRight, IndianRupee } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { MicButton } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { AccountCards } from "../shared/account-cards/account-cards";
import { input, saidAmount } from "../shared/form-basics";
import { Meter } from "../shared/meter";
import { figure, Line, useSaleCards } from "./received-card";
import { useSaleEntry } from "./state";

// what an arrow opens: what was received when it was saved, or how this edit's advance or due comes about
type Opened = "paid" | "advance" | "due";

// the money box's look: chestnut, the ₹ inside on the left, what's typed at the right
const moneyBox = "min-h-12 bg-chestnut pl-11 pr-3.5 text-right font-heading text-xl font-bold tabular text-ivory caret-ivory shadow-none placeholder:text-ivory/60";

// an edit's Received card (cash moving, taken now or refunded): four rows in one look (name, figure or box, arrow
// slot): Amount paid ›, Advance left ›, Due left ›, then To receive (a customer types any part of what's due; a
// walk-in pays it all) or Refund now (paid over, given back at once). Then what's left to place with its slider, and
// the cash and bank cards. An arrow slides the card to what it stands for, headed ‹ and its name (Amount paid: the original sale's own
// Received card, alone, with nothing of this edit's under it) (a tap returns)
export function EditReceivedCard() {
  const e = useSaleEntry();
  const { t, tried, editing, editPaid, editDueLeft, editAdvanceLeft, refunding, received, total, locale } = e;
  const tr = useTranslations("transactions.receipt.form");
  const tc = useTranslations("transactions.chat");
  const tm = useTranslations("transactions.payment.form");
  const cards = useSaleCards();
  // what's received is typed (never filled in); a refund is the figure the edit leaves
  const typed = !refunding;
  const [opened, setOpened] = useState<Opened | null>(null);
  const back = useRef<HTMLButtonElement>(null);
  const open = (o: Opened | null) => {
    setOpened(o);
    setTimeout(() => back.current?.focus({ preventScroll: true }), 320);
  };

  // an arrow beside a figure, opening what it stands for
  const arrow = (o: Opened, label: string) => (
    <button
      type="button"
      onClick={() => open(o)}
      aria-label={label}
      className="grid size-9 place-items-center rounded-control hover:bg-chestnut/10"
    >
      <ChevronRight className="size-5" aria-hidden />
    </button>
  );
  const fig = (n: number) => <span className={cn(figure, "font-bold")}>{rupees(n)}</span>;
  const filled = received > 0;
  const placed = e.gridTotal;
  // this edit's parts under the rows: not while the original sale's card (or a breakup) is open
  const current = filled && opened === null;

  const main = (
    <div className="flex min-w-0 flex-col gap-1.5 sm:w-[calc(50%-1.5rem)]">
      <Line label={<span className="font-semibold">{t("edit.amountPaid")}</span>} value={fig(editPaid)} slot={arrow("paid", t("edit.amountPaid"))} />
      <Line label={<span className="font-semibold">{t("advanceLeft")}</span>} value={fig(editAdvanceLeft)} slot={arrow("advance", t("advanceLeft"))} />
      <Line label={<span className="font-semibold">{t("leftDue")}</span>} value={fig(editDueLeft)} slot={arrow("due", t("leftDue"))} />
      {typed ? (
        <Line
          label={
            <label htmlFor="edit-received" className="flex items-center">
              {t("edit.amountReceived")}
              <RequiredMark />
            </label>
          }
          value={
            <span className="relative block">
              <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2 text-ivory" aria-hidden />
              <NumberInput
                id="edit-received"
                value={e.receivedText}
                decimals={2}
                maxDigits={13}
                max={editDueLeft}
                placeholder="0"
                onChange={e.typeReceived}
                aria-invalid={(tried && received === 0) || undefined}
                className={cn(input(false), moneyBox)}
              />
            </span>
          }
          slot={<MicButton onText={(said) => saidAmount(said, e.typeReceived)} className="rounded-[var(--radius-control)]" />}
        />
      ) : (
        <Line
          label={t(refunding ? "edit.refundNow" : "edit.amountReceived")}
          value={
            <span className="tabular flex min-h-12 items-center justify-end rounded-control bg-chestnut px-3.5 font-heading text-xl font-bold text-ivory">
              {rupees(received)}
            </span>
          }
        />
      )}
    </div>
  );

  // the side: what was received when it was saved (and since), or how this edit's advance or due comes about
  const row = (label: string, value: string, strong = false) => (
    <div className={cn("tabular flex items-center justify-between gap-3 text-sm", strong && "border-t border-chestnut/30 pt-2 font-semibold")}>
      <span>{label}</span>
      <span className={cn("text-base font-semibold", strong && "font-bold")}>{value}</span>
    </div>
  );
  // the original sale's Received card, as it was saved, all read only: Bill amount, Received (and the TDS
  // they deducted, if any), then under a line Due left and Advance left, then the breakdown's cards as folded ones (the amount left, the place and how
  // it came in right)
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const wasIn = editing ? r2(editing.received.cash + editing.received.banks.reduce((a, b) => a + b.amount, 0)) : 0;
  // what the sale left: the bill against what came in for it (TDS too), owed either way
  const was = editing
    ? {
        ...editing.received,
        bill: editing.total,
        dueLeft: Math.max(0, r2(editing.total - wasIn - editing.received.tds)),
        advanceLeft: Math.max(0, r2(wasIn + editing.received.tds - editing.total)),
      }
    : null;
  const wasCard = "flex min-h-12 min-w-0 items-center justify-between gap-3 rounded-control bg-chestnut/6 px-3 py-1.5 shadow-[0_0_5px_0] shadow-chestnut/25";
  const side =
    opened === "paid" && was ? (
      <div className="flex flex-col gap-2.5">
        <Line label={<span className="font-semibold">{t("edit.billAmount")}</span>} value={fig(was.bill)} />
        {/* what came in, in the chestnut box (as To receive's) */}
        <Line
          label={<span className="font-semibold">{t("edit.received")}</span>}
          value={
            <span className="tabular flex min-h-12 items-center justify-end rounded-control bg-chestnut px-3.5 font-heading text-xl font-bold text-ivory">
              {rupees(wasIn)}
            </span>
          }
        />
        {/* (the TDS they deducted, only when they did: it's paid too, so the rows add up) */}
        {was.tds > 0 && <Line label={tc("sum.tds")} value={fig(was.tds)} />}
        {/* what it left, under a line */}
        <div className="border-t border-chestnut/30 pt-1.5">
          <Line label={<span className="font-semibold">{t("leftDue")}</span>} value={fig(was.dueLeft)} />
          <Line label={<span className="font-semibold">{t("advanceLeft")}</span>} value={fig(was.advanceLeft)} />
        </div>
        {wasIn > 0 && (
          <div className="flex flex-col gap-3 border-t border-chestnut/15 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{cards.labels.breakdown}</h3>
            {was.cash > 0 && (
              <div className={wasCard}>
                <span className="tabular shrink-0 font-heading text-xl font-bold">{rupees(was.cash)}</span>
                <span className="min-w-0 truncate text-sm font-semibold">{tc("cash")}</span>
              </div>
            )}
            {was.banks.map((b, i) => (
              <div key={i} className={wasCard}>
                <span className="tabular shrink-0 font-heading text-xl font-bold">{rupees(b.amount)}</span>
                <span className="flex min-w-0 flex-col items-end">
                  <span className="flex min-w-0 max-w-full items-center gap-1">
                    <span className="min-w-0 truncate text-sm font-semibold">{bankNameIn(b.bankName, locale)}</span>
                    <span className="tabular shrink-0 text-sm opacity-70">••{b.last4}</span>
                  </span>
                  {b.mode && <span className="text-xs opacity-70">{tm(`modes.${b.mode}`)}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : opened ? (
      <div className="flex flex-col gap-2.5 rounded-control bg-chestnut/[0.04] p-3">
        {row(t("edit.billAfter"), rupees(total))}
        {row(t("edit.amountPaid"), `− ${rupees(editPaid)}`)}
        {row(t(opened === "due" ? "leftDue" : "advanceLeft"), rupees(opened === "due" ? editDueLeft : editAdvanceLeft), true)}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-2.5">
      {/* the four rows, and the side an arrow slides to */}
      <div className="-mx-1 overflow-hidden">
        <div className={cn("flex w-[200%] items-start transition-transform duration-300 ease-out motion-reduce:transition-none", opened && "-translate-x-1/2")}>
          <div inert={opened !== null} className="w-1/2 min-w-0 p-1">
            {main}
          </div>
          <div inert={opened === null} className="flex w-1/2 min-w-0 flex-col gap-1 p-1 sm:max-w-[calc(25%-0.75rem)]">
            {/* ‹ and the name of what's open (not "Back": the form's own Back is below), as the product card's ‹ Godowns */}
            <button
              ref={back}
              type="button"
              onClick={() => open(null)}
              aria-label={t("edit.back")}
              className="flex min-h-11 w-full items-center gap-1.5 text-left text-sm font-semibold"
            >
              <ChevronLeft className="size-5 shrink-0" aria-hidden />
              {t(opened === "advance" ? "advanceLeft" : opened === "due" ? "leftDue" : "edit.amountPaid")}
            </button>
            {side}
          </div>
        </div>
      </div>

      {/* what's left to place in cash and the bank cards below, and its slider; green with a tick once nothing is */}
      {current && (
        <div className="sticky top-16 z-10 -mx-1 flex flex-col gap-2.5 bg-ivory px-1 pb-1 sm:w-[calc(50%-1rem)]">
          <Line
            label={t(refunding ? "edit.leftToRefund" : "edit.leftToReceive")}
            value={
              placed === received ? (
                <span className={cn(figure, "flex items-center justify-end text-success")} aria-label={tr("nothingLeft")}>
                  <Check className="size-5" strokeWidth={2.5} aria-hidden />
                </span>
              ) : (
                <span className={cn(figure, "font-bold")}>{rupees(Math.max(0, Math.round((received - placed) * 100) / 100))}</span>
              )
            }
          />
          <Meter bare label={t(refunding ? "edit.leftToRefund" : "edit.leftToReceive")} figure={0} share={Math.min(100, (placed / received) * 100)} done={placed === received} className="-mt-1" />
        </div>
      )}
      {current && (
        <div className="mt-1.5 flex flex-col gap-2.5 border-t border-chestnut/15 pt-4">
          <AccountCards
            key={received}
            api={refunding ? { ...cards, labels: { ...cards.labels, mode: t("edit.paidBy"), barLeft: t("edit.leftToRefund") } } : cards}
          />
        </div>
      )}
    </div>
  );
}
