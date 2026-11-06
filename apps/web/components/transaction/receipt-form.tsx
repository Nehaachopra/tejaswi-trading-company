"use client";

import { ArrowLeft, ArrowRight, ChevronDown, IndianRupee, Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Note } from "~/components/ui/note";
import { Reveal } from "~/components/ui/reveal";
import { ADD_ON_IVORY, PICK_LIST, PICK_NEW, PICK_ROW, PICK_SEARCH, PICK_TWO_COLUMNS, PICKED } from "~/components/ui/page-styles";
import { fieldClass } from "~/components/ui/card-form";
import { DateInput, dayInWords } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicButton, MicField } from "~/components/ui/mic-button";
import { PickMenu } from "~/components/stock/pick-menu";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { bankNameIn } from "~/lib/bank-names";
import { rupees, titleCase } from "~/lib/format";
import { wordsToNumber } from "~/lib/number-words";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { indiaDay } from "../account/balance";
import { useLedgerName } from "../account/ledger-name";
import { useSameNameConfirm } from "../account/party/same-name";
import { PartyEdit } from "../account/party/party-sheet";
import {
  draftInput as partyInput,
  draftOk as partyOk,
  emptyDraft as emptyParty,
  PartyFields,
  type PartyDraft,
} from "../account/party/party-fields";
import { HeadEdit, type LedgerChoice, LedgerSearch, type Pickable, type ReceiptKind } from "./ledger-picker";
import { type BankLender, emptyLender, lenderInput, type LenderDraft, LenderEdit, LenderFields, lenderOk } from "./lender-fields";
import { moveCard, StepProgress, useCardHistory } from "./card-steps";
import { AdvanceTag, type AmountRow, AmountTable } from "./amount-table";
import { DueBar } from "./due-bar";
import { UpiQr } from "./upi-qr";
import { emptyLoan, type LoanDraft, loanInput, loanProblems, LoanTerms } from "./loan-terms";
import { OldLoanForm } from "./old-loan-form";
import { PartyPick, usePhoneMatches } from "./party-finder";

// a summary line: words, or a name with its amount on the right; a step can have several, one under another
type SummaryLine = string | { name: string; amount: string };

type Loan = RouterOutputs["transactions"]["due"]["openLoans"][number];

// the cards, in order (only the ones that apply are shown)
type Step = "kind" | "from" | "terms" | "amount" | "details";

// what it can be received for, in the order people reach for them; which come from a party found or added, which
// can add a ledger of their own, and which name an open loan we gave
const KINDS: ReceiptKind[] = ["customer", "loanTaken", "loanReturned", "interestReceived", "capital", "otherIncome", "refund"];
const PARTY_KINDS: ReceiptKind[] = ["customer", "loanTaken"];
const LEDGER_KINDS: ReceiptKind[] = ["otherIncome", "refund"];
const LOAN_KINDS: ReceiptKind[] = ["loanReturned", "interestReceived"];
// who gave a loan we took: a bank or NBFC is a lender, never a party
const LENDERS = ["bank", "nbfc", "individual"] as const;
type Lender = (typeof LENDERS)[number];
// the TDS a party usually deducts, filled in when they say they did: a customer under 194Q, a borrower on interest
const TDS_RATE: Partial<Record<ReceiptKind, string>> = { customer: "0.1", interestReceived: "10" };

const REFERENCE_MAX = 30;
const REMARKS_MAX = 100;

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;
const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-control border px-3.5 text-sm font-semibold transition-colors",
    on ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50 hover:bg-chestnut/[0.06]",
  );
// an amount, large and bold
const money = "tabular font-heading font-bold leading-tight";

// a ledger of a customer or supplier (or a party with no sale or purchase yet): only they deduct TDS
const isParty = (l: Pickable) =>
  l.masterKey === "debtors" || l.masterKey === "creditors" || l.masterKey === "debtorCreditors" || l.masterKey === "parties";

// a day as the moment it's saved at: now for today, noon (India) for any other day
const momentOf = (day: string) => (day === indiaDay(new Date()) ? new Date() : new Date(`${day}T12:00:00+05:30`));

// the TDS a party deducted from what they owed, as the server works it out: what came in is what's left after it
const tdsOn = (received: number, rate: number) => Math.round((received / (1 - rate / 100) - received) * 100) / 100;

// a spoken amount ("twenty five thousand") into a number field; anything that isn't a number is left alone
const saidAmount = (said: string, set: (raw: string) => void) => {
  const n = wordsToNumber(said);
  if (n !== null) set(String(n));
};

// /transaction/receipt: money coming in, one card at a time with Back and Next (Next only once the card is filled in),
// and a summary of the answers that goes back to any card: what it was received for, who it came from (a party found or added, a lender, the
// open loan, a ledger), a loan's terms, the amount with any TDS they deducted and where it came into, then the
// reference and remarks, where Save is. A save goes to the receipt's own page
export function ReceiptForm({ isAdmin }: { isAdmin: boolean }) {
  const [round, setRound] = useState(0);
  return <ReceiptEntry key={round} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />;
}

function ReceiptEntry({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const t = useTranslations("transactions.receipt.form");
  const tr = useTranslations("transactions.receipt");
  const tk = useTranslations("transactions.receipt.kinds");
  const tpf = useTranslations("transactions.payment.form");
  const tc = useTranslations("transactions.chat");
  const tpick = useTranslations("transactions.picker");
  const tl = useTranslations("transactions.loan");
  const locale = useLocale();
  const nameOf = useLedgerName();
  const sameName = useSameNameConfirm();
  const utils = trpc.useUtils();
  const router = useRouter();
  const tdsLabel = useId();
  const banks = trpc.accounts.bank.pickable.useQuery();
  // what cash and each bank account hold today (null for staff, who don't see balances)
  const sources = trpc.transactions.payment.sources.useQuery();
  const create = trpc.transactions.receipt.create.useMutation();

  // the answers
  const [kind, setKind] = useState<ReceiptKind | null>(null);
  const [from, setFrom] = useState<LedgerChoice>(null);
  const [newParty, setNewParty] = useState<PartyDraft>(() => emptyParty());
  const [lender, setLender] = useState<Lender | null>(null);
  const [bankLender, setBankLender] = useState<LenderDraft>(emptyLender);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [terms, setTerms] = useState<LoanDraft>(emptyLoan);
  const [dueOn, setDueOn] = useState("");
  const [amount, setAmount] = useState("");
  const [tdsOnIt, setTdsOnIt] = useState(false);
  const [tdsRate, setTdsRate] = useState("");
  const [into, setInto] = useState<"cash" | "bank" | null>(null);
  const [bankId, setBankId] = useState<string | null>(null);
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  // interest received: the months it's for, or what was typed in from a statement instead
  const [interestMonths, setInterestMonths] = useState("12");
  const [interestTyped, setInterestTyped] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);
  // the picked party, lender or ledger being changed right here
  const [editingFrom, setEditingFrom] = useState(false);
  useEffect(() => setEditingFrom(false), [kind, from?.kind === "ledger" ? from.ledger.id : null, loan?.id]);
  const [loanSearch, setLoanSearch] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  // an old loan given being added in the card, and the one just added, picked once the list has it
  const [addingOldLoan, setAddingOldLoan] = useState(false);
  const [addedLoanId, setAddedLoanId] = useState<string | null>(null);

  // what's typed, worked out
  const value = Number(amount) || 0;
  const bank = banks.data?.find((b) => b.id === bankId);
  const cashHeld = sources.data?.cash ?? null;
  const bankHeld = (id: string) => sources.data?.banks.find((b) => b.id === id)?.available ?? null;
  const loanOf = kind !== null && LOAN_KINDS.includes(kind);
  const fromParty = kind !== null && PARTY_KINDS.includes(kind);
  const loans = trpc.transactions.due.openLoans.useQuery({ kind: "loanGiven" }, { enabled: loanOf });
  useEffect(() => {
    const added = loans.data?.find((l) => l.id === addedLoanId);
    if (!added) return;
    setLoan(added);
    setAddedLoanId(null);
  }, [loans.data, addedLoanId]);
  // a loan we took from a bank or NBFC: the lender's details instead of a party's, and only into a bank account
  const bankLoan: BankLender | null = kind === "loanTaken" && (lender === "bank" || lender === "nbfc") ? lender : null;
  useEffect(() => {
    if (bankLoan && into === "cash") setInto(null);
  }, [bankLoan, into]);
  const phoneMatches = usePhoneMatches(newParty.phone, "customer");
  // a new party's phone someone already has (one phone, one party): they're used instead, or the phone is changed
  const matched = from?.kind === "party" && phoneMatches.length > 0 ? phoneMatches[0]! : null;

  // TDS: a customer (a party) paying us, or a borrower paying interest, may have deducted it; they say so with the
  // switch and the usual rate comes filled in, to change to what their certificate says
  const tdsCan = (kind === "customer" && ((from?.kind === "ledger" && isParty(from.ledger)) || from?.kind === "party")) || (kind === "interestReceived" && loan !== null && !loan.lenderId);
  const tdsValue = Number(tdsRate) || 0;
  const tdsBad = tdsCan && tdsOnIt && !(tdsValue > 0 && tdsValue < 100);
  const tdsAmount = tdsCan && tdsOnIt && !tdsBad ? tdsOn(value, tdsValue) : 0;
  useEffect(() => {
    setTdsOnIt(false);
    setTdsRate(kind ? (TDS_RATE[kind] ?? "") : "");
  }, [kind, from, loan?.id]);
  // what it settles: what came in and the TDS taken from it
  const total = Math.round((value + tdsAmount) * 100) / 100;

  // interest on a loan we gave: what's left at its rate for the months, or a figure typed in (then the months show --)
  const interestCalc = kind === "interestReceived" && !!loan?.interestRate;
  const interestWorked = interestCalc ? Math.round((loan!.left * loan!.interestRate! * Number(interestMonths)) / 12) / 100 : 0;
  const interestDue = interestTyped !== null ? Number(interestTyped) || 0 : interestWorked;
  useEffect(() => setInterestTyped(null), [loan?.id]);
  useEffect(() => {
    if (interestCalc) setAmount(interestDue > 0 ? String(interestDue) : "");
  }, [interestCalc, interestDue]);

  // what's still owed by the customer or on the loan given back, beside the amount; picking them fills it in (once each,
  // so what's typed afterwards stays; picking someone else clears a figure that was filled in)
  const fromBalance = from?.kind === "ledger" ? (from.ledger.balance?.today ?? null) : null;
  const customerDue = kind === "customer" && fromBalance?.side === "debit" && fromBalance.amount > 0 ? fromBalance.amount : null;
  const unpaid = kind === "loanReturned" ? (loan?.left ?? null) : customerDue;
  const dueShown = unpaid !== null && unpaid > 0 ? unpaid : null;
  const unpaidOf = kind === "loanReturned" ? (loan?.id ?? null) : dueShown !== null && from?.kind === "ledger" ? from.ledger.id : null;
  const filledFor = useRef<string | null>(null);
  const autoFilled = useRef(false);
  const pickKey = kind === "loanReturned" ? (loan?.id ?? null) : from?.kind === "ledger" ? from.ledger.id : null;
  useEffect(() => {
    if (!autoFilled.current) return;
    autoFilled.current = false;
    setAmount("");
  }, [pickKey]);
  useEffect(() => {
    if (unpaidOf === null || unpaid === null || filledFor.current === unpaidOf || unpaid <= 0) return;
    filledFor.current = unpaidOf;
    setAmount(String(unpaid));
    autoFilled.current = true;
  }, [unpaidOf, unpaid]);
  // a customer's due filled in and TDS deducted from it: what came in is the due less the TDS, so together they settle it
  useEffect(() => {
    if (!autoFilled.current || customerDue === null) return;
    const rate = tdsCan && tdsOnIt && tdsValue > 0 && tdsValue < 100 ? tdsValue : 0;
    setAmount(String(Math.round(customerDue * (1 - rate / 100) * 100) / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the TDS changes
  }, [tdsOnIt, tdsValue]);
  // what's typed or spoken replaces a figure that was filled in
  const typeAmount = (raw: string) => {
    autoFilled.current = false;
    setAmount(raw);
  };
  // a loan given back can't be more than is left on it; a customer paying more than they owe leaves an advance
  const loanOver = kind === "loanReturned" && loan !== null && value > loan.left;
  // a customer paying more than they owe (or owing nothing): the rest is an advance with us. Only worked out when their
  // balance is known (staff see none); someone new owes nothing yet, so all of it is an advance
  const fromCustomer = kind === "customer" && ((from?.kind === "ledger" && !!from.ledger.party && !!from.ledger.balance) || from?.kind === "party");
  const owes = fromCustomer && fromBalance?.side === "debit" ? fromBalance.amount : 0;
  const heldAdvance = fromCustomer && fromBalance?.side === "credit" ? fromBalance.amount : 0;
  const advance = fromCustomer && total > owes ? Math.round((total - owes) * 100) / 100 : 0;

  // when each card is filled in
  const filled = value > 0 && !loanOver;
  const fromDone = loanOf
    ? loan !== null
    : kind === "loanTaken" && lender === null
      ? false
      : bankLoan
        ? lenderOk(bankLender)
        : from !== null && (from.kind !== "party" || (!matched && partyOk(newParty, true)));
  const intoDone = into === "cash" ? !bankLoan : into === "bank" && !!bank;
  const complete: Record<Step, boolean> = {
    kind: kind !== null,
    from: fromDone,
    terms: !Object.values(loanProblems(terms)).some(Boolean) && !(dueOn !== "" && dueOn < day),
    amount: value > 0 && !loanOver && !tdsBad && intoDone,
    details: day !== "",
  };
  // the cards that apply now; one shows at a time, and Next moves on once it's filled in
  const steps: Step[] = ["kind", "from", ...(kind === "loanTaken" ? (["terms"] as Step[]) : []), "amount", "details"];
  const [at, setAt] = useState<Step>("kind");
  // a card that no longer applies (loan terms, once it isn't a loan) gives way to the one after it
  const current: Step = steps.includes(at) ? at : "amount";

  // Received into shows once the amount is typed: a short pause after the last key, or leaving the field. It stays
  // shown after that, so clearing the amount doesn't hide a choice already made
  const [intoShown, setIntoShown] = useState(false);
  useEffect(() => {
    if (intoShown || value <= 0) return;
    const wait = setTimeout(() => setIntoShown(true), 800);
    return () => clearTimeout(wait);
  }, [value, intoShown]);

  // the Amount card opens with its field ready to type in
  useEffect(() => {
    if (current === "amount") document.getElementById("amount-field")?.focus({ preventScroll: true });
  }, [current]);
  const index = steps.indexOf(current);
  const firstOpen = steps.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  // a summary line can go back to any card up to the first one not yet filled in
  const reachable = (s: Step) => steps.indexOf(s) <= (ready ? steps.length - 1 : firstOpen);
  // how far along: the cards done before the first one still open
  const done = ready ? steps.length : firstOpen;
  const progressLabel = t("stepsDone", { done, all: steps.length });
  // the phone's Back goes to the card before; each card moved to is remembered as a step back
  const remember = useCardHistory<Step>("kind", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // a card's name: the loan's card says so, and a ledger's
  const stepName = (s: Step) =>
    s === "from" && loanOf ? t("steps.loan") : s === "from" && kind !== null && !fromParty ? t("steps.ledger") : s === "details" && into !== "bank" ? t("steps.remarks") : t(`steps.${s}`);

  // someone new being filled in: Change, beside the card's name, goes back to searching
  const changeOf = (s: Step) => (s === "from" && from?.kind === "party" ? () => setFrom(null) : null);

  // what's answered so far, a line each, for the summary
  const fromName = loanOf
    ? loan && titleCase(loan.partyName)
    : bankLoan
      ? bankLender.picked
        ? titleCase(bankLender.picked.name)
        : bankLender.adding && bankLender.name.trim()
          ? titleCase(bankLender.name)
          : null
      : from?.kind === "ledger"
        ? from.ledger.party
          ? titleCase(from.ledger.party.name)
          : nameOf(from.ledger)
        : from?.kind === "new"
          ? from.name
          : from?.kind === "party"
            ? titleCase(newParty.name) || tc("newParty")
            : null;
  const summary: { step: Step | "into"; value: SummaryLine | SummaryLine[] | null }[] = [
    { step: "kind", value: kind && tk(kind) },
    { step: "from", value: fromName },
    {
      step: "terms",
      value:
        kind === "loanTaken" && terms.rate !== ""
          ? [`${terms.rate}% ${tc("aYear")}`, terms.frequency ? tl(`frequencies.${terms.frequency}`) : "", dueOn ? tc("dueBy", { day: dayInWords(dueOn, locale) }) : ""].filter((v) => v !== "")
          : null,
    },
    { step: "into", value: into === "cash" ? tc("cash") : bank ? `${bankNameIn(bank.bankName, locale)} ••${bank.last4}` : null },
    { step: "details", value: ((lines) => (lines.length > 0 ? lines : null))([into === "bank" ? reference : "", remarks.trim()].filter((v) => v !== "")) },
  ];

  // leaving with something entered asks first (not after a save, which goes on to the receipt's page)
  const { dialog: leaveDialog } = useLeaveGuard(!create.isSuccess && (value > 0 || kind !== null || remarks !== ""), onDiscard);

  // a new card starts at the top of the page, with nothing in red yet
  function show(step: Step) {
    // back to an earlier card slides in from the left
    moveCard(() => {
      setTried(false);
      setAt(step);
    }, steps.indexOf(step) < index);
    remember(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Next: on to the card after this one, once it's filled in; otherwise what's missing shows in red, at its first field
  function next() {
    if (!complete[current]) return guide();
    show(steps[index + 1]!);
  }

  // something missing: show it in red and put the cursor on its first field
  function guide() {
    setTried(true);
    setTimeout(() => document.querySelector<HTMLElement>('main section [aria-invalid="true"]')?.focus(), 50);
  }

  async function save() {
    if (!ready) {
      setAt(steps[firstOpen]!);
      return guide();
    }
    // a new party with the same name in the same town: asked first
    if (!loanOf && !bankLoan && from?.kind === "party" && !(await sameName.confirm(newParty))) return;
    setSaveError(null);
    const viaLedger = !loanOf && !bankLoan;
    try {
      const r = await create.mutateAsync({
        dateTime: momentOf(day),
        receivedFor: kind!,
        receivedFromLedgerId: viaLedger && from?.kind === "ledger" ? from.ledger.id : null,
        dueId: loanOf ? loan!.id : null,
        newLedger: viaLedger && from?.kind === "new" ? { name: from.name } : null,
        newParty: viaLedger && from?.kind === "party" ? partyInput(newParty) : null,
        loan: kind === "loanTaken" ? { ...loanInput(terms), lenderType: lender, dueOn: dueOn || null } : null,
        lender: bankLoan ? lenderInput(bankLender, bankLoan) : null,
        amount: value,
        settledIn: into!,
        bankDetailsId: into === "bank" ? bankId : null,
        referenceNumber: into === "bank" ? reference : "",
        tdsRate: tdsAmount > 0 ? tdsValue : null,
        remarks,
      });
      void utils.accounts.invalidate();
      // what cash and the banks hold now changed: the success page asks again
      void utils.transactions.payment.sources.invalidate();
      void utils.transactions.due.invalidate();
      // on to the receipt's own page with what the save gave back already in hand; replace, so going back doesn't land
      // on the filled form
      utils.transactions.receipt.get.setData({ transactionId: r.transactionId }, r);
      utils.transactions.receipt.balances.setData({ transactionId: r.transactionId }, r.balances);
      router.replace(`/transaction/receipt/${r.transactionId}`);
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "CONFLICT" && (err as { message?: string }).message?.startsWith("Phone")) return setSaveError(tc("saveErrors.phone"));
      setSaveError(code === undefined ? tc("saveErrors.network") : code === "CONFLICT" ? tc("saveErrors.taken") : code === "BAD_REQUEST" || code === "PRECONDITION_FAILED" ? tc("saveErrors.check") : tr("errors.failed"));
    }
  }

  // the bank accounts first, so the tiles show from the start
  if (banks.isPending || sources.isPending)
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6">
        <h1 className="sr-only">{tr("title")}</h1>
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {tc("looking")}
        </p>
      </main>
    );

  // the card on its own, with Back and Next; beside it on a wide screen the summary of what's filled in, and above it
  // on a phone the same summary folded into a bar
  return (
    <main className="mx-auto flex w-full max-w-6xl items-start gap-6 px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
      <h1 className="sr-only">{tr("title")}</h1>
      {leaveDialog}
      {sameName.dialog}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {kind && <div className="lg:hidden">{summaryBar()}</div>}
        <section key={current} aria-labelledby={`card-${current}`} className="txn-card on-ivory chat-rise flex flex-col gap-4 rounded-2xl bg-ivory p-4 text-chestnut sm:p-5">
          {/* back to the card before, then this card's name (Change beside it for someone new) */}
          {index > 0 && (
            <button type="button" onClick={() => show(steps[index - 1]!)} className="-mb-1 flex min-h-9 w-fit items-center gap-1.5 text-sm font-semibold">
              <ArrowLeft className="size-4" aria-hidden /> {tr("back")}
            </button>
          )}
          <div className="-mb-1 flex items-center justify-between gap-2">
            <h2 id={`card-${current}`} className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
              {stepName(current)}
            </h2>
            {changeOf(current) && (
              <button type="button" onClick={changeOf(current)!} className="text-sm font-semibold underline underline-offset-2">
                {tpick("change")}
              </button>
            )}
          </div>
          {/* Next or Save was tapped and this card isn't done: what it still needs */}
          {tried && !complete[current] && <FieldMessage className="mt-0">{t(`missing.${current}`)}</FieldMessage>}
          {body(current)}
          {/* on to the next card; the last one saves. A card of chips alone moves on when one is picked, and an old loan
              being added has its own Add instead */}
          {current === "details" ? (
            saveBlock()
          ) : current === "kind" || (current === "from" && addingOldLoan) ? null : (
            <button type="button" onClick={next} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-colors hover:bg-chestnut/90">
              {tr("next")} <ArrowRight className="size-5" aria-hidden />
            </button>
          )}
        </section>
      </div>

      {/* wide screens: the summary, always in view */}
      <aside aria-label={tpf("summary")} className="sticky top-20 hidden w-80 shrink-0 lg:block">
        {summaryCard()}
      </aside>
    </main>
  );

  // phones: the total and how far along, in a bar that opens to the summary's lines
  function summaryBar() {
    return (
      <div className="on-ivory flow-root rounded-2xl bg-ivory text-chestnut">
        <button type="button" aria-expanded={summaryOpen} onClick={() => setSummaryOpen((o) => !o)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{tpf("summary")}</span>
          <span className="flex items-center gap-3">
            <span className={cn(money, "text-lg")}>{rupees(total)}</span>
            <ChevronDown className={cn("size-4 transition-transform", summaryOpen && "rotate-180")} aria-hidden />
          </span>
        </button>
        {/* how far along, filling as cards are done */}
        <StepProgress done={done} all={steps.length} label={progressLabel} className="-mt-1 mb-4 ml-4 w-[calc(100%-2rem)]" />
        {summaryOpen && <div className="px-4 pb-3">{summaryLines()}</div>}
      </div>
    );
  }

  // what's filled in so far: the amount large, or with TDS the amount, TDS and total; then a line for each card answered
  function summaryCard() {
    return (
      <div className="on-ivory flex flex-col gap-3 rounded-2xl bg-ivory p-4 text-chestnut">
        <h2 className="-mb-1 text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{tpf("summary")}</h2>
        <StepProgress done={done} all={steps.length} label={progressLabel} />
        {/* just what it comes to; its breakup is under the amount */}
        <p className={cn(money, "text-3xl")}>{rupees(total)}</p>
        {summaryLines()}
      </div>
    );
  }

  // a line for each card answered; a line goes back to its card
  function summaryLines() {
    const lines = summary.filter((l) => l.value && (l.step === "into" || steps.includes(l.step)));
    if (lines.length === 0) return null;
    return (
      <dl className="flex flex-col border-t border-chestnut/15">
        {lines.map((l) => {
          const step = l.step === "into" ? "amount" : l.step;
          return (
            <button
              key={l.step}
              type="button"
              disabled={!reachable(step)}
              onClick={() => {
                setSummaryOpen(false);
                show(step);
              }}
              className={cn("flex flex-col items-start gap-0.5 border-b border-chestnut/15 py-2 text-left hover:bg-chestnut/4", step === current && "font-bold")}
            >
              <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] opacity-60">{l.step === "into" ? t("steps.into") : stepName(l.step)}</dt>
              <dd className="flex w-full flex-col font-semibold">
                {(Array.isArray(l.value) ? l.value : l.value === null ? [] : [l.value]).map((line, i) =>
                  typeof line === "string" ? (
                    <span key={i} className="truncate">{line}</span>
                  ) : (
                    <span key={i} className="flex justify-between gap-3">
                      <span className="truncate">{line.name}</span>
                      <span className="tabular shrink-0">{line.amount}</span>
                    </span>
                  ),
                )}
              </dd>
            </button>
          );
        })}
      </dl>
    );
  }

  // the day, then Save with the total on it, and why a save failed
  function saveBlock() {
    return (
      <>
        <label className="mb-3 flex flex-col gap-2.5 text-xs font-semibold sm:max-w-72">
          <span>
            {tc("q.date")}
            <RequiredMark />
          </span>
          <DateInput value={day} max={indiaDay(new Date())} onChange={setDay} calendarLabel={tc("q.date")} aria-invalid={(tried && day === "") || undefined} className={input(day === "")} />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={create.isPending}
          aria-busy={create.isPending}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory shadow-md transition-colors hover:bg-chestnut/90 aria-busy:opacity-80"
        >
          {create.isPending && <Spinner className="size-5" />}
          <span>{tr("save")}</span>
          <span className="tabular">{rupees(total)}</span>
        </button>
        {saveError && (
          <p role="alert">
            <FieldMessage className="mt-0">{saveError}</FieldMessage>
          </p>
        )}
      </>
    );
  }

  // what a card holds
  function body(s: Step) {
    switch (s) {
      // what it was received for; a change asks who it came from (and what follows) again
      case "kind":
        return (
          <div role="radiogroup" aria-label={t("steps.kind")} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  // the same one again just moves on
                  if (k === kind) return show("from");
                  setKind(k);
                  setFrom(null);
                  setNewParty(emptyParty());
                  setLender(null);
                  setBankLender(emptyLender());
                  setLoan(null);
                  setLoanSearch("");
                  setAddingOldLoan(false);
                  // another kind starts with no amount (a pick fills it in again)
                  setAmount("");
                  filledFor.current = null;
                  autoFilled.current = false;
                  show("from");
                }}
                className={chip(kind === k)}
              >
                {tk(k)}
              </button>
            ))}
          </div>
        );

      // who it came from: the open loan, a lender, or a party or ledger found (or added)
      case "from":
        return loanOf ? loanCards() : kind === "loanTaken" ? loanTakenFrom() : fromPicker();

      // a loan we took: its interest, how often it's paid, and when it's due back (if ever)
      case "terms":
        return (
          <>
            <LoanTerms draft={terms} onChange={(patch) => setTerms((d) => ({ ...d, ...patch }))} tried={tried} />
            <label className="flex flex-col gap-2.5 text-xs font-semibold sm:w-72">
              {tc("q.dueOn")}
              <DateInput value={dueOn} min={day} onChange={setDueOn} calendarLabel={tc("q.dueOn")} className={input(dueOn !== "" && dueOn < day)} />
            </label>
          </>
        );

      // how much, any TDS they deducted, and where it came into
      case "amount":
        return amountBody();

      // a bank receipt's UTR or cheque number, and any remarks
      case "details":
        return (
          <>
            <div className={cn("grid gap-x-6 gap-y-3", into === "bank" && "sm:grid-cols-2")}>
              {into === "bank" && (
                <label className="flex flex-col gap-2.5 text-xs font-semibold">
                  {tc("q.reference")}
                  <input
                    value={reference}
                    maxLength={REFERENCE_MAX}
                    placeholder={tc("hints.reference")}
                    onChange={(e) => setReference(e.target.value.replace(/\s+/g, "").toUpperCase())}
                    className={input(false)}
                  />
                </label>
              )}
              <label className="flex flex-col gap-2.5 text-xs font-semibold">
                {tc("q.remarks")}
                <MicField onText={(said) => setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))}>
                  <input value={remarks} maxLength={REMARKS_MAX} placeholder={tc("hints.remarks")} onChange={(e) => setRemarks(e.target.value)} className={cn(input(false), "pr-11")} />
                </MicField>
              </label>
            </div>
          </>
        );
    }
  }

  // the Amount card: what's owed beside the amount (or the interest calculator), the TDS they deducted, and where it
  // came into
  // the rows of the amount's breakup
  function amountRows(): AmountRow[] {
    return [
      { key: "in", label: tc("sum.amount"), amount: value },
      ...(tdsCan ? [{ key: "tds", label: tdsCell(), amount: tdsOnIt ? (tdsBad ? null : tdsAmount) : 0 }] : []),
      { key: "total", label: tpf("total"), amount: total, tone: "total" as const },
      ...(advance > 0 && owes > 0 ? [{ key: "due", label: t("due"), amount: owes, gapBefore: true }] : []),
      ...(advance > 0 ? [{ key: "advance", label: <AdvanceTag>{t("advancePart")}</AdvanceTag>, amount: advance, tone: "advance" as const, gapBefore: owes === 0 }] : []),
    ];
  }

  // TDS they deducted: its switch beside it, and once on, the rate the law sets
  function tdsCell() {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={tdsLabel}>{tc("sum.tds")}</span>
        <Switch on={tdsOnIt} onFlip={setTdsOnIt} labelledBy={tdsLabel} />
        {/* the rate is the law's, shown, never typed */}
        {tdsOnIt && <span className="tabular text-xs font-semibold">{tdsValue}%</span>}
      </span>
    );
  }

  function amountBody() {
    return (
      // on a phone one column; on a wider screen the amount (its due, TDS) on the left, where it came into (its QR) on
      // the right
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-6">
        <div className="flex min-w-0 flex-col gap-4">
        {interestCalc ? (
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
            <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
              {tpf("interestDue")}
              <span className={cn("relative block", interestDue > 0 && "text-ivory")}>
                <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2" aria-hidden />
                <NumberInput
                  value={interestTyped ?? (interestWorked > 0 ? String(interestWorked) : "")}
                  onChange={setInterestTyped}
                  decimals={2}
                  maxDigits={13}
                  placeholder="0"
                  aria-invalid={(tried && interestDue === 0) || undefined}
                  className={cn(input(tried && interestDue === 0), "min-h-14 pl-10 font-heading text-2xl font-bold", interestDue > 0 && "bg-chestnut text-ivory caret-ivory")}
                />
              </span>
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
              <span>
                {tc("q.amount")}
                <RequiredMark />
              </span>
              {/* a chestnut fill once there's an amount */}
              <div className={filled ? "text-ivory [&_button]:text-ivory" : undefined}>
                <MicField onText={(said) => saidAmount(said, typeAmount)}>
                  <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2" aria-hidden />
                  <NumberInput
                    id="amount-field"
                    onBlur={() => value > 0 && setIntoShown(true)}
                    value={amount}
                    onChange={typeAmount}
                    decimals={2}
                    maxDigits={13}
                    max={kind === "loanReturned" && loan ? loan.left : undefined}
                    placeholder="0"
                    aria-invalid={loanOver || (tried && value === 0) || undefined}
                    className={cn(input(loanOver), "min-h-14 pl-10 pr-11 font-heading text-2xl font-bold", filled && "bg-chestnut text-ivory caret-ivory")}
                  />
                </MicField>
              </div>
            </label>
            {/* what's owed, and how much of it this settles (with any TDS they deducted) */}
            <Reveal follow show={dueShown !== null} gap="0.625rem">
              <DueBar due={dueShown ?? 0} settles={kind === "customer" ? Math.min(total, dueShown ?? 0) : total} />
            </Reveal>
            {/* an advance they already have with us, before anything's typed */}
            <Reveal follow show={heldAdvance > 0 && advance === 0} gap="0.625rem">
              <Note className="tabular text-chestnut/70">{t("heldAdvance", { amount: rupees(heldAdvance) })}</Note>
            </Reveal>
          </div>
        )}
        {loanOver && <FieldMessage className="mt-0">{tc("problems.loanLeft", { left: rupees(loan!.left) })}</FieldMessage>}

        {/* the amount's breakup: what came in, the TDS they deducted (its switch and rate in the row), the total, and of
            it the due and the advance */}
        <Reveal follow show={value > 0 && amountRows().length > 2}>
          <AmountTable rows={amountRows()} />
        </Reveal>
        <Reveal follow show={tdsCan && tdsOnIt && value > 0}>
          <Note className="text-chestnut/70">{t(kind === "interestReceived" ? "tdsNote194A" : "tdsNote194Q")}</Note>
        </Reveal>
        </div>

        {/* where it came into, in this same card: revealed once the amount is typed (and kept once picked) */}
        {/* beside the amount on a wider screen, so no gap to take back there */}
        <Reveal follow show={intoShown || into !== null} className="min-w-0 sm:[--reveal-gap:0px]">
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold">{t("steps.into")}</h3>
            {intoTiles()}
          </div>
        </Reveal>
      </div>
    );
  }

  // where it came into, from one list: cash, then each bank account, each with what it holds now (the admin only). A
  // bank's loan comes into a bank account only, so cash isn't listed then
  function intoTiles() {
    const options: { id: string; name: string; sub?: string; hint?: string }[] = [
      ...(bankLoan ? [] : [{ id: "cash", name: tc("cash"), hint: cashHeld === null ? undefined : rupees(cashHeld) }]),
      ...(banks.data ?? []).map((b) => {
        const has = bankHeld(b.id);
        return { id: b.id, name: bankNameIn(b.bankName, locale), sub: `••${b.last4}`, hint: has === null ? undefined : rupees(has) };
      }),
    ];
    const pickedId = into === "cash" ? "cash" : into === "bank" ? (bankId ?? "") : "";
    const pickedOne = options.find((o) => o.id === pickedId && pickedId !== "");
    return (
      <>
        {/* the list opens exactly as wide as the button */}
        <div>
          <PickMenu
            moneyHints
            label={t("steps.into")}
            // the picked one shows its name only (balances are in the list)
            current={pickedOne ? pickedOne.name : t("pickPlace")}
            currentSub={pickedOne?.sub}
            options={options}
            picked={pickedId}
            onPick={(id) => {
              if (id === "cash") {
                setInto("cash");
                setBankId(null);
              } else {
                setInto("bank");
                setBankId(id);
              }
            }}
            invalid={tried && (into === null || (into === "bank" && !bank))}
            matchWidth
            inFlow
            className={cn("min-h-14 text-base font-semibold", pickedOne ? "bg-chestnut text-ivory" : "bg-ivory text-chestnut")}
          />
        </div>
        {/* into a bank account with a UPI ID: its QR for this amount, for the payer to scan */}
        <Reveal follow show={into === "bank" && !!bank && bank.upiIds.length > 0 && value > 0} gap="0.625rem">
          {bank && <UpiQr key={bank.id} upiIds={bank.upiIds} payee={bank.accountHolderName} amount={value} note={fromName ?? undefined} />}
        </Reveal>
        {/* a bank account with no UPI ID: say so, with where to add one (a new tab, so this receipt isn't lost) */}
        <Reveal follow show={into === "bank" && !!bank && bank.upiIds.length === 0} gap="0.625rem">
          {bank && (
          <Note className="text-chestnut/70">
            {t("noUpi")}{" "}
            <Link href={`/account/bank/${bank.id}`} target="_blank" className="font-semibold underline underline-offset-4">
              {t("addUpi")}
            </Link>
          </Note>
          )}
        </Reveal>
        {bankLoan && <Note className="text-chestnut/70">{t("bankOnly")}</Note>}
      </>
    );
  }

  // a loan we took: who gave it first; a bank or NBFC with the loan's account there, a person found or added
  function loanTakenFrom() {
    return (
      <>
        <div role="radiogroup" aria-label={tl("lender")} className="flex flex-wrap gap-2">
          {LENDERS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lender === l}
              onClick={() => {
                if (l === lender) return;
                setLender(l);
                setBankLender(emptyLender());
                setFrom(null);
                setNewParty(emptyParty());
              }}
              className={chip(lender === l)}
            >
              {tl(`lenders.${l}`)}
            </button>
          ))}
        </div>
        {bankLoan && <LenderFields key={bankLoan} type={bankLoan} draft={bankLender} onChange={(patch) => setBankLender((d) => ({ ...d, ...patch }))} tried={tried} />}
        {lender === "individual" && fromPicker()}
      </>
    );
  }

  // a party or ledger of this kind, searched right in the card; the admin adds a new party (its details right here) or
  // a new ledger
  function fromPicker() {
    return (
      <>
        <LedgerSearch
          purpose="receipt"
          receiptKind={kind}
          value={from}
          onChange={(c) => {
            setFrom(c);
            if (c?.kind === "party") setNewParty(emptyParty());
          }}
          canAdd={isAdmin && (fromParty || LEDGER_KINDS.includes(kind!))}
          addParty={fromParty}
          onEdit={isAdmin && from?.kind === "ledger" && (from.ledger.party || (LEDGER_KINDS.includes(kind!) && from.ledger.key === null)) ? () => setEditingFrom((on) => !on) : undefined}
          placeholder={fromParty ? tc("hints.from") : tpf("searchLedger")}
        />

        {/* what's picked, changed right here: a party's details, or the name of a ledger of our own */}
        {editingFrom && from?.kind === "ledger" && from.ledger.party && (
          <PartyEdit
            partyId={from.ledger.referenceId!}
            onCancel={() => setEditingFrom(false)}
            onSaved={(saved) => {
              setEditingFrom(false);
              const home = saved.addresses.find((a) => a.isDefault) ?? saved.addresses[0];
              setFrom({ kind: "ledger", ledger: { ...from.ledger, party: { ...from.ledger.party!, name: saved.name, shortName: saved.shortName, phone: saved.phone, city: home?.city ?? null, upiIds: saved.upiIds } } });
            }}
          />
        )}
        {editingFrom && from?.kind === "ledger" && !from.ledger.party && (
          <HeadEdit
            ledgerId={from.ledger.id}
            name={nameOf(from.ledger)}
            onSaved={(name) => {
              setEditingFrom(false);
              setFrom({ kind: "ledger", ledger: { ...from.ledger, name } });
            }}
            onCancel={() => setEditingFrom(false)}
          />
        )}

        {from?.kind === "party" && partyDetails(newParty, setNewParty, matched, (m) => setFrom({ kind: "ledger", ledger: m }))}
      </>
    );
  }

  // someone new: their details, phone first. A phone someone already has shows them instead: use them, or change the
  // phone
  function partyDetails(draft: PartyDraft, setDraft: React.Dispatch<React.SetStateAction<PartyDraft>>, match: Pickable | null, pickMatch: (m: Pickable) => void) {
    return (
      <>
        <PartyFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} tried={tried} strict asksRemarks={false} onAddressesOpen={() => setTried(false)} onlyPhone={!!match} />
        {match?.party && (
          <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/4 p-3">
            <span className="text-xs font-semibold">{tc("q.phoneMatch")}</span>
            <PartyPick ledger={match} party={match.party} />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={() => pickMatch(match)} className={chip(true)}>
                {tpf("useThem")}
              </button>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, phone: "" }))} className={chip(false)}>
                {tc("changePhone")}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // the loan we gave: searched and picked, each open one with what's left on it (what comes back can't be more than
  // that); who it's with can be changed right here
  function loanCards() {
    if (addingOldLoan) {
      return (
        <OldLoanForm
          given
          newPartyDetails={(draft, setDraft, match, pickMatch) => partyDetails(draft, setDraft, match, pickMatch)}
          onAdded={(id) => {
            setAddedLoanId(id);
            setAddingOldLoan(false);
          }}
          onCancel={() => setAddingOldLoan(false)}
        />
      );
    }
    const details = (l: Loan) =>
      [dayInWords(indiaDay(new Date(l.dated)), locale), l.interestRate !== null && `${l.interestRate}% ${tc("aYear")}`, l.dueOn && tc("dueBy", { day: dayInWords(l.dueOn, locale) })].filter(
        (v): v is string => typeof v === "string" && v !== "",
      );
    // a loan's details: a line each
    const detailLines = (l: Loan) => details(l).map((d) => <span key={d} className="block truncate text-xs opacity-75">{d}</span>);
    if (loan) {
      return (
        <div className="flex flex-col gap-2">
          <div className={PICKED}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{titleCase(loan.partyName)}</span>
              {detailLines(loan)}
            </span>
            <span className="tabular shrink-0 text-sm font-semibold">{rupees(loan.left)}</span>
            {isAdmin && (
              <button type="button" aria-label={tpick("edit")} onClick={() => setEditingFrom((on) => !on)} className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-ivory/10">
                <Pencil className="size-4" aria-hidden />
              </button>
            )}
            <button type="button" onClick={() => setLoan(null)} className="shrink-0 rounded-control px-2 py-1 text-sm font-semibold underline underline-offset-2">
              {tpick("change")}
            </button>
          </div>
          {editingFrom &&
            (loan.lenderId ? (
              <LenderEdit
                lenderId={loan.lenderId}
                onCancel={() => setEditingFrom(false)}
                onSaved={(saved) => {
                  setEditingFrom(false);
                  setLoan({ ...loan, partyName: saved.name, branch: saved.branch });
                }}
              />
            ) : (
              <PartyEdit
                partyId={loan.partyId}
                onCancel={() => setEditingFrom(false)}
                onSaved={(saved) => {
                  setEditingFrom(false);
                  setLoan({ ...loan, partyName: saved.name });
                }}
              />
            ))}
        </div>
      );
    }
    const needle = loanSearch.trim().toLowerCase();
    const shownLoans = (loans.data ?? []).filter((l) => needle === "" || [l.partyName, l.partyPhone ?? ""].some((v) => v.toLowerCase().includes(needle)));
    return (
      <div className="flex flex-col gap-2">
        <label className={cn(PICK_SEARCH, fieldClass(false))}>
          <Search className="size-4 shrink-0" aria-hidden />
          <input
            type="search"
            value={loanSearch}
            maxLength={60}
            aria-label={tc("q.loan")}
            placeholder={tc("hints.from")}
            onChange={(e) => setLoanSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-chestnut/60"
          />
          <MicButton onText={setLoanSearch} />
        </label>
        <div className={cn(PICK_LIST, PICK_TWO_COLUMNS)}>
          {shownLoans.map((l) => (
            <button key={l.id} type="button" onClick={() => setLoan(l)} className={PICK_ROW}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{titleCase(l.partyName)}</span>
                {detailLines(l)}
              </span>
              <span className={cn("tabular shrink-0 text-sm", l.overdue && "text-danger")}>{rupees(l.left)}</span>
            </button>
          ))}
          {loans.isPending && (
            <p className="col-span-full flex items-center gap-2 px-1 py-2 text-sm">
              <Spinner className="size-4" /> {tc("looking")}
            </p>
          )}
          {!loans.isPending && shownLoans.length === 0 && <p className="col-span-full px-1 py-2 text-sm">{tc("noLoans")}</p>}
          {/* a loan from before the app, added right here */}
          {isAdmin && (
            <div className={PICK_NEW}>
              <button type="button" onClick={() => setAddingOldLoan(true)} className={ADD_ON_IVORY}>
                <Plus className="size-4" aria-hidden /> {tc("oldLoan")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
}
