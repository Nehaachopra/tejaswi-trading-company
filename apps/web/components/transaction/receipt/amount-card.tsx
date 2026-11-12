"use client";

import { HandCoins, IndianRupee } from "lucide-react";

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

import { type AmountRow, AmountTable, hasBreakdown } from "../shared/amount-table";
import { AmountBox } from "../shared/amount-box";
import { ReceivedInto } from "./received-into";
import { input, saidAmount } from "./shared";
import { useReceiptEntry } from "./state";

// the Amount card, laid out as a payment's: on a phone one column; on a wider screen the due, the amount and where it
// came into on the left, the amount's breakdown on the right, starting level; then the Received into breakdown (a card
// per place, each with its QR and reference) the card's full width
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
  // the amount's breakdown: what came in, the TDS they deducted (its switch in the row), the total, and of it the due
  // and the advance; then the TDS's note once it's on. Wider screens: on the right once there's an amount. Phone: under
  // the amount only once there's TDS to set or something to break down
  const breakdown = (
    <>
      {value > 0 && <AmountTable rows={rows} open always />}
      <Reveal follow show={tdsCan && tdsOnIt && value > 0}>
        <Note className="text-chestnut/70">
          {t(kind === "interestReceived" ? "tdsNote194A" : "tdsNote194Q")}
        </Note>
      </Reveal>
    </>
  );
  const onPhone = value > 0 && (tdsCan || hasBreakdown(rows));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-6">
        <div className="flex min-w-0 flex-col gap-4">
          {/* what's owed, in a box like a deposit's cash in hand, as soon as something is owed */}
          {dueShown !== null && (
            <div className="min-w-0">
              <AmountBox icon={HandCoins} label={t("due")} amount={dueShown} />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-4">
            {interestCalc ? (
              // interest on a loan we gave: the months, and what they come to (or a figure typed from a statement)
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-end gap-x-6">
                <label className="flex flex-col gap-2.5 text-xs font-semibold">
                  {tpf("months")}
                  <NumberInput
                    value={interestTyped !== null ? "" : interestMonths}
                    onChange={(v) => {
                      setInterestTyped(null);
                      setInterestMonths(v !== "" && Number(v) < 1 ? "1" : v);
                    }}
                    maxDigits={3}
                    max={120}
                    placeholder="--"
                    className={cn(input(false), "min-h-11 tabular")}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
                  {tpf("interestDue")}
                  <span className={cn("relative block", interestDue > 0 && "text-ivory")}>
                    <IndianRupee
                      className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
                      aria-hidden
                    />
                    <NumberInput
                      value={interestTyped ?? (interestWorked > 0 ? String(interestWorked) : "")}
                      onChange={setInterestTyped}
                      decimals={2}
                      maxDigits={13}
                      placeholder="0"
                      aria-invalid={(tried && interestDue === 0) || undefined}
                      className={cn(
                        input(tried && interestDue === 0),
                        "min-h-11 pl-10 font-heading text-2xl font-bold",
                        interestDue > 0 && "bg-chestnut text-ivory caret-ivory shadow-none",
                      )}
                    />
                  </span>
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {/* the amount */}
                <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
                  <span>
                    {tc("q.amount")}
                    <RequiredMark />
                  </span>
                  {/* a chestnut fill once there's an amount */}
                  <div className={filled ? "text-ivory [&_button]:text-ivory" : undefined}>
                    <MicField onText={(said) => saidAmount(said, typeAmount)}>
                      <IndianRupee
                        className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
                        aria-hidden
                      />
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
                          "min-h-11 pl-10 pr-11 font-heading text-2xl font-bold",
                          filled && "bg-chestnut text-ivory caret-ivory shadow-none",
                        )}
                      />
                    </MicField>
                  </div>
                </label>
                {/* on a phone the breakdown right under the amount (wider screens: on the right) */}
                {onPhone && <div className="flex flex-col gap-2.5 sm:hidden">{breakdown}</div>}
                {/* an advance they already have with us, before anything's typed */}
                <Reveal follow show={heldAdvance > 0 && advance === 0} gap="0.625rem">
                  <Note className="tabular text-chestnut/70">
                    {t("heldAdvance", { amount: rupees(heldAdvance) })}
                  </Note>
                </Reveal>
              </div>
            )}
            {loanOver && (
              <FieldMessage className="mt-0">
                {tc("problems.loanLeft", { left: rupees(loan!.left) })}
              </FieldMessage>
            )}

            {/* interest: on a phone its breakdown under its figures (wider screens: on the right) */}
            {interestCalc && onPhone && (
              <div className="flex flex-col gap-2.5 sm:hidden">{breakdown}</div>
            )}
          </div>

          {/* where it came into, in this same card, under the amount */}
          <div className="flex min-w-0 flex-col gap-2.5">
            <h3 className="text-xs font-semibold">{t("steps.into")}</h3>
            <ReceivedInto part="top" />
          </div>
        </div>
        {/* wider screens: the amount's breakdown on the right, always there once there's an amount; raised so its
            Breakup heading sits level with the card's */}
        <div className="hidden min-w-0 flex-col gap-2.5 sm:-mt-7 sm:flex">{breakdown}</div>
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
                <Switch on={tdsOnIt} onFlip={setTdsOnIt} labelledBy={tdsLabel} />
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
