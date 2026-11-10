"use client";

import { ChevronDown, HandCoins, IndianRupee, Pencil } from "lucide-react";
import { Note } from "~/components/ui/note";
import { Reveal } from "~/components/ui/reveal";
import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { type AmountRow, AmountTable } from "../shared/amount-table";
import { AmountBox } from "../shared/amount-box";
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
    setCapNote,
    amount,
    kind,
    pan,
    setPan,
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
    asksPan,
    tdsApplies,
    tdsKnown,
    total,
    interestMonths,
    setInterestMonths,
    interestTyped,
    setInterestTyped,
    typeAmount,
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
    weOwe,
    heldAdvance,
    advance,
    cap,
    filled,
    taxFailed,
    retryTax,
    show,
  } = usePaymentEntry();
  // the amount's breakdown (paid, any TDS and reverse-charge GST, the total, a due and an advance), then how the TDS
  // and GST were worked out. `always`: there once there's an amount (on the right, wider screens); otherwise only
  // once there's something to break down (under the amount, on a phone)
  const breakdown = (always: boolean) => (
    <>
      {value > 0 && <AmountTable rows={amountRows()} open={always} always={always} />}
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
  return (
    // on a phone one column; on a wider screen the due, the amount (TDS, PAN) and where it's paid from on the left,
    // the amount's breakdown on the right, starting level; then the Paid from breakdown the full width: the same for
    // every kind of payment. Rent's godowns come
    // above both, as wide as the left column. The QR is inside each bank account's card
    <div className="flex flex-col gap-4">
      {rentCalc && <div className="min-w-0 sm:w-[calc(50%-0.75rem)]">{rentBreakdown()}</div>}
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-6">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-col gap-4">
            {/* what's owed on the supplier, loan or tax, in a box like a deposit's cash in hand, as soon as something is owed */}
            {dueShown !== null && (
              <div className="min-w-0">
                <AmountBox icon={HandCoins} label={t("due")} amount={dueShown} />
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-4">
              {rentCalc ? (
                rentAmount()
              ) : interestCalc ? (
                <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-end gap-x-6">
                  <label className="flex flex-col gap-2.5 text-xs font-semibold">
                    {t("months")}
                    <NumberInput
                      value={interestTyped !== null ? "" : interestMonths}
                      onChange={(v) => {
                        setInterestTyped(null);
                        setInterestMonths(atLeastOne(v));
                      }}
                      maxDigits={3}
                      max={120}
                      placeholder="--"
                      className={cn(input(false), "min-h-14 tabular")}
                    />
                  </label>
                  {/* what it comes to */}
                  <div className="flex min-w-0 items-end gap-2">
                    <label className="flex min-w-0 flex-1 flex-col gap-2.5 text-xs font-semibold">
                      {t("interestDue")}
                      <span
                        className={cn("relative block", calcDue > 0 && !tooMuch && "text-ivory")}
                      >
                        <IndianRupee
                          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
                          aria-hidden
                        />
                        <NumberInput
                          value={
                            interestTyped ?? (interestWorked > 0 ? String(interestWorked) : "")
                          }
                          onChange={setInterestTyped}
                          decimals={2}
                          maxDigits={13}
                          placeholder="0"
                          aria-invalid={(tried && calcDue === 0) || tooMuch || undefined}
                          className={cn(
                            input((tried && calcDue === 0) || tooMuch),
                            "min-h-14 pl-10 font-heading text-2xl font-bold",
                            calcDue > 0 && !tooMuch && "bg-chestnut text-ivory caret-ivory",
                          )}
                        />
                      </span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {/* the amount */}
                  <div className="flex min-w-0 items-end gap-2">
                    <label className="flex min-w-0 flex-1 flex-col gap-2.5 text-xs font-semibold">
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
                            onChange={(v) => {
                              setCapNote(null);
                              typeAmount(v);
                            }}
                            onCapped={(most) =>
                              setCapNote({
                                key: "amount",
                                text: t("capOnly", { amount: rupees(most) }),
                              })
                            }
                            decimals={2}
                            maxDigits={13}
                            max={cap}
                            placeholder="0"
                            aria-invalid={
                              amountOver || tooMuch || (tried && value === 0) || undefined
                            }
                            className={cn(
                              input(amountOver || tooMuch || (tried && value === 0)),
                              "min-h-14 pl-10 pr-11 font-heading text-2xl font-bold",
                              filled && !tooMuch && "bg-chestnut text-ivory caret-ivory",
                            )}
                          />
                        </MicField>
                      </div>
                    </label>
                  </div>
                  {<CapWarning at={"amount"} />}
                  {/* their PAN, where TDS applies and there's none on record: above the breakdown it changes */}
                  {panField()}
                  {/* on a phone the breakdown right under the amount (wider screens: on the right) */}
                  <div className="flex flex-col gap-2.5 sm:hidden">{breakdown(false)}</div>
                  {/* labour with nobody named stops at the limit: naming who was paid lifts it */}
                  {skipped && (
                    <Note className="tabular text-chestnut/70">
                      {t("labourOver", { amount: rupees(LABOUR_SKIP_MAX) })}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setPayeeSkipped(false);
                          show("payee");
                        }}
                        className="font-semibold text-chestnut underline underline-offset-2"
                      >
                        {t("namePayee")}
                      </button>
                    </Note>
                  )}
                  {/* an advance we already have with them, before anything's typed */}
                  <Reveal follow show={heldAdvance > 0 && advance === 0} gap="0.625rem">
                    <Note className="tabular text-chestnut/70">
                      {t("heldAdvance", { amount: rupees(heldAdvance) })}
                    </Note>
                  </Reveal>
                </div>
              )}
              {taxFailed && <FailNote text={t("taxFailed")} retry={retryTax} />}
              {fitsFailed && <FailNote text={t("fitsFailed")} retry={retryFits} />}
              {tooMuch && mostHeld !== null && (
                <FieldMessage className="mt-0">
                  {t("tooMuch", { amount: rupees(mostHeld) })}
                </FieldMessage>
              )}
              {amountOver && !tooMuch && (
                <FieldMessage className="mt-0">{overMessage()}</FieldMessage>
              )}
              {loanOver && (
                <FieldMessage className="mt-0">
                  {tc("problems.loanLeft", { left: rupees(loan!.left) })}
                </FieldMessage>
              )}

              {/* rent and interest: their PAN (where TDS applies and there's none on record), then their breakdown */}
              {(rentCalc || interestCalc) && panField()}
              {/* rent and interest: on a phone their breakdown under their figures (wider screens: on the right) */}
              {(rentCalc || interestCalc) && (
                <div className="flex flex-col gap-2.5 sm:hidden">{breakdown(false)}</div>
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

            {/* where it's paid from, in this same card, under the amount */}
            <div className="flex min-w-0 flex-col gap-2.5">
              <h3 className="text-xs font-semibold">{t("steps.source")}</h3>
              <PaidFrom part="top" />
            </div>
          </div>
        </div>
        {/* wider screens: the amount's breakdown on the right, always there once there's an amount */}
        <div className="hidden min-w-0 flex-col gap-2.5 sm:flex">{breakdown(true)}</div>
      </div>
      {/* the breakdown of where it's paid from (a box for each place, its UPI ID, the cash warning), the card's full width */}
      <PaidFrom part="rest" />
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

  // rent's amount: the months on the left and what they come to on the right, in the amount's chestnut box
  function rentAmount() {
    return (
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-end gap-x-6">
        <label className="flex flex-col gap-2.5 text-xs font-semibold">
          {t("months")}
          <NumberInput
            value={rentMonths}
            onChange={(v) => setRentMonths(atLeastOne(v))}
            maxDigits={3}
            max={120}
            aria-invalid={(tried && Number(rentMonths) < 1) || undefined}
            className={cn(input(tried && Number(rentMonths) < 1), "min-h-14 tabular")}
          />
        </label>
        {/* what it comes to */}
        <div className="flex min-w-0 items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-xs font-semibold">
            <span>
              {tc("q.amount")}
              <RequiredMark />
            </span>
            <output
              className={cn(
                input(tried && calcDue === 0),
                "relative flex min-h-14 items-center break-all pl-10 font-heading text-2xl font-bold tabular",
                calcDue > 0 && "bg-chestnut text-ivory",
              )}
            >
              <IndianRupee
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
                aria-hidden
              />
              {rupees(calcDue).replace("₹ ", "")}
            </output>
          </div>
        </div>
      </div>
    );
  }

  // their PAN, where having none is costing them: it takes effect as soon as it's complete, and stays on their record
  function panField() {
    // only while TDS is actually taken on this payment (under the limit, a PAN changes nothing)
    if (!asksPan || !tdsApplies || (tdsAmount === 0 && pan === "")) return null;
    return (
      <label className="flex flex-col gap-2.5 text-xs font-semibold">
        PAN
        <input
          value={pan}
          maxLength={10}
          placeholder="ABCDE1234F"
          onChange={(e) => setPan(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase())}
          aria-invalid={panBad || undefined}
          className={input(panBad && (tried || pan.length === 10))}
        />
        {!panGiven && (
          <span className="text-xs font-normal opacity-70">
            {/* the rate once a PAN is given: a supplier's 0.1%, interest, rent and professional fees 10%, brokerage 2%,
                contract work 1% (individual or HUF) or 2% */}
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
      </label>
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
