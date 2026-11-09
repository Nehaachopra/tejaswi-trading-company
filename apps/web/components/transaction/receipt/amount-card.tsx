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

import { type AmountRow, AmountTable, BreakdownButton, hasBreakdown } from "../shared/amount-table";
import { AmountBox } from "../shared/amount-box";
import { ReceivedInto } from "./received-into";
import { input, saidAmount } from "./shared";
import { useReceiptEntry } from "./state";

// the Amount card: on a phone one column; on a wider screen the amount (what's owed, the TDS they deducted, the
// breakdown) on the left and where it came into on the right, starting level
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
    breakdownOpen,
  } = useReceiptEntry();
  const rows = useAmountRows();
  // the amount's breakdown (by itself once there's TDS or an advance, else from the arrow): what came in, the TDS they deducted (its switch in the row), the
  // total, and of it the due and the advance; then the TDS's section once it's on
  const breakdown = (
    <>
      {value > 0 && <AmountTable rows={rows} open={breakdownOpen} always={tdsCan} />}
      <Reveal follow show={tdsCan && tdsOnIt && value > 0}>
        <Note className="text-chestnut/70">
          {t(kind === "interestReceived" ? "tdsNote194A" : "tdsNote194Q")}
        </Note>
      </Reveal>
    </>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-6">
      {/* the due (or cash in hand) in a row of its own on top; under it the amount on the left and where the money goes
          on the right, both starting level. One column on a phone */}
      {/* what's owed, in a box like a deposit's cash in hand, as soon as something is owed */}
      {dueShown !== null && (
        <div className="min-w-0 sm:col-start-1">
          <AmountBox icon={HandCoins} label={t("due")} amount={dueShown} />
        </div>
      )}
      <div className={cn("flex min-w-0 flex-col gap-4", dueShown !== null && "sm:col-start-1 sm:row-start-2")}>
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
                className={cn(input(false), "min-h-14 tabular")}
              />
            </label>
            <WithBreakdown>
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
                      "min-h-14 pl-10 font-heading text-2xl font-bold",
                      interestDue > 0 && "bg-chestnut text-ivory caret-ivory",
                    )}
                  />
                </span>
              </label>
            </WithBreakdown>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <WithBreakdown>
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
                        "min-h-14 pl-10 pr-11 font-heading text-2xl font-bold",
                        filled && "bg-chestnut text-ivory caret-ivory",
                      )}
                    />
                  </MicField>
                </div>
              </label>
            </WithBreakdown>
            {/* the breakdown right under the amount */}
            {breakdown}
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

        {/* interest has no due bar: its breakdown goes under its figures */}
        {interestCalc && breakdown}
      </div>

      {/* where it came into, in this same card */}
      <div className={cn("flex min-w-0 flex-col gap-2.5", dueShown !== null && "sm:col-start-2 sm:row-start-2")}>
        <h3 className="text-xs font-semibold">{t("steps.into")}</h3>
        <ReceivedInto />
      </div>
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

// an amount's field with the breakdown's arrow beside it, only to reach the TDS switch they could set while nothing
// else needs breaking down (once something does, the breakdown shows by itself)
function WithBreakdown({ children }: { children: React.ReactNode }) {
  const { value, tdsCan, breakdownOpen, setBreakdownOpen } = useReceiptEntry();
  const rows = useAmountRows();
  if (value === 0 || !tdsCan || hasBreakdown(rows)) return <>{children}</>;
  return (
    <div className="flex min-w-0 items-end gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      <BreakdownButton open={breakdownOpen} onToggle={() => setBreakdownOpen((o) => !o)} />
    </div>
  );
}
