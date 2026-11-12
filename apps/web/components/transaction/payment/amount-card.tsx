"use client";

import { ChevronDown, IndianRupee, Pencil } from "lucide-react";
import { useState } from "react";
import { Note } from "~/components/ui/note";
import { Reveal } from "~/components/ui/reveal";
import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { type AmountRow, PlainRows } from "../shared/amount-table";
import { LABOUR_SKIP_MAX, input, saidAmount } from "./shared";
import { usePaymentEntry } from "./state";
import { FailNote, CapWarning } from "./notes";
import { PaidFrom } from "./paid-from";

export function AmountCard() {
  const {
    t,
    tc,
    tp,
    into,
    capNote,
    setCapNote,
    kind,
    pan,
    setPan,
    savedPan,
    panEditing,
    setPanEditing,
    panLeft,
    setPanLeft,
    panTypedOk,
    savePan,
    showPan,
    setPayeeSkipped,
    loan,
    rentMonths,
    setRentMonths,
    setRentEdits,
    editingRent,
    setEditingRent,
    tried,
    value,
    cashHeld,
    pickedHeld,
    held,
    headTds,
    skipped,
    panGiven,
    panBad,
    tdsInfo,
    tax,
    tdsAmount,
    tdsRate,
    noPan,
    tdsApplies,
    tdsKnown,
    total,
    interestMonths,
    setInterestMonths,
    interestTyped,
    setInterestTyped,
    typeAmount,
    billText,
    tdsPossible,
    keyedAmount,
    interestCalc,
    rentRows,
    rentOf,
    atLeastOne,
    monthlyRent,
    rentCalc,
    rentOk,
    rentOpen,
    setRentOpen,
    interestWorked,
    calcDue,
    mostHeld,
    tooMuch,
    rcmOpen,
    fitsFailed,
    retryFits,
    cashOver,
    bankOver,
    amountOver,
    loanOver,
    dueShown,
    settlesTotal,
    weOwe,
    heldAdvance,
    advance,
    cap,
    taxFailed,
    retryTax,
    show,
  } = usePaymentEntry();
  // the amount's breakdown (paid, any TDS and reverse-charge GST, the total, a due and an advance), then how the TDS
  // and GST were worked out. `always`: there once there's an amount (on the right, wider screens); otherwise only
  // once there's something to break down (under the amount, on a phone)
  const breakdownNotes = (
    <>
      <Reveal follow show={value > 0 && !!tax?.declared}>
        <Note className="text-chestnut/70">{t("declaredNoTds")}</Note>
      </Reveal>
      <Reveal follow show={value > 0 && !!tax?.bill}>
        {tax?.bill && (
          <Note className="tabular text-chestnut/70">
            {t("billNote", { rate: tax.bill.rate, gst: rupees(tax.bill.gst) })}
          </Note>
        )}
      </Reveal>
    </>
  );
  // the bill's box stays a plain field once filled; the chestnut fill is To pay's, what actually leaves cash or the bank
  // a typed amount's breakup rows: the bill, any TDS, To pay and reverse-charge GST
  const typedRows = amountRows();
  const payRow = typedRows.find((r) => r.key === "pay")!;
  // the bill (what's typed, or rent and interest worked out): To pay and the TDS make it up
  const bill = Math.round((total - (tax?.rcm?.gst ?? 0)) * 100) / 100;
  const billLabel = interestCalc ? t("interestDue") : t("billAmount");
  // reverse-charge GST on top (or still being worked out): the Total cost then differs from the bill
  const hasRcm = !!tax?.rcm || rcmOpen;
  // the Total cost, folded to its figure until opened
  const [costOpen, setCostOpen] = useState(false);
  // what this payment goes towards: the due (as much as was owed), and the advance past it. Only where something was
  // owed or an advance is left
  const settled = dueShown === null ? 0 : Math.min(settlesTotal, dueShown);
  // what was owed before it, and how much of that it clears (all of it when it leaves an advance)
  const owedBefore = advance > 0 ? weOwe : (dueShown ?? 0);
  const settledOf = advance > 0 ? weOwe : settled;
  const dueRows: AmountRow[] =
    value > 0 && (dueShown !== null || advance > 0)
      ? [
          // how this payment splits: towards what was owed, and past it as an advance
          { key: "due", label: t("due"), amount: settledOf },
          { key: "advance", label: t("advancePart"), amount: advance },
          // how much of what was owed this payment clears (only when something was owed)
          ...(owedBefore > 0
            ? [
                {
                  key: "paid",
                  label: t("paidShare"),
                  amount: null,
                  text: `${Math.min(100, Math.round((settledOf / owedBefore) * 100))}%`,
                },
              ]
            : []),
        ]
      : [];
  const hasDue = dueRows.length > 0;
  // the due, folded to what's left (or the advance) until opened
  const [dueOpen, setDueOpen] = useState(false);
  // a row of the amount's part: its name on the left, its box on the right with what's typed at its right end, as a
  // bank card's amount
  const row = (label: React.ReactNode, control: React.ReactNode, htmlFor?: string) => (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <label htmlFor={htmlFor} className="min-w-0 text-sm">
        {label}
      </label>
      <div className="w-[60%] shrink-0 [&_input]:text-right">{control}</div>
    </div>
  );
  // a value that's worked out, not typed (rent's bill, interest): a row like TDS's, its name on the left and the figure
  // on the right, no box; `after` sits beside the figure (interest's pen)
  const plainRow = (label: React.ReactNode, figure: string, after?: React.ReactNode) => (
    <div className="tabular flex min-h-11 min-w-0 items-center justify-between gap-3 text-sm">
      <span className="min-w-0">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="whitespace-nowrap text-base font-semibold">{figure}</span>
        {after}
      </span>
    </div>
  );
  // interest's figure being typed over (from a statement): the pen beside it opens its box
  const [editingInterest, setEditingInterest] = useState(false);
  // the ₹ inside an amount's box
  const rupeeMark = (
    <IndianRupee
      className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2"
      aria-hidden
    />
  );
  // where every problem and note about a value goes: under the value side, starting at the boxes' left edge
  const underValue = "ml-auto w-[60%]";
  // the amount's box: large and bold, chestnut once filled
  const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular";
  // the Total cost: its heading and figure with ▾, opening to the bill and the reverse-charge GST on top
  // a sum apart from the Payment, as a tinted group: folded, its heading and figure with ▾; open, how it's made up
  const foldGroup = (
    title: string,
    figure: number,
    body: React.ReactNode,
    open: boolean,
    setOpen: (open: boolean) => void,
  ) => (
    <div className="-mx-3 flex flex-col rounded-control bg-chestnut/6 px-3 py-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="tabular flex min-h-11 items-center justify-between gap-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
          {title}
        </span>
        <span className="flex items-center gap-2">
          {!open && <span className="font-heading text-lg font-bold">{rupees(figure)}</span>}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>
      <Reveal show={open} gap="0px">
        <div className="pb-2.5">{body}</div>
      </Reveal>
    </div>
  );
  // the Total cost: the bill and the reverse-charge GST on top
  const costGroup = foldGroup(
    t("costGroup"),
    total,
    <PlainRows
      rows={[
        { key: "bill", label: billLabel, amount: bill },
        ...typedRows.filter((r) => r.key === "rcm"),
        { key: "total", label: t("total"), amount: total, tone: "total" },
      ]}
    />,
    costOpen,
    setCostOpen,
  );
  // what the payment goes towards: folded to the payment, open to its due part, its advance and the share of the due
  // it clears
  const dueFlow = (
    <div className="tabular flex flex-col text-sm">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span>{t("payGroup")}</span>
        <span className="font-heading text-lg font-bold">{rupees(settlesTotal)}</span>
      </div>
      {/* the lines leave from under the payment's name and end at Due and Advance (each row 32px, 2px apart) */}
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)]">
        <svg viewBox="0 0 28 68" className="h-[68px] w-7 overflow-visible" aria-hidden>
          <path
            d="M8 0 V 12 Q 8 20, 16 20 H 26"
            className="fill-none stroke-chestnut/55"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <path
            d="M8 0 V 46 Q 8 54, 16 54 H 26"
            className="fill-none stroke-chestnut/55"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
        <div className="flex flex-col gap-0.5 pt-1">
          {dueRows
            .filter((r) => r.key === "due" || r.key === "advance")
            .map((r) => (
              <div key={r.key} className="flex h-8 items-center justify-between gap-3">
                <span>{r.label}</span>
                <span className="text-base font-semibold">{rupees(r.amount ?? 0)}</span>
              </div>
            ))}
        </div>
      </div>
      {/* how much of what was owed it clears */}
      {dueRows
        .filter((r) => r.key === "paid")
        .map((r) => (
          <div
            key={r.key}
            className="mt-1 flex min-h-8 items-center justify-between gap-3 border-t border-chestnut/15 pt-1"
          >
            <span>{r.label}</span>
            <span className="text-base font-semibold">{r.text}</span>
          </div>
        ))}
    </div>
  );
  const dueGroup = foldGroup(t("towardsGroup"), settlesTotal, dueFlow, dueOpen, setDueOpen);
  return (
    // on a phone one column; on a wider screen the due, the amount (TDS, PAN) and its breakup on the left, the Total
    // cost and the due on the right; then where it's paid from the full width. Every kind of payment the same: rent and interest
    // only add their months (and rent its godowns, above) and work their amount out
    <div className="flex flex-col gap-4">
      {rentCalc && <div className="min-w-0 sm:w-[calc(50%-1.5rem)]">{rentBreakdown()}</div>}
      {/* wider screens, two rows: on top the due, PAN, months and the bill (left); under them the Payment (left)
          level with the Total cost and the due (right) */}
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-12">
        <div className="flex min-w-0 flex-col gap-4 sm:contents">
          <div className="flex min-w-0 flex-col gap-2.5 sm:col-start-1 sm:row-start-1">
            {/* what's owed on the supplier, loan, landlord or tax, as soon as something is owed; room under it */}
            {dueShown !== null && (
              <div className="tabular mb-2 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">{t("due")}</span>
                <span className="shrink-0 whitespace-nowrap text-base font-semibold">
                  {rupees(dueShown)}
                </span>
              </div>
            )}
            {/* their PAN, where TDS applies and there's none on record: first, set well apart from the amount below */}
            {panField()}
            {/* rent and interest: how many months */}
            {rentCalc &&
              row(
                <>
                  {t("months")}
                  <RequiredMark />
                </>,
                <NumberInput
                  id="months-field"
                  value={rentMonths}
                  onChange={(v) => setRentMonths(atLeastOne(v))}
                  maxDigits={3}
                  max={120}
                  aria-invalid={(tried && Number(rentMonths) < 1) || undefined}
                  className={cn(input(tried && Number(rentMonths) < 1), "tabular")}
                />,
                "months-field",
              )}
            {interestCalc &&
              row(
                <>
                  {t("months")}
                  <RequiredMark />
                </>,
                <NumberInput
                  id="months-field"
                  value={interestTyped !== null ? "" : interestMonths}
                  onChange={(v) => {
                    setInterestTyped(null);
                    setEditingInterest(false);
                    setInterestMonths(atLeastOne(v));
                  }}
                  maxDigits={3}
                  max={120}
                  placeholder="--"
                  aria-invalid={(tried && calcDue === 0 && interestTyped === null) || undefined}
                  className={cn(input(tried && calcDue === 0 && interestTyped === null), "tabular")}
                />,
                "months-field",
              )}
            {/* the amount: rent's worked out from the months, interest's worked out but can be typed over, any other
                typed (or spoken) */}
            {rentCalc
              ? null
              : interestCalc
                ? editingInterest || interestTyped !== null
                  ? row(
                      t("interestDue"),
                      <span className="relative block">
                        {rupeeMark}
                        <NumberInput
                          id="amount-field"
                          autoFocus={editingInterest}
                          value={
                            interestTyped ?? (interestWorked > 0 ? String(interestWorked) : "")
                          }
                          onChange={setInterestTyped}
                          decimals={2}
                          maxDigits={13}
                          placeholder="0"
                          aria-invalid={(tried && calcDue === 0) || tooMuch || undefined}
                          className={cn(input((tried && calcDue === 0) || tooMuch), amountBox)}
                        />
                      </span>,
                      "amount-field",
                    )
                  : plainRow(
                      t("interestDue"),
                      rupees(calcDue),
                      <button
                        type="button"
                        onClick={() => setEditingInterest(true)}
                        aria-label={t("interestDue")}
                        className="-my-2 grid size-9 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </button>,
                    )
                : row(
                    <>
                      {tdsPossible ? t("billAmount") : tc("q.amount")}
                      <RequiredMark />
                    </>,
                    <MicField onText={(said) => saidAmount(said, typeAmount)}>
                      {rupeeMark}
                      <NumberInput
                        id="amount-field"
                        value={billText}
                        onChange={(v) => {
                          setCapNote(null);
                          keyedAmount.current = v;
                          typeAmount(v);
                        }}
                        onCapped={(most) =>
                          setCapNote(
                            // labour with nobody named, cut at its limit: the warning links to naming them instead
                            skipped && most === LABOUR_SKIP_MAX
                              ? { key: "labour", text: "" }
                              : { key: "amount", text: t("capOnly", { amount: rupees(most) }) },
                          )
                        }
                        decimals={2}
                        maxDigits={13}
                        max={cap}
                        placeholder="0"
                        aria-invalid={amountOver || tooMuch || (tried && value === 0) || undefined}
                        className={cn(
                          input(amountOver || tooMuch || (tried && value === 0)),
                          amountBox,
                          "pr-12",
                        )}
                      />
                    </MicField>,
                    "amount-field",
                  )}
            <CapWarning at="amount" className={underValue} />
            {/* labour cut at the limit for nobody named: past it needs the labourer's details, a tap away */}
            {capNote?.key === "labour" && (
              <FieldMessage tone="warning" className={cn("mt-0", underValue)}>
                {t("labourOver", { amount: rupees(LABOUR_SKIP_MAX) })}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setCapNote(null);
                    setPayeeSkipped(false);
                    show("payee");
                  }}
                  className="font-semibold underline underline-offset-2"
                >
                  {t("namePayee")}
                </button>
              </FieldMessage>
            )}
            {/* the rest of the breakup once there's an amount: any TDS and reverse-charge GST, the total; then how the
                TDS and GST were worked out */}
          </div>
          <div className="flex min-w-0 flex-col gap-4 sm:col-start-1 sm:row-start-2">
            <div className="flex flex-col gap-2.5">
              {/* once there's a bill, two sums apart: the Payment (the bill, the TDS taken out of it, then To pay, what
                leaves cash or the bank, in the chestnut box), then the Total cost (the bill and the reverse-charge GST we
                pay on top), folded to its figure until opened */}
              {value > 0 && (
                <>
                  <div className="-mx-3 flex flex-col gap-1 rounded-control bg-chestnut/6 px-3 py-2.5">
                    {(tdsApplies || hasRcm) && (
                      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
                        {t("payGroup")}
                      </h3>
                    )}
                    {(tdsApplies || hasRcm) && (
                      <PlainRows
                        rows={[
                          { key: "bill", label: billLabel, amount: bill },
                          ...typedRows.filter((r) => r.key === "tds"),
                        ]}
                      />
                    )}
                    <div
                      className={cn(
                        (tdsApplies || hasRcm) && "mt-1 border-t border-chestnut/30 pt-2",
                      )}
                    >
                      {row(
                        <span className="font-bold">{payRow.label}</span>,
                        <span className="tabular flex min-h-12 items-center justify-end break-all rounded-control bg-chestnut px-3.5 font-heading text-xl font-bold text-ivory">
                          {rupees(value)}
                        </span>,
                      )}
                    </div>
                  </div>
                  {/* a phone: the Total cost and the due under the Payment (wider screens: on the right) */}
                  {hasRcm && <div className="sm:hidden">{costGroup}</div>}
                  {hasDue && <div className="sm:hidden">{dueGroup}</div>}
                </>
              )}
              {breakdownNotes}
              {/* an advance we already have with them, before anything's typed */}
              <Reveal follow show={heldAdvance > 0 && advance === 0} gap="0.625rem">
                <Note className="tabular text-chestnut/70">
                  {t("heldAdvance", { amount: rupees(heldAdvance) })}
                </Note>
              </Reveal>
            </div>
            {taxFailed && (
              <div className={underValue}>
                <FailNote text={t("taxFailed")} retry={retryTax} />
              </div>
            )}
            {fitsFailed && (
              <div className={underValue}>
                <FailNote text={t("fitsFailed")} retry={retryFits} />
              </div>
            )}
            {tooMuch && mostHeld !== null && (
              <FieldMessage className={cn("mt-0", underValue)}>
                {t("tooMuch", { amount: rupees(mostHeld) })}
              </FieldMessage>
            )}
            {amountOver && !tooMuch && (
              <FieldMessage className={cn("mt-0", underValue)}>{overMessage()}</FieldMessage>
            )}
            {loanOver && (
              <FieldMessage className={cn("mt-0", underValue)}>
                {tc("problems.loanLeft", { left: rupees(loan!.left) })}
              </FieldMessage>
            )}
            {/* the EMI in one tap */}
            {kind === "loanRepaid" &&
              loan?.emiAmount != null &&
              loan.emiAmount <= loan.left &&
              value !== loan.emiAmount && (
                <button
                  type="button"
                  onClick={() => typeAmount(String(loan.emiAmount))}
                  className={ADD_ON_IVORY}
                >
                  {t("payEmi", { amount: rupees(loan.emiAmount) })}
                </button>
              )}
          </div>
        </div>
        {/* wider screens, the right side of the second row: the Total cost and the due, level with the Payment */}
        {value > 0 && (hasRcm || hasDue) && (
          <div className="hidden min-w-0 flex-col gap-4 sm:col-start-2 sm:row-start-2 sm:flex">
            {hasRcm && costGroup}
            {hasDue && dueGroup}
          </div>
        )}
      </div>
      {/* where it's paid from: a card for each place (cash, a bank account), its UPI ID, the cash warning, the card's
          full width */}
      <PaidFrom />
    </div>
  );

  // the Amount card: the amount, what stops it, the buttons this payment has, and where it's paid from
  // the rows of the amount's breakup
  function amountRows(): AmountRow[] {
    // To pay and the total are the same: no TDS taken out, no reverse-charge GST on top
    const payIsTotal = Math.abs(total - value) < 0.005;
    // the rate once a PAN is given: a supplier's 0.1%, interest, rent and professional fees 10%, brokerage 2%, contract
    // work 1% (individual or HUF) or 2%
    const panRate = tdsInfo
      ? "0.1"
      : headTds === "brokerage"
        ? "2"
        : headTds === "contract"
          ? "1–2"
          : "10";
    return [
      // the bill (its box is above the rows)
      { key: "bill", label: tc("q.amount"), amount: total - (tax?.rcm?.gst ?? 0) },
      // the TDS taken out of it
      ...(tdsApplies
        ? [
            {
              key: "tds",
              minus: true,
              label: (
                <span>
                  {tc("sum.tds")}
                  {tdsAmount > 0 && ` ${tdsRate}%`}
                  {/* no PAN: what giving one brings it down to */}
                  {tdsAmount > 0 && noPan && !panGiven && (
                    <span className="block text-xs opacity-70">
                      {t("panHint", { rate: panRate })}
                    </span>
                  )}
                </span>
              ),
              amount: tdsKnown ? tdsAmount : null,
            },
          ]
        : []),
      // what's handed over: the bill less the TDS; one row "To pay / Total" when nothing comes out or goes on top
      {
        key: "pay",
        label: payIsTotal ? `${t("toPay")} / ${t("total")}` : t("toPay"),
        amount: value,
        tone: "total" as const,
      },
      // reverse-charge GST: on top, paid by us to the government, not to them
      ...(tax?.rcm || rcmOpen
        ? [
            {
              key: "rcm",
              plus: true,
              label: t("rcmRow", { rate: tax?.rcm?.rate ?? 18 }),
              amount: tax?.rcm ? tax.rcm.gst : null,
            },
          ]
        : []),
    ];
  }

  // rent, on the Amount card: each godown's rent a month on top (the pen changes it for this payment; many rows scroll)
  // with their total, then the months on the left and what they come to on the right, in the amount's chestnut box
  function rentBreakdown() {
    const breakupOpen =
      rentOpen || (tried && !rentOk) || rentRows.some((row) => Number(rentOf(row)) < 1);
    return (
      <>
        {/* godown by godown, opened above the total rent a month, which comes last */}
        <div className="flex min-w-0 flex-col rounded-control px-3 text-sm shadow-[0_0_5px_0] shadow-chestnut/25">
          {breakupOpen && (
            <div className="flex min-w-0 flex-col border-b-2 border-chestnut/40">
              <div className="flex justify-between gap-4 py-2 text-xs font-semibold">
                <span>{t("godown")}</span>
                <span>{t("rentPerMonth")}</span>
              </div>
              <div className="max-h-64 overflow-y-auto overflow-x-hidden">
                {rentRows.map((row) => {
                  const typing = editingRent === row.id || Number(rentOf(row)) < 1;
                  const low = tried && rentOf(row) === "";
                  return (
                    <div
                      key={row.id}
                      className="flex min-h-12 min-w-0 items-center gap-2 border-t border-chestnut/15 py-1"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>
                      {typing ? (
                        <NumberInput
                          autoFocus={editingRent === row.id}
                          value={rentOf(row)}
                          onChange={(v) =>
                            setRentEdits((all) => ({ ...all, [row.id]: atLeastOne(v) }))
                          }
                          onBlur={() => setEditingRent(null)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && (e.preventDefault(), setEditingRent(null))
                          }
                          decimals={2}
                          maxDigits={13}
                          placeholder="0"
                          aria-label={row.name}
                          aria-invalid={low || undefined}
                          className={cn(input(low), "tabular w-36 shrink-0 text-right")}
                        />
                      ) : (
                        <>
                          <span className="tabular min-w-0 break-all text-right">
                            {rupees(Number(rentOf(row)))}
                          </span>
                          <button
                            type="button"
                            aria-label={`${t("rentPerMonth")}: ${row.name}`}
                            onClick={() => setEditingRent(row.id)}
                            className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
                          >
                            <Pencil className="size-4" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <button
            type="button"
            aria-expanded={breakupOpen}
            onClick={() => setRentOpen(!breakupOpen)}
            className="flex min-h-12 min-w-0 items-center justify-between gap-3 text-left font-semibold"
          >
            <span>{t("totalRentPerMonth")}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="tabular min-w-0 break-all text-right">{rupees(monthlyRent)}</span>
              <ChevronDown
                className={cn("size-4 shrink-0 transition-transform", breakupOpen && "rotate-180")}
                aria-hidden
              />
            </span>
          </button>
        </div>
      </>
    );
  }

  // their PAN, where having none is costing them: it takes effect as soon as it's complete, and stays on their record
  function panField() {
    if (!showPan) return null;
    // Saved and not being changed: plain words, the pen under them; otherwise the box, then Save under it
    const editing = savedPan === "" || panEditing;
    // what's wrong shows once Save (or Next) is tapped: not a PAN, or typed and not Saved
    const wrong = (panLeft || tried) && panBad;
    return (
      // a row like the amount's: PAN on the left, level with its box; on the right the box with what's typed at its
      // right end and Save beside it
      <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
        <label htmlFor="pan-field" className="flex min-h-11 min-w-0 items-center text-sm">
          PAN
        </label>
        {editing ? (
          <div className="flex w-[60%] shrink-0 flex-col gap-1.5">
            {/* the box with Save right beside it */}
            <div className="flex w-full min-w-0 items-center gap-2">
              <input
                id="pan-field"
                autoFocus={panEditing}
                value={pan}
                maxLength={10}
                placeholder="ABCDE1234F"
                onChange={(e) => {
                  setPanLeft(false);
                  setPan(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase());
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), savePan())}
                aria-invalid={wrong || undefined}
                className={cn(input(wrong), "tabular text-right")}
              />
              <button
                type="button"
                onClick={savePan}
                disabled={pan === savedPan}
                className="flex min-h-11 shrink-0 items-center justify-center rounded-control bg-chestnut px-4 text-sm font-semibold text-ivory disabled:opacity-40"
              >
                {t("saveUpi")}
              </button>
            </div>
            {wrong && (
              <FieldMessage className="mt-0">
                {pan !== "" && !panTypedOk ? t("panBad") : t("panUnsaved")}
              </FieldMessage>
            )}
          </div>
        ) : (
          // Saved: no box, the PAN in plain words with the pen right beside it, at the box's right edge
          <div className="flex min-h-11 w-[60%] shrink-0 items-center justify-end gap-1 pl-3">
            <span className="tabular text-base font-medium">{savedPan}</span>
            <button
              type="button"
              onClick={() => setPanEditing(true)}
              aria-label={t("editUpi")}
              className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    );
  }

  // the amount is more than the source holds; staff, who don't see balances, aren't told how much is there
  function overMessage() {
    // from both: the part that's over, else the whole
    if (cashOver)
      return tp("problems.overBalanceBy", { held: rupees(cashHeld!), where: tp("fromCash") });
    if (bankOver)
      return tp("problems.overBalanceBy", { held: rupees(pickedHeld!), where: tp("fromBank") });
    const where = tp(into === "cash" ? "fromCash" : into === "both" ? "fromBoth" : "fromBank");
    if (held === null) return tp("problems.overBalance", { where });
    return tp("problems.overBalanceBy", { held: rupees(held), where });
  }
}
