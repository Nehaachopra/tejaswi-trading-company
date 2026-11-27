"use client";

import { Check, ChevronDown, IndianRupee, Info, Pencil } from "lucide-react";
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
import { DueFlow } from "../shared/fold-group";
import { DueAmount } from "./due-amount";
import { InterestAmount } from "./interest-amount";
import { PlainAmount } from "./plain-amount";
import { ExpenseAmount, type PayRow } from "./expense-amount";
import { LeftRow } from "../shared/payment-stage";

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
    typePaid,
    gstInput,
    stepName,
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
    taxOwed,
    dueShown,
    settlesTotal,
    weOwe,
    heldAdvance,
    toSupplier,
    advance,
    cap,
    taxFailed,
    retryTax,
    show,
  } = usePaymentEntry();
  // under the breakdown: why no TDS was taken (a transporter's declaration). A GST bill's GST is its own row now
  const breakdownNotes = (
    <Reveal follow show={value > 0 && !!tax?.declared}>
      <Note className="text-chestnut/70">{t("declaredNoTds")}</Note>
    </Reveal>
  );
  // the bill's box stays a plain field once filled; the chestnut fill is To pay's, what actually leaves cash or the bank
  // a typed amount's breakup rows (the TDS row is used)
  const typedRows = amountRows();
  // the bill (what's typed, or rent and interest worked out): To pay and the TDS make it up
  const bill = Math.round((total - (tax?.rcm?.gst ?? 0)) * 100) / 100;
  // an expense's amount: a bill where TDS can come out of it
  const billLabel = tdsPossible ? t("billAmount") : tc("q.amount");
  // a supplier's, as a sale's or receipt's: what's left once this payment is counted, closing the breakup: what we
  // still owe them, or (nothing owed) the advance with them, ours from before and any paid over
  const supplierDueLeft = Math.max(0, Math.round((weOwe - settlesTotal) * 100) / 100);
  const supplierAdvanceLeft = Math.round((heldAdvance + advance) * 100) / 100;
  const onAdvance = supplierDueLeft === 0 && supplierAdvanceLeft > 0;
  // a part's heading inside the card (a supplier's Due and Payment), as the card's own name reads
  const partHeading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";
  // what this payment goes towards: the due (as much as was owed), and the advance past it. Only where something was
  // owed or an advance is left
  const settled = dueShown === null ? 0 : Math.min(settlesTotal, dueShown);
  // how much of what was owed it clears (all of it when it leaves an advance)
  const settledOf = advance > 0 ? weOwe : settled;
  const hasDue = value > 0 && (dueShown !== null || advance > 0);
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
  // where every problem and note about a value goes: under the value side, starting at the boxes' left edge (a
  // supplier's sit in a row's value column already)
  const underValue = toSupplier || kind === "loanRepaid" || kind === "loanGiven" || kind === "taxPaid" || kind === "expense" || interestCalc ? "" : "ml-auto w-[60%]";
  // the amount's box: large and bold, chestnut once filled
  const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular";
  // typed past the most it can be: cut there, and the warning says why
  const capped = (most: number) =>
    setCapNote(
      // labour with nobody named, cut at its limit: the warning links to naming them instead
      skipped && most === LABOUR_SKIP_MAX
        ? { key: "labour", text: "" }
        : // a tax cut at what it owes: says so, as a loan's does
          kind === "taxPaid" && taxOwed !== null && most === taxOwed
          ? { key: "amount", text: t("taxLeft", { amount: rupees(most) }) }
          : { key: "amount", text: t("capOnly", { amount: rupees(most) }) },
    );
  // the amount's box, typed or spoken: a bill (a supplier's Repay, any other payment's amount) or, on a GST bill,
  // To pay
  const amountInput = (onType: (raw: string) => void, paid = false) => (
    <MicField onText={(said) => saidAmount(said, onType)}>{amountField(onType, paid)}</MicField>
  );
  // the box itself, ₹ and what's typed (a supplier's Repay has its mic in the row's icon column instead)
  const amountField = (onType: (raw: string) => void, paid = false) => (
    <>
      {rupeeMark}
      <NumberInput
        id="amount-field"
        value={billText}
        onChange={(v) => {
          setCapNote(null);
          keyedAmount.current = v;
          onType(v);
        }}
        onCapped={capped}
        decimals={2}
        maxDigits={13}
        max={cap}
        placeholder="0"
        aria-invalid={amountOver || tooMuch || (tried && value === 0) || undefined}
        className={cn(
          input(amountOver || tooMuch || (tried && value === 0)),
          amountBox,
          "pr-12",
          // To pay typed: chestnut once filled, as what leaves cash or the bank
          paid && value > 0 && !amountOver && !tooMuch && "bg-chestnut text-ivory caret-ivory shadow-none",
        )}
      />
    </>
  );
  const billInput = amountInput(typeAmount);
  // every payment in the same two parts, the payment under the due.
  // The due part (a supplier, a loan paid back, a tax): what's owed (a supplier's advance with them instead), the amount
  // repaid typed (a supplier's ⌄ opens what it goes towards), then what's left once it's repaid. Rent and interest have
  // theirs worked out instead: rent's godowns a month and the months, interest's months and the interest (its pen
  // types it over); an expense has only its amount.
  // The payment part: what's repaid (rent with the reverse-charge GST on it, its ⌄ opening the two), then taken off it
  // the TDS and the reverse-charge GST (that goes to the government), leaving To pay in the chestnut box
  const duePart = toSupplier || kind === "loanRepaid" || kind === "taxPaid";
  // an expense (not rent, worked out from its months; not one with reverse-charge GST): To pay is typed. On a GST bill
  // the expense and its GST (and any TDS) are worked back out of it; with TDS alone, the expense and the TDS; with
  // neither, To pay is all there is
  const gstExpense = kind === "expense" && !rentCalc && !(!!tax?.rcm || rcmOpen);
  const onGstBill = gstInput !== null;
  // an expense head that can carry TDS (professional fees, contract work…): the expense is typed instead, the TDS comes
  // out of it and To pay is what's left. Known from the head, so the box doesn't change while it's typed
  const expenseTyped = gstExpense && headTds !== null;
  // the bill's GST and what the expense is before it, once the server has worked them out
  const billGst = tax?.bill ? tax.bill.gst : null;
  const expenseBefore = billGst === null ? null : Math.round((bill - billGst) * 100) / 100;
  // what's still owed once it's repaid: a supplier's due or advance left; a loan's or a tax's due left
  const leftRow: AmountRow | null = toSupplier
    ? {
        key: "left",
        label: onAdvance ? t("advanceLeft") : t("leftDue"),
        amount: onAdvance ? supplierAdvanceLeft : supplierDueLeft,
        tone: "total",
      }
    : duePart && dueShown !== null
      ? { key: "left", label: t("leftDue"), amount: Math.max(0, Math.round((dueShown - bill) * 100) / 100), tone: "total" }
      : null;
  // the reverse-charge GST on it (rent from a landlord with no GSTIN, some expenses): known, or still being worked out
  const rcmGst = tax?.rcm ? tax.rcm.gst : null;
  const hasRcmRow = !!tax?.rcm || rcmOpen;
  // the payment part's first row: what's repaid, rent or interest worked out, or an expense's amount; with
  // reverse-charge GST, that and the GST together, its ⌄ opening the two
  const firstLabel = duePart
    ? t("repaid")
    : rentCalc
      ? t("rentDue")
      : interestCalc
        ? t("interestDue")
        : hasRcmRow
          ? t("costGroup")
          : billLabel;
  const [firstOpen, setFirstOpen] = useState(false);
  // the amount's own box (typed, or interest typed over), with its problems under it
  const amountProblems = (
    <>
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
      {fitsFailed && (
        <div className={underValue}>
          <FailNote text={t("fitsFailed")} retry={retryFits} />
        </div>
      )}
      {/* the EMI in one tap */}
      {kind === "loanRepaid" &&
        loan?.emiAmount != null &&
        loan.emiAmount <= loan.left &&
        value !== loan.emiAmount && (
          <button type="button" onClick={() => typeAmount(String(loan.emiAmount))} className={ADD_ON_IVORY}>
            {t("payEmi", { amount: rupees(loan.emiAmount) })}
          </button>
        )}
    </>
  );
  // the amount typed: a supplier's or loan's Repay (a supplier's ⌄ beside it), any other's Amount
  const amountRow = row(
    // the name, its star and any ⌄ on one line, centred on each other
    <span className="flex items-center">
      {duePart ? t("repay") : billLabel}
      <RequiredMark />
      {toSupplier && hasDue && (
        <button
          type="button"
          onClick={(ev) => {
            ev.preventDefault();
            setDueOpen((o) => !o);
          }}
          aria-expanded={dueOpen}
          aria-label={t("towardsGroup")}
          className="ml-1 grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/8"
        >
          <ChevronDown className={cn("size-4 transition-transform", dueOpen && "rotate-180")} aria-hidden />
        </button>
      )}
    </span>,
    billInput,
    "amount-field",
  );
  // interest: worked out from the months, its pen types it over (from a statement)
  const interestRow =
    editingInterest || interestTyped !== null
      ? row(
          t("interestDue"),
          <span className="relative block">
            {rupeeMark}
            <NumberInput
              id="amount-field"
              autoFocus={editingInterest}
              value={interestTyped ?? (interestWorked > 0 ? String(interestWorked) : "")}
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
        );
  // the months rent or interest is for
  const monthsRow = (bad: boolean, value: string, onChange: (v: string) => void, placeholder?: string) =>
    row(
      <>
        {t("months")}
        <RequiredMark />
      </>,
      <NumberInput
        id="months-field"
        value={value}
        onChange={onChange}
        maxDigits={3}
        max={120}
        placeholder={placeholder}
        aria-invalid={bad || undefined}
        className={cn(input(bad), "tabular")}
      />,
      "months-field",
    );
  // anything taken off what's repaid before To pay: TDS deducted or reverse-charge GST
  const takenOff = hasRcmRow || (tdsApplies && tdsAmount > 0);
  // the payment part's first row, with its ⌄ opening the amount and the reverse-charge GST when there's GST on it
  const firstFigure = hasRcmRow ? (rcmGst === null ? null : Math.round((bill + rcmGst) * 100) / 100) : bill;

  // the rate once a PAN is given: a supplier's 0.1%, interest, rent and professional fees 10%, brokerage 2%, contract
  // work 1% (individual or HUF) or 2%
  const panRate = tdsInfo
    ? "0.1"
    : headTds === "brokerage"
      ? "2"
      : headTds === "contract"
        ? "1–2"
        : "10";

  // their PAN, only while TDS is taken and none is on record
  const panSection = showPan && (
      <section className="flex min-w-0 flex-col gap-2.5">
        {tdsAmount > 0 && noPan && !panGiven && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-control bg-chestnut/10 p-2 rounded-bl-none text-sm font-medium"
          >
            <Info className="size-4 shrink-0" aria-hidden />
            <span className="font-semibold">{t("panHint", { rate: panRate })}</span>
          </p>
        )}
        {kind === "expense" ? panLine() : panField()}
      </section>
  );

  // a supplier, a loan repaid or a tax with what it owes known: Due left, Repay and To pay on the left, each arrow's
  // breakup on the right (the shared stage's look)
  if (toSupplier || kind === "loanRepaid" || (kind === "taxPaid" && dueShown !== null))
    return (
      <div className="flex flex-col gap-4">
        <DueAmount
          // the PAN above Due left, well apart from the rest
          top={panSection && <div className="mb-4 sm:max-w-[calc(50%-1.5rem)]">{panSection}</div>}
          names={kind === "taxPaid" ? { box: tc("q.amount"), done: t("paidShare") } : undefined}
          repay={{
            value: billText,
            onChange: (v) => {
              setCapNote(null);
              keyedAmount.current = v;
              typeAmount(v);
            },
            max: cap,
            onCapped: capped,
            invalid: amountOver || tooMuch || (tried && value === 0),
          }}
          problems={
            // under Repay's box, as wide as it (clear of the icon column); gone when there's nothing to say
            <div className="ml-auto mr-12 flex w-[55%] min-w-0 flex-col gap-1.5 [&:not(:has(*))]:hidden">
              {amountProblems}
            </div>
          }
          left={{ label: (leftRow?.label as string) ?? t("leftDue"), amount: leftRow?.amount ?? 0 }}
          taken={[
            ...typedRows.filter((r) => r.key === "tds"),
            ...(hasRcmRow
              ? [{ key: "rcmOff", label: t("rcmRow", { rate: tax?.rcm?.rate ?? 18 }), amount: rcmGst }]
              : []),
          ]}
          notes={
            <>
              {breakdownNotes}
              {taxFailed && <FailNote text={t("taxFailed")} retry={retryTax} />}
            </>
          }
        />
        <PaidFrom noCards />
      </div>
    );

  // a tax whose dues aren't known (staff see no balances): Repay typed, To pay under it, then Left to pay and the cards
  if (kind === "taxPaid")
    return (
      <div className="flex flex-col gap-4">
        <ExpenseAmount
          input={{
            id: "amount-field",
            label: tc("q.amount"),
            value: billText,
            onChange: (v) => {
              setCapNote(null);
              keyedAmount.current = v;
              typeAmount(v);
            },
            max: cap,
            onCapped: capped,
            invalid: amountOver || tooMuch || (tried && value === 0),
          }}
          problems={
            <div className="ml-auto mr-12 flex w-[55%] min-w-0 flex-col gap-1.5 [&:not(:has(*))]:hidden">
              {amountProblems}
            </div>
          }
          payRows={null}
        />
        <PaidFrom noCards />
      </div>
    );

  // a loan given: the amount in sale's typed box, then Left to pay and the cards (nothing to break down)
  if (kind === "loanGiven")
    return (
      <div className="flex flex-col gap-4">
        <PlainAmount
          label={tc("q.amount")}
          amount={{
            value: billText,
            onChange: (v) => {
              setCapNote(null);
              keyedAmount.current = v;
              typeAmount(v);
            },
            max: cap,
            onCapped: capped,
            invalid: amountOver || tooMuch || (tried && value === 0),
          }}
          problems={
            <div className="ml-auto mr-12 flex w-[55%] min-w-0 flex-col gap-1.5 [&:not(:has(*))]:hidden">
              {amountProblems}
            </div>
          }
        />
        <PaidFrom noCards />
      </div>
    );

  // interest paid: Months, the interest and To pay on the left, To pay's breakup on the right (the shared stage's look)
  if (interestCalc)
    return (
      <div className="flex flex-col gap-4">
        <InterestAmount
          top={panSection && <div className="mb-4 sm:max-w-[calc(50%-1.5rem)]">{panSection}</div>}
          problems={
            <div className="ml-auto mr-12 flex w-[55%] min-w-0 flex-col gap-1.5 [&:not(:has(*))]:hidden">
              {amountProblems}
            </div>
          }
          taken={typedRows.filter((r) => r.key === "tds")}
          notes={
            <>
              {breakdownNotes}
              {taxFailed && <FailNote text={t("taxFailed")} retry={retryTax} />}
            </>
          }
        />
        <PaidFrom noCards />
      </div>
    );

  // an expense: the box typed (Expense; rent's Months, under Rent / month with its godowns), To pay with its breakup
  // on the right when there's one (the GST on the bill, the TDS, the reverse-charge GST), then Left to pay and the cards
  if (kind === "expense") {
    const tdsRows: PayRow[] = typedRows
      .filter((r) => r.key === "tds")
      .map((r) => ({ key: "tds", label: r.label, amount: r.amount, sign: "−" }));
    // reverse-charge GST (rent from a landlord with no GSTIN, some expenses): on top, then taken off again, since it
    // goes to the government, not to them
    const rcmLabel = t("rcmRow", { rate: tax?.rcm?.rate ?? 18 });
    const rcmRows: PayRow[] = hasRcmRow
      ? [
          { key: "rcm", label: rcmLabel, amount: rcmGst, sign: "+" },
          {
            key: "withRcm",
            label: t("costGroup"),
            amount: rcmGst === null ? null : Math.round((bill + rcmGst) * 100) / 100,
            strong: true,
          },
        ]
      : [];
    const rcmOff: PayRow[] = hasRcmRow ? [{ key: "rcmOff", label: rcmLabel, amount: rcmGst, sign: "−" }] : [];
    const problemsBox = (
      <div className="ml-auto mr-12 flex w-[55%] min-w-0 flex-col gap-1.5 [&:not(:has(*))]:hidden">
        {amountProblems}
      </div>
    );
    const notesBox = (
      <>
        {breakdownNotes}
        {taxFailed && <FailNote text={t("taxFailed")} retry={retryTax} />}
      </>
    );
    const top = panSection && <div className="mb-4 sm:max-w-[calc(50%-1.5rem)]">{panSection}</div>;
    // rent: Rent / month (its godowns on the right), Months typed; To pay is rent a month times the months
    if (rentCalc)
      return (
        <div className="flex flex-col gap-4">
          <ExpenseAmount
            top={top}
            first={{
              item: { key: "rentMonth", label: t("totalRentPerMonth"), amount: monthlyRent },
              label: t("totalRentPerMonth"),
              box: rentGodowns(),
            }}
            input={{
              id: "months-field",
              label: t("months"),
              value: rentMonths,
              onChange: (v) => setRentMonths(atLeastOne(v)),
              max: 120,
              invalid: tried && Number(rentMonths) < 1,
              rupee: false,
              decimals: 0,
              maxDigits: 3,
              placeholder: "--",
            }}
            problems={problemsBox}
            payRows={[
              { key: "month", label: t("totalRentPerMonth"), amount: monthlyRent },
              { key: "months", label: t("months"), amount: Number(rentMonths) || 0, sign: "×" },
              { key: "rent", label: t("rentDue"), amount: bill, strong: true },
              ...rcmRows,
              ...tdsRows,
              ...rcmOff,
            ]}
            notes={notesBox}
          />
          <PaidFrom noCards />
        </div>
      );
    // any other expense: Expense typed. On a GST bill the expense and its GST are worked out of it; TDS comes off it
    const payRows: PayRow[] | null = onGstBill
      ? [
          { key: "expense", label: t("expense"), amount: value > 0 ? expenseBefore : 0 },
          { key: "gst", label: t("gstRow", { rate: gstInput.rate }), amount: value > 0 ? billGst : 0, sign: "+" },
          { key: "bill", label: t("billAmount"), amount: bill, strong: true },
          ...tdsRows,
        ]
      : hasRcmRow || (tdsApplies && tdsAmount > 0)
        ? [{ key: "expense", label: t("expense"), amount: bill }, ...rcmRows, ...tdsRows, ...rcmOff]
        : null;
    // what's typed: the expense the TDS comes out of (a TDS head, reverse-charge GST); otherwise what's handed over,
    // the GST and any TDS worked back out of it
    const typeExpense = expenseTyped || !gstExpense ? typeAmount : typePaid;
    return (
      <div className="flex flex-col gap-4">
        <ExpenseAmount
          top={top}
          input={{
            id: "amount-field",
            label: t("expense"),
            value: billText,
            onChange: (v) => {
              setCapNote(null);
              keyedAmount.current = v;
              typeExpense(v);
            },
            max: cap,
            onCapped: capped,
            invalid: amountOver || tooMuch || (tried && value === 0),
          }}
          problems={problemsBox}
          payRows={payRows}
          notes={notesBox}
        />
        <PaidFrom noCards />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-6 sm:max-w-[calc(50%-1.5rem)]">
        {/* their PAN, where TDS applies and there's none on record: under its own heading above the Amount heading (the
            card's own name is hidden then) */}
        {showPan && (
          <>
            <section className="flex min-w-0 flex-col gap-2.5">
              {/* no PAN: a message above its row with what giving one brings the TDS down to */}
              {tdsAmount > 0 && noPan && !panGiven && (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-control bg-chestnut/10 p-2 rounded-bl-none text-sm font-medium"
                >
                  <Info className="size-4 shrink-0" aria-hidden />
                  <span className="font-semibold">{t("panHint", { rate: panRate })}</span>
                </p>
              )}
              {panField()}
            </section>
            <h3 className={cn(partHeading, "-mb-3")}>{stepName("amount")}</h3>
          </>
        )}
        {/* the due part: a supplier's, a loan's, a tax's, under its heading; rent's, interest's and an expense's
            inputs without one */}
        <section className="flex min-w-0 flex-col gap-2.5">
          {duePart && <h3 className={partHeading}>{t("duePart")}</h3>}
          {/* what's owed: a supplier's due or the advance with them, what's left on a loan, what a tax owes */}
          {duePart &&
            (heldAdvance > 0
              ? plainRow(t("advancePart"), rupees(heldAdvance))
              : plainRow(t("due"), rupees(dueShown ?? 0)))}
          {/* rent: each godown's rent a month, folded to their total, then the months */}
          {rentCalc && rentBreakdown()}
          {rentCalc && monthsRow(tried && Number(rentMonths) < 1, rentMonths, (v) => setRentMonths(atLeastOne(v)))}
          {/* interest: the months, then what they come to */}
          {interestCalc &&
            monthsRow(
              tried && calcDue === 0 && interestTyped === null,
              interestTyped !== null ? "" : interestMonths,
              (v) => {
                setInterestTyped(null);
                setEditingInterest(false);
                setInterestMonths(atLeastOne(v));
              },
              "--",
            )}
          {interestCalc && interestRow}
          {/* the amount typed (not rent's or interest's) */}
          {!rentCalc && !interestCalc && !gstExpense && amountRow}
          {!gstExpense && amountProblems}
          {/* what a supplier's Repay goes towards: the due and any advance past it */}
          {toSupplier && hasDue && dueOpen && (
            <div className="rounded-control bg-chestnut/[0.04] px-3 py-2">
              <DueFlow
                wholeLabel={t("payGroup")}
                whole={settlesTotal}
                dueLabel={t("due")}
                due={settledOf}
                advanceLabel={t("advancePart")}
                advance={advance}
                paidLabel={t("paidShare")}
                owedBefore={0}
              />
            </div>
          )}
          {/* what's left once it's repaid */}
          {leftRow && <PlainRows rows={[leftRow]} />}
        </section>

        {/* the payment part */}
        <section className="flex min-w-0 flex-col gap-2.5">
          {/* always under its heading, for every kind of payment */}
          <h3 className={partHeading}>{t("paymentPart")}</h3>
          {/* an expense: on a GST bill the expense and its GST worked back out of To pay, any TDS, then To pay typed */}
          {expenseTyped ? (
            <>
              {/* on a GST bill: the expense and its GST worked out of what's typed, Expense with GST */}
              {onGstBill && (
                <PlainRows
                  rows={[
                    { key: "expense", label: t("expense"), amount: value > 0 ? expenseBefore : 0 },
                    { key: "gst", label: t("gstRow", { rate: gstInput.rate }), amount: value > 0 ? billGst : 0 },
                  ]}
                />
              )}
              {/* what's typed: the expense (with its GST, on a GST bill) */}
              {row(
                <span className="flex items-center">
                  {onGstBill ? t("expenseWithGst") : t("expense")}
                  <RequiredMark />
                </span>,
                billInput,
                "amount-field",
              )}
              {amountProblems}
              {/* the TDS taken out (on the expense alone), then To pay in the chestnut box */}
              <PlainRows rows={typedRows.filter((r) => r.key === "tds")} />
              <div className="border-t border-chestnut/30 pt-2.5">
                {row(
                  <span className="font-bold">{t("toPay")}</span>,
                  <span className="tabular flex min-h-12 items-center justify-end break-all rounded-control bg-chestnut px-3.5 font-heading text-xl font-bold text-ivory">
                    {rupees(value)}
                  </span>,
                )}
              </div>
            </>
          ) : gstExpense ? (
            <>
              {(onGstBill || tdsApplies) && (
                <PlainRows
                  rows={[
                    {
                      key: "expense",
                      label: t("expense"),
                      amount: value > 0 ? (onGstBill ? expenseBefore : bill) : 0,
                    },
                    ...(onGstBill
                      ? [{ key: "gst", label: t("gstRow", { rate: gstInput.rate }), amount: value > 0 ? billGst : 0 }]
                      : []),
                    ...typedRows.filter((r) => r.key === "tds"),
                  ]}
                />
              )}
              <div className={cn((onGstBill || tdsApplies) && "border-t border-chestnut/30 pt-2.5")}>
                {row(
                  <span className="font-bold">
                    {t("toPay")}
                    <RequiredMark />
                  </span>,
                  <span className={cn("block", value > 0 && !amountOver && !tooMuch && "[&_svg]:text-ivory")}>
                    {amountInput(typePaid, true)}
                  </span>,
                  "amount-field",
                )}
              </div>
              {amountProblems}
            </>
          ) : (
          <>
          {/* what's repaid, or rent, interest or the amount: with reverse-charge GST, the two together, its ⌄
              opening them; nothing taken off it (no TDS, no reverse-charge GST): straight to To pay */}
          {!takenOff ? null : hasRcmRow ? (
            <>
              <button
                type="button"
                onClick={() => setFirstOpen((o) => !o)}
                aria-expanded={firstOpen}
                className="tabular flex min-h-8 items-center justify-between gap-3 text-left text-sm"
              >
                <span className="flex items-center gap-1">
                  {firstLabel}
                  <ChevronDown className={cn("size-4 transition-transform", firstOpen && "rotate-180")} aria-hidden />
                </span>
                <span className="whitespace-nowrap text-base font-semibold">
                  {firstFigure === null ? "—" : rupees(firstFigure)}
                </span>
              </button>
              {firstOpen && (
                <div className="rounded-control bg-chestnut/[0.04] px-3 py-2">
                  <PlainRows
                    rows={[
                      { key: "bill", label: rentCalc ? t("rentDue") : billLabel, amount: bill },
                      { key: "rcmGst", label: t("rcmRow", { rate: tax?.rcm?.rate ?? 18 }), amount: rcmGst },
                    ]}
                  />
                </div>
              )}
            </>
          ) : (
            <PlainRows rows={[{ key: "first", label: firstLabel, amount: bill }]} />
          )}
          {/* taken off it: the TDS, and the reverse-charge GST (paid to the government, not to them) */}
          {takenOff && <PlainRows
            rows={[
              ...typedRows.filter((r) => r.key === "tds"),
              ...(hasRcmRow
                ? [{ key: "rcmOff", minus: true, label: t("rcmRow", { rate: tax?.rcm?.rate ?? 18 }), amount: rcmGst }]
                : []),
            ]}
          />}
          {/* To pay, what leaves cash or the bank, in the chestnut box, under a line as under a sum (no line when it's
              alone) */}
          <div className={cn(takenOff && "border-t border-chestnut/30 pt-2.5")}>
            {row(
              <span className="font-bold">{t("toPay")}</span>,
              <span className="tabular flex min-h-12 items-center justify-end break-all rounded-control bg-chestnut px-3.5 font-heading text-xl font-bold text-ivory">
                {rupees(value)}
              </span>,
            )}
          </div>
          </>
          )}
          {breakdownNotes}
          {taxFailed && (
            <div className={underValue}>
              <FailNote text={t("taxFailed")} retry={retryTax} />
            </div>
          )}
        </section>
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
        {/* godown by godown in its box, opened above the total rent a month, which comes last as a plain row like the
            due's */}
        <div className="flex min-w-0 flex-col gap-2.5 text-sm">
          {breakupOpen && (
            <div className="flex min-w-0 flex-col rounded-control px-3 shadow-[0_0_5px_0] shadow-chestnut/25">
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
            className="flex min-h-11 min-w-0 items-center justify-between gap-3 text-left"
          >
            <span>{t("totalRentPerMonth")}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="tabular min-w-0 break-all text-right text-base font-semibold">
                {rupees(monthlyRent)}
              </span>
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

  // rent's Rent / month breakup, on the right: each godown's rent a month (its pen changes it for this payment; many
  // rows scroll), then their total on chestnut
  function rentGodowns() {
    return (
      <>
        <div className="flex min-w-0 flex-col text-sm">
          <div className="flex justify-between gap-4 pb-2 text-xs font-semibold">
            <span>{t("godown")}</span>
            <span>{t("rentPerMonth")}</span>
          </div>
          <div className="max-h-64 overflow-y-auto overflow-x-hidden">
            {rentRows.map((row) => {
              const typing = editingRent === row.id || Number(rentOf(row)) < 1;
              const low = tried && rentOf(row) === "";
              return (
                <div key={row.id} className="flex min-h-12 min-w-0 items-center gap-2 border-t border-chestnut/15 py-1">
                  <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>
                  {typing ? (
                    <NumberInput
                      autoFocus={editingRent === row.id}
                      value={rentOf(row)}
                      onChange={(v) => setRentEdits((all) => ({ ...all, [row.id]: atLeastOne(v) }))}
                      onBlur={() => setEditingRent(null)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setEditingRent(null))}
                      decimals={2}
                      maxDigits={13}
                      placeholder="0"
                      aria-label={row.name}
                      aria-invalid={low || undefined}
                      className={cn(input(low), "tabular w-36 shrink-0 text-right")}
                    />
                  ) : (
                    <>
                      <span className="tabular min-w-0 break-all text-right">{rupees(Number(rentOf(row)))}</span>
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
        <LeftRow label={t("totalRentPerMonth")} amount={monthlyRent} />
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
      <div className="flex min-w-0 items-start justify-between gap-3">
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

  // an expense's PAN, in the stage's row look: PAN on the left, the box as wide as To pay, a tick in the icon column
  // (saved: the PAN in plain words, the pen there instead)
  function panLine() {
    if (!showPan) return null;
    const editing = savedPan === "" || panEditing;
    const wrong = (panLeft || tried) && panBad;
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor="pan-field" className="flex min-h-11 min-w-0 flex-1 items-center text-sm font-semibold">
            PAN
          </label>
          {editing ? (
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
              className={cn(input(wrong), "tabular w-[55%] shrink-0 text-right")}
            />
          ) : (
            <span className="tabular flex min-h-11 w-[55%] shrink-0 items-center justify-end pr-3 text-base font-medium">
              {savedPan}
            </span>
          )}
          <span className="grid size-10 shrink-0 place-items-center">
            {editing ? (
              <button
                type="button"
                data-recheck
                onClick={savePan}
                aria-label={t("saveUpi")}
                className="grid size-9 place-items-center rounded-control bg-chestnut text-ivory"
              >
                <Check className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPanEditing(true)}
                aria-label={t("editUpi")}
                className="grid size-9 place-items-center rounded-control hover:bg-chestnut/[0.08]"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            )}
          </span>
        </div>
        {/* what's wrong, under the box (clear of the icon column) */}
        {editing && wrong && (
          <FieldMessage className="ml-auto mr-12 mt-0 w-[55%]">
            {pan !== "" && !panTypedOk ? t("panBad") : t("panUnsavedTick")}
          </FieldMessage>
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
