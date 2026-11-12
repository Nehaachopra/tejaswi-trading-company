"use client";

import { IndianRupee } from "lucide-react";

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
import { DuePie, type PiePart } from "../payment/due-pie";
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

  // the pie's two parts, the see-through one first and the chestnut one last. One that leaves an advance: what was
  // owed, and the advance. One that doesn't, where something is owed (a customer, a loan given back): what's still
  // owed after it, and what it settles (TDS they deducted counts). A part of nothing is left out
  const settled = dueShown === null ? 0 : Math.min(total, dueShown);
  const pieParts: PiePart[] = (
    value <= 0
      ? []
      : advance > 0
        ? [
            { key: "due", name: t("due"), amount: owes, filled: false },
            { key: "advance", name: t("advancePart"), amount: advance, filled: true },
          ]
        : dueShown !== null
          ? [
              {
                key: "due",
                name: t("due"),
                amount: Math.round((dueShown - settled) * 100) / 100,
                filled: false,
              },
              { key: "settled", name: tpf("settledPart"), amount: settled, filled: true },
            ]
          : []
  ).filter((part) => part.amount > 0);

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
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-12">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2.5">
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
            {/* the rest of the breakup once there's an amount: the TDS they deducted (its switch in the row), the
                total; then the TDS's note once it's on */}
            {value > 0 && <PlainRows rows={rows.slice(1, totalAt + 1)} />}
            <Reveal follow show={tdsCan && tdsOnIt && value > 0} gap="0.625rem">
              <Note className="text-chestnut/70">
                {t(kind === "interestReceived" ? "tdsNote194A" : "tdsNote194Q")}
              </Note>
            </Reveal>
            {/* a phone: the due's pie under the total, in the middle (wider screens: on the right) */}
            {pieParts.length > 0 && (
              <div className="flex justify-center pt-3 sm:hidden">
                <DuePie parts={pieParts} />
              </div>
            )}
            {/* an advance they already have with us, before anything's typed */}
            <Reveal follow show={heldAdvance > 0 && advance === 0} gap="0.625rem">
              <Note className="tabular text-chestnut/70">
                {t("heldAdvance", { amount: rupees(heldAdvance) })}
              </Note>
            </Reveal>
          </div>

          {/* where it came into, a row like the rest, under the amount */}
          <ReceivedInto part="top" />
        </div>
        {/* wider screens: a pie of the due, its circle a little left of the right half's middle */}
        {pieParts.length > 0 && (
          <div className="hidden min-w-0 items-center justify-center self-stretch sm:flex">
            <DuePie parts={pieParts} />
          </div>
        )}
      </div>
      {/* the breakdown of where it came into (a card for each place, its QR and reference), the card's full width */}
      <ReceivedInto part="rest" />
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
