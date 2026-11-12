"use client";

import { ChevronDown, IndianRupee, Pencil } from "lucide-react";
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
import { DuePie, type PiePart } from "./due-pie";
import { PaidFrom } from "./paid-from";

export function AmountCard() {
  const {
    t,
    tc,
    tp,
    into,
    capNote,
    setCapNote,
    amount,
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
  const filling = value > 0 && !tooMuch;
  // the box's look once there's an amount (chestnut, no shadow), and its ₹ and mic with it
  const filledBox = filling && "bg-chestnut text-ivory caret-ivory shadow-none";
  // a typed amount's breakup rows: the amount, any TDS and reverse-charge GST, the total (a due settled and an
  // advance, which follow the total, are the pie's to show)
  const typedRows = amountRows();
  const totalAt = typedRows.findIndex((r) => r.tone === "total");
  // the pie's two parts, the see-through one first and the chestnut one last. A payment that leaves an advance: what
  // was due, and the advance. One that doesn't, where something is owed (a supplier, a loan, a tax): what's still due
  // after it, and what it settles. A part of nothing is left out
  const settled = dueShown === null ? 0 : Math.min(settlesTotal, dueShown);
  const pieParts: PiePart[] = (
    value <= 0
      ? []
      : advance > 0
        ? [
            { key: "due", name: t("due"), amount: weOwe, filled: false },
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
              { key: "settled", name: t("settledPart"), amount: settled, filled: true },
            ]
          : []
  ).filter((part) => part.amount > 0);
  // a row of the amount's part: its name on the left, its box on the right with what's typed at its right end, as a
  // bank card's amount
  const row = (label: React.ReactNode, control: React.ReactNode, htmlFor?: string) => (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <label htmlFor={htmlFor} className="min-w-0 text-sm">
        {label}
      </label>
      <div
        className={cn("w-[60%] shrink-0 [&_input]:text-right", filling && "[&_button]:text-ivory")}
      >
        {control}
      </div>
    </div>
  );
  // the ₹ inside an amount's box, ivory once it's filled
  const rupeeMark = (
    <IndianRupee
      className={cn(
        "pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2",
        filling && "text-ivory",
      )}
      aria-hidden
    />
  );
  // where every problem and note about a value goes: under the value side, starting at the boxes' left edge
  const underValue = "ml-auto w-[60%]";
  // the amount's box: large and bold, chestnut once filled
  const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular";
  return (
    // on a phone one column; on a wider screen the due, the amount (TDS, PAN) and its breakup on the left, the due's
    // pie on the right; then where it's paid from the full width. Every kind of payment the same: rent and interest
    // only add their months (and rent its godowns, above) and work their amount out
    <div className="flex flex-col gap-4">
      {rentCalc && <div className="min-w-0 sm:w-[calc(50%-0.75rem)]">{rentBreakdown()}</div>}
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2.5">
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
                t("months"),
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
                t("months"),
                <NumberInput
                  id="months-field"
                  value={interestTyped !== null ? "" : interestMonths}
                  onChange={(v) => {
                    setInterestTyped(null);
                    setInterestMonths(atLeastOne(v));
                  }}
                  maxDigits={3}
                  max={120}
                  placeholder="--"
                  className={cn(input(false), "tabular")}
                />,
                "months-field",
              )}
            {/* the amount: rent's worked out from the months, interest's worked out but can be typed over, any other
                typed (or spoken) */}
            {rentCalc
              ? row(
                  <>
                    {tc("q.amount")}
                    <RequiredMark />
                  </>,
                  <output
                    className={cn(
                      input(tried && calcDue === 0),
                      "relative flex items-center justify-end break-all",
                      amountBox,
                      calcDue > 0 && "bg-chestnut text-ivory shadow-none",
                    )}
                  >
                    {rupeeMark}
                    {rupees(calcDue).replace("₹ ", "")}
                  </output>,
                )
              : interestCalc
                ? row(
                    <>
                      {t("interestDue")}
                      <RequiredMark />
                    </>,
                    <span className="relative block">
                      {rupeeMark}
                      <NumberInput
                        id="amount-field"
                        value={interestTyped ?? (interestWorked > 0 ? String(interestWorked) : "")}
                        onChange={setInterestTyped}
                        decimals={2}
                        maxDigits={13}
                        placeholder="0"
                        aria-invalid={(tried && calcDue === 0) || tooMuch || undefined}
                        className={cn(
                          input((tried && calcDue === 0) || tooMuch),
                          amountBox,
                          filledBox,
                        )}
                      />
                    </span>,
                    "amount-field",
                  )
                : row(
                    <>
                      {tc("q.amount")}
                      <RequiredMark />
                    </>,
                    <MicField onText={(said) => saidAmount(said, typeAmount)}>
                      {rupeeMark}
                      <NumberInput
                        id="amount-field"
                        value={amount}
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
                          filledBox,
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
            {value > 0 && <PlainRows rows={typedRows.slice(1, totalAt + 1)} />}
            {/* a phone: the due's pie under the total, in the middle (wider screens: on the right) */}
            {pieParts.length > 0 && (
              <div className="flex justify-center pt-3 sm:hidden">
                <DuePie parts={pieParts} />
              </div>
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
        {/* wider screens: a pie of the due, its circle a little left of the right half's middle. With an advance:
            the advance its chestnut slice, what was due the see-through rest. Without: what the payment settles the
            chestnut slice, what's still due the see-through rest */}
        {pieParts.length > 0 && (
          <div className="hidden min-w-0 items-center justify-center self-stretch sm:flex">
            <DuePie parts={pieParts} />
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
    return [
      { key: "paid", label: tc("sum.amount"), amount: value },
      ...(tdsApplies
        ? [
            {
              key: "tds",
              label: (
                <span>
                  {tc("sum.tds")}
                  {tdsAmount > 0 && ` ${tdsRate}%`}
                  {tdsAmount > 0 && noPan && (
                    <span className="block text-xs opacity-70">{t("noPan")}</span>
                  )}
                </span>
              ),
              amount: tdsKnown ? tdsAmount : null,
            },
          ]
        : []),
      ...(tax?.rcm || rcmOpen
        ? [
            {
              key: "rcm",
              label: t("rcmRow", { rate: tax?.rcm?.rate ?? 18 }),
              amount: tax?.rcm ? tax.rcm.gst : null,
            },
          ]
        : []),
      { key: "total", label: t("total"), amount: total, tone: "total" as const },
      ...(advance > 0 && weOwe > 0 ? [{ key: "due", label: t("due"), amount: weOwe }] : []),
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
      // right end and Save beside it, then the rate a PAN brings
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
            {!panGiven && (
              <span className="text-xs opacity-70">
                {/* the rate once a PAN is given: a supplier's 0.1%, interest, rent and professional fees 10%,
                    brokerage 2%, contract work 1% (individual or HUF) or 2% */}
                {t("panHint", {
                  rate: tdsInfo
                    ? "0.1"
                    : headTds === "brokerage"
                      ? "2"
                      : headTds === "contract"
                        ? "1–2"
                        : "10",
                })}
              </span>
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
