"use client";

import { IndianRupee } from "lucide-react";
import { useState } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { Note } from "~/components/ui/note";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Reveal } from "~/components/ui/reveal";
import { Switch } from "~/components/ui/switch";
import { rupees } from "~/lib/format";
import { SCRAP_GST } from "@repo/trpc/client";
import { cn } from "~/lib/utils";

import { type AmountRow, PlainRows } from "../shared/amount-table";
import { DueFlow, FoldGroup } from "../shared/fold-group";
import { ReceivedInto } from "./received-into";
import { input, saidAmount } from "./shared";
import { useReceiptEntry } from "./state";

// the Amount card, laid out as a payment's: on a phone one column; on a wider screen, on the left, every value a row
// (its name on the left, its box on the right): the due, the months and interest, the amount, its breakup, and where it
// came into; the due's pie on the right. Then the Received into cards (one per place, each with its QR and reference)
// the card's full width
export function AmountCard() {
  const {
    t,
    tc,
    tpf,
    kind,
    loan,
    amount,
    tried,
    value,
    filled,
    typeAmount,
    loanOver,
    dueShown,
    heldAdvance,
    advance,
    owes,
    total,
    tdsCan,
    tdsOnIt,
    interestCalc,
    interestMonths,
    setInterestMonths,
    interestTyped,
    setInterestTyped,
    interestWorked,
    interestDue,
  } = useReceiptEntry();
  const rows = useAmountRows();
  const totalAt = rows.findIndex((r) => r.tone === "total");

  // what this receipt goes towards: the due (as much as was owed, TDS they deducted counting), and the advance past
  // it; only where something was owed or an advance is left
  const settled = dueShown === null ? 0 : Math.min(total, dueShown);
  const owedBefore = advance > 0 ? owes : (dueShown ?? 0);
  const towardsDue = advance > 0 ? owes : settled;
  const hasDue = value > 0 && (dueShown !== null || advance > 0);
  const [dueOpen, setDueOpen] = useState(false);
  const dueGroup = (
    <FoldGroup title={t("towardsGroup")} figure={total} open={dueOpen} onOpen={setDueOpen}>
      <DueFlow
        wholeLabel={t("receiptGroup")}
        whole={total}
        dueLabel={t("due")}
        due={towardsDue}
        advanceLabel={t("advancePart")}
        advance={advance}
        paidLabel={t("paidShare")}
        owedBefore={owedBefore}
      />
    </FoldGroup>
  );

  // a row: its name on the left (level with the box's first line), its box on the right with what's typed at its right
  // end, as a payment's
  const row = (label: React.ReactNode, control: React.ReactNode, htmlFor?: string) => (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <label htmlFor={htmlFor} className="flex min-h-11 min-w-0 items-center text-sm">
        {label}
      </label>
      <div
        className={cn("w-[60%] shrink-0 [&_input]:text-right", filled && "[&_button]:text-ivory")}
      >
        {control}
      </div>
    </div>
  );
  // where every problem and note about a value goes: under the value side, starting at the boxes' left edge
  const underValue = "ml-auto w-[60%]";
  // the ₹ inside an amount's box, ivory once it's filled
  const rupeeMark = (on: boolean) => (
    <IndianRupee
      className={cn(
        "pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2",
        on && "text-ivory",
      )}
      aria-hidden
    />
  );
  // the amount's box: large and bold; chestnut, no shadow, once filled
  const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular";
  const filledBox = "bg-chestnut text-ivory caret-ivory shadow-none";

  return (
    <div className="flex flex-col gap-4">
      {/* wider screens, two rows: on top the due and the amount (left); under them the Receipt's breakup (left) level
          with what it goes towards (right) */}
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-12">
        <div className="flex min-w-0 flex-col gap-4 sm:contents">
          <div className="flex min-w-0 flex-col gap-2.5 sm:col-start-1 sm:row-start-1">
            {/* what's owed by the customer or on the loan given back, as soon as something is owed; room under it */}
            {dueShown !== null && (
              <div className="tabular mb-2 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">{t("due")}</span>
                <span className="shrink-0 whitespace-nowrap text-base font-semibold">
                  {rupees(dueShown)}
                </span>
              </div>
            )}
            {interestCalc ? (
              <>
                {/* interest on a loan we gave: the months, then what they come to (or a figure typed from a
                    statement) */}
                {row(
                  tpf("months"),
                  <NumberInput
                    id="months-field"
                    value={interestTyped !== null ? "" : interestMonths}
                    onChange={(v) => {
                      setInterestTyped(null);
                      setInterestMonths(v !== "" && Number(v) < 1 ? "1" : v);
                    }}
                    maxDigits={3}
                    max={120}
                    placeholder="--"
                    className={cn(input(false), "tabular")}
                  />,
                  "months-field",
                )}
                {row(
                  <>
                    {tpf("interestDue")}
                    <RequiredMark />
                  </>,
                  <span className="relative block">
                    {rupeeMark(interestDue > 0)}
                    <NumberInput
                      id="amount-field"
                      value={interestTyped ?? (interestWorked > 0 ? String(interestWorked) : "")}
                      onChange={setInterestTyped}
                      decimals={2}
                      maxDigits={13}
                      placeholder="0"
                      aria-invalid={(tried && interestDue === 0) || undefined}
                      className={cn(
                        input(tried && interestDue === 0),
                        amountBox,
                        interestDue > 0 && filledBox,
                      )}
                    />
                  </span>,
                  "amount-field",
                )}
              </>
            ) : (
              // the amount, typed or spoken
              row(
                <>
                  {tc("q.amount")}
                  <RequiredMark />
                </>,
                <MicField onText={(said) => saidAmount(said, typeAmount)}>
                  {rupeeMark(filled)}
                  <NumberInput
                    id="amount-field"
                    value={amount}
                    onChange={typeAmount}
                    decimals={2}
                    maxDigits={13}
                    max={kind === "loanReturned" && loan ? loan.left : undefined}
                    placeholder="0"
                    aria-invalid={loanOver || (tried && value === 0) || undefined}
                    className={cn(
                      input(loanOver || (tried && value === 0)),
                      amountBox,
                      "pr-12",
                      filled && filledBox,
                    )}
                  />
                </MicField>,
                "amount-field",
              )
            )}
            {loanOver && (
              <FieldMessage className={cn("mt-0", underValue)}>
                {tc("problems.loanLeft", { left: rupees(loan!.left) })}
              </FieldMessage>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4 sm:col-start-1 sm:row-start-2">
            <div className="flex flex-col gap-2.5">
              {/* the breakup once there's an amount and something to break down, in a tinted Receipt group: what came
                in, the TDS they deducted (its switch in the row), the total; then the TDS's note once it's on */}
              {value > 0 && totalAt > 1 && (
                <div className="-mx-3 flex flex-col gap-1 rounded-control bg-chestnut/6 px-3 py-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
                    {t("receiptGroup")}
                  </h3>
                  <PlainRows rows={rows.slice(0, totalAt + 1)} />
                </div>
              )}
              <Reveal follow show={tdsCan && tdsOnIt && value > 0} gap="0.625rem">
                <Note className="text-chestnut/70">
                  {t(kind === "interestReceived" ? "tdsNote194A" : "tdsNote194Q")}
                </Note>
              </Reveal>
              {/* a phone: what it goes towards under the breakup (wider screens: on the right) */}
              {hasDue && <div className="sm:hidden">{dueGroup}</div>}
              {/* an advance they already have with us, before anything's typed */}
              <Reveal follow show={heldAdvance > 0 && advance === 0} gap="0.625rem">
                <Note className="tabular text-chestnut/70">
                  {t("heldAdvance", { amount: rupees(heldAdvance) })}
                </Note>
              </Reveal>
            </div>
          </div>
        </div>
        {/* wider screens: what it goes towards, level with the breakup */}
        {hasDue && (
          <div className="hidden min-w-0 sm:col-start-2 sm:row-start-2 sm:block">{dueGroup}</div>
        )}
      </div>
      {/* where it came into: a card for each place (its QR and reference), the card's full width */}
      <ReceivedInto />
    </div>
  );
}

// the rows of the amount's breakup
function useAmountRows(): AmountRow[] {
  const {
    t,
    tc,
    tpf,
    tdsLabel,
    tdsCan,
    tdsOnIt,
    setTdsOnIt,
    tdsValue,
    tdsAmount,
    value,
    total,
    owes,
    advance,
    scrapGst,
  } = useReceiptEntry();
  // a scrap sale: the price before GST and the GST taken out of it, then what came in
  if (scrapGst) {
    const gst = scrapGst.cgst + scrapGst.sgst + scrapGst.igst;
    return [
      { key: "price", label: t("scrapPrice"), amount: scrapGst.taxable / 100 },
      { key: "gst", label: t("scrapGst", { rate: SCRAP_GST.rate }), amount: gst / 100 },
      { key: "total", label: tpf("total"), amount: value, tone: "total" as const },
    ];
  }
  return [
    { key: "in", label: tc("sum.amount"), amount: value },
    ...(tdsCan
      ? [
          {
            key: "tds",
            // TDS they deducted: its switch beside it, and once on, the rate the law sets (shown, never typed)
            label: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span id={tdsLabel}>{tc("sum.tds")}</span>
                <Switch small on={tdsOnIt} onFlip={setTdsOnIt} labelledBy={tdsLabel} />
                {tdsOnIt && <span className="tabular text-xs font-semibold">{tdsValue}%</span>}
              </span>
            ),
            amount: tdsOnIt ? tdsAmount : 0,
          },
        ]
      : []),
    { key: "total", label: tpf("total"), amount: total, tone: "total" as const },
    ...(advance > 0 && owes > 0 ? [{ key: "due", label: t("due"), amount: owes }] : []),
    ...(advance > 0
      ? [
          {
            key: "advance",
            label: t("advancePart"),
            amount: advance,
          },
        ]
      : []),
  ];
}
