"use client";

import { ArrowDown, Banknote, CircleAlert, IndianRupee, Landmark, Pencil, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Note } from "~/components/ui/note";
import { ADD_ON_IVORY, PAGE, PICK_LIST, PICK_NEW, PICK_ROW, PICK_SEARCH, PICK_TWO_COLUMNS, PICKED } from "~/components/ui/page-styles";
import { fieldClass } from "~/components/ui/card-form";
import { DateInput, dayInWords } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicButton, MicField } from "~/components/ui/mic-button";
import { PickMenu } from "~/components/stock/pick-menu";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { rupees, titleCase } from "~/lib/format";
import { wordsToNumber } from "~/lib/number-words";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { indiaDay } from "../account/balance";
import { useLedgerName } from "../account/ledger-name";
import { useSameNameConfirm } from "../account/party/same-name";
import { partyLabel } from "../account/party/party-kinds";
import { PartyEdit } from "../account/party/party-sheet";
import { LandlordSearch } from "../entities/landlord-search";
import {
  draftInput as partyInput,
  draftOk as partyOk,
  emptyDraft as emptyParty,
  PartyFields,
  type PartyDraft,
} from "../account/party/party-fields";
import { HeadEdit, type LedgerChoice, LedgerSearch, type PaymentKind, type Pickable } from "./ledger-picker";
import { LenderEdit } from "./lender-fields";
import { emptyLoan, type LoanDraft, loanProblems, LoanTerms } from "./loan-terms";
import { OldLoanForm } from "./old-loan-form";
import { PartyPick, usePhoneMatches } from "./party-finder";
import { type TdsType, TdsTypePicker } from "./tds-type-picker";

type Loan = RouterOutputs["transactions"]["due"]["openLoans"][number];

// the cards, in order (only the ones that apply are shown)
type Step = "kind" | "to" | "payee" | "gst" | "terms" | "rent" | "amount" | "source" | "details";

// what it can be paid for, in the order people reach for them; which go to a party (found or added), and which name
// an open loan we took
const KINDS: PaymentKind[] = [
  "supplier",
  "loanRepaid",
  "interestPaid",
  "loanGiven",
  "expense",
  "taxPaid",
  "refund",
];
const PARTY_KINDS: PaymentKind[] = ["supplier", "loanGiven", "refund"];
const LOAN_KINDS: PaymentKind[] = ["loanRepaid", "interestPaid"];

// an expense's GST: none, or on the supplier's bill
type GstMode = "none" | "bill";
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const BILL_RATES = [5, 12, 18, 28, 40] as const;
const BILL_NUMBER_MAX = 16;
// the most labour can be paid with nobody named: one payment up to this carries no TDS
const LABOUR_SKIP_MAX = 30_000;

const REFERENCE_MAX = 30;
const REMARKS_MAX = 100;

const input = (bad: boolean) =>
  `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;
const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-control border px-3.5 text-sm font-semibold transition-colors",
    on ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50 hover:bg-chestnut/[0.06]",
  );
// a choice that carries money (cash, a bank account, a loan): the picked one is filled chestnut, the others only have
// an edge; one holding nothing can't be picked
const tile = (on: boolean) =>
  cn(
    "rounded-control border-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
    on ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/25 hover:border-chestnut/60",
  );
// a Paid from tile's row: the name on the left, the balance on the right (under it if they can't fit)
const SOURCE_ROW = "flex flex-wrap content-start items-center justify-between gap-x-2 gap-y-1";
// its amount, large and bold
const money = "tabular font-heading font-bold leading-tight";

// a ledger of a customer or supplier (or a party with no sale or purchase yet): only they have TDS deducted
const isParty = (l: Pickable) =>
  l.masterKey === "debtors" ||
  l.masterKey === "creditors" ||
  l.masterKey === "debtorCreditors" ||
  l.masterKey === "parties";


// a day as the moment it's saved at: now for today, noon (India) for any other day
const momentOf = (day: string) =>
  day === indiaDay(new Date()) ? new Date() : new Date(`${day}T12:00:00+05:30`);


// a spoken amount ("twenty five thousand") into a number field; anything that isn't a number is left alone
const saidAmount = (said: string, set: (raw: string) => void) => {
  const n = wordsToNumber(said);
  if (n !== null) set(String(n));
};

// /transaction/payment: money paid out, as cards that appear one by one: each shows once the one above it is filled
// in, and every card stays open to change. 1 Paid from: cash or a bank account (only those holding money, for the
// admin who sees balances) and the amount, never more than it holds; 2 Paid for; 3 Paid to (a party found or added,
// the open loan, an expense or tax ledger); 4 TDS (a supplier); 5 a loan given's terms; 6 the day, reference and
// remarks; then Save. A save goes to the payment's own page. Discarding to open a menu starts the form again
export function PaymentForm({ isAdmin }: { isAdmin: boolean }) {
  const [round, setRound] = useState(0);
  return <PaymentEntry key={round} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />;
}

function PaymentEntry({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const t = useTranslations("transactions.payment.form");
  const tc = useTranslations("transactions.chat");
  const tpick = useTranslations("transactions.picker");
  const tp = useTranslations("transactions.payment.chat");
  // month names in the app's language
  const locale = useLocale();
  const tk = useTranslations("transactions.payment.kinds");
  const tl = useTranslations("transactions.loan");
  const nameOf = useLedgerName();
  const sameName = useSameNameConfirm();
  const utils = trpc.useUtils();
  const router = useRouter();
  const banks = trpc.accounts.bank.pickable.useQuery();
  // what cash and each bank account hold today (null for staff, who don't see balances)
  const sources = trpc.transactions.payment.sources.useQuery();
  const create = trpc.transactions.payment.create.useMutation();

  // the answers
  const [into, setInto] = useState<"cash" | "bank" | null>(null);
  const [bankId, setBankId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<PaymentKind | null>(null);
  const [to, setTo] = useState<LedgerChoice>(null);
  const [newParty, setNewParty] = useState<PartyDraft>(() => emptyParty());
  // an expense head added here: the TDS its payments carry
  const [newHeadTds, setNewHeadTds] = useState<TdsType | null>(null);
  // an expense to a head with TDS: who was paid (a party found, or one added here)
  const [payee, setPayee] = useState<LedgerChoice>(null);
  const [newPayee, setNewPayee] = useState<PartyDraft>(() => emptyParty());
  // a PAN for someone with none on record, where TDS is at the higher rate because of it
  const [pan, setPan] = useState("");
  // casual labour paid with nobody named
  const [payeeSkipped, setPayeeSkipped] = useState(false);
  // rent: the landlord it was paid to
  const [landlordId, setLandlordId] = useState<string | null>(null);
  const [gstMode, setGstMode] = useState<GstMode>("none");
  const [gstin, setGstin] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState("");
  const [billRate, setBillRate] = useState<(typeof BILL_RATES)[number] | null>(null);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [terms, setTerms] = useState<LoanDraft>(emptyLoan);
  const [dueOn, setDueOn] = useState("");
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  // rent: the months being paid, and each godown's rent a month where it's changed for this payment
  const [rentMonths, setRentMonths] = useState("1");
  const [rentEdits, setRentEdits] = useState<Record<string, string>>({});
  const [editingRent, setEditingRent] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);

  // what's typed, worked out
  const value = Number(amount) || 0;
  const bank = banks.data?.find((b) => b.id === bankId);
  const cashHeld = sources.data?.cash ?? null;
  const bankHeld = (id: string) => sources.data?.banks.find((b) => b.id === id)?.available ?? null;
  const held = into === "cash" ? cashHeld : into === "bank" && bankId ? bankHeld(bankId) : null;
  // a source that holds nothing isn't offered (staff see no balances, so both are; the save still checks)
  const hasMoney = (balance: number | null) => balance === null || balance > 0;
  const allBanks = sources.data?.banks ?? [];
  const banksHeld =
    allBanks.length > 0 && allBanks.every((b) => b.available !== null)
      ? allBanks.reduce((sum, b) => sum + (b.available ?? 0), 0)
      : null;
  const canCash = hasMoney(cashHeld);
  const canBank = (banks.data?.length ?? 0) > 0 && hasMoney(banksHeld);
  const loanOf = kind !== null && LOAN_KINDS.includes(kind);
  const toParty = kind !== null && PARTY_KINDS.includes(kind);
  const loans = trpc.transactions.due.openLoans.useQuery(
    { kind: "loanTaken" },
    { enabled: loanOf },
  );
  // an old loan being added in the Paid to card, and the one just added, picked once the list has it
  const [addingOldLoan, setAddingOldLoan] = useState(false);
  // the picked supplier's details being changed
  const [editingTo, setEditingTo] = useState(false);
  useEffect(() => setEditingTo(false), [kind, to?.kind === "ledger" ? to.ledger.id : null]);
  const [editingPayee, setEditingPayee] = useState(false);
  useEffect(() => setEditingPayee(false), [kind, payee?.kind === "ledger" ? payee.ledger.id : null]);
  const [editingLoan, setEditingLoan] = useState(false);
  useEffect(() => setEditingLoan(false), [kind, loan?.id]);
  const [loanSearch, setLoanSearch] = useState("");
  const [addedLoanId, setAddedLoanId] = useState<string | null>(null);
  useEffect(() => {
    const added = loans.data?.find((l) => l.id === addedLoanId);
    if (!added) return;
    setLoan(added);
    setAddedLoanId(null);
  }, [loans.data, addedLoanId]);
  const phoneMatches = usePhoneMatches(newParty.phone, "customer");
  // a new party's phone someone already has (one phone, one party): they're used instead, or the phone is changed
  const matched = to?.kind === "party" && phoneMatches.length > 0 ? phoneMatches[0]! : null;
  const tdsParty =
    kind === "supplier" && ((to?.kind === "ledger" && isParty(to.ledger)) || to?.kind === "party");
  // an expense head's TDS (rent, transport and labour, brokerage): its payment then names who was paid
  const headTds = kind === "expense" ? (to?.kind === "ledger" ? to.ledger.tdsType : to?.kind === "new" ? newHeadTds : null) : null;
  // rent is paid only to landlords
  const rent = headTds === "rent";
  const landlords = trpc.accounts.landlord.pick.useQuery(undefined, { enabled: rent });
  const landlord = rent ? landlords.data?.find((l) => l.id === landlordId) : undefined;
  const hasPayee = rent ? !!landlord : payee !== null;
  // GST is asked on every expense but those the website decides itself: transport (truck owners, who charge none),
  // legal fees and rent from a landlord with no GSTIN (always reverse charge)
  const headKey = to?.kind === "ledger" ? to.ledger.key : null;
  // labour can skip who was paid, up to the amount a payment can carry no TDS; above it TDS needs a name
  // an advocate or a professional can be added with no phone
  const payeePhoneOptional = headKey === "legalFees" || headKey === "professionalFees";
  const canSkipPayee = headKey === "labour" && value <= LABOUR_SKIP_MAX;
  const skipped = payeeSkipped && canSkipPayee;
  const offersGst = kind === "expense" && to !== null && headKey !== "transport" && headKey !== "legalFees" && !(rent && !landlord?.gstin);
  const gstinOk = GSTIN_RE.test(gstin);
  const gstInput =
    !offersGst || gstMode === "none"
      ? null
      : gstinOk && billNumber !== "" && billDate !== "" && billRate !== null
        ? { mode: "bill" as const, gstin, billNumber, billDate, rate: billRate }
        : null;
  const payeeMatches = usePhoneMatches(newPayee.phone, "customer");
  const payeeMatched = payee?.kind === "party" && payeeMatches.length > 0 ? payeeMatches[0]! : null;

  // a PAN typed in full counts straight away; it's for this person only
  const panGiven = PAN_RE.test(pan) ? pan : null;
  const panBad = pan !== "" && panGiven === null;
  useEffect(() => setPan(""), [kind, to, payee, landlordId, loan?.id]);

  // staff don't see balances: once typing pauses, the server says whether the amount fits
  const [askedAmount, setAskedAmount] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setAskedAmount(value), 400);
    return () => clearTimeout(timer);
  }, [value]);
  // a supplier's TDS (section 194Q) is the website's to work out, never asked: the server says what it comes to
  const supplierTds = trpc.transactions.payment.supplierTds.useQuery(
    {
      paidToLedgerId: to?.kind === "ledger" ? to.ledger.id : null,
      newPartyHasPan: PAN_RE.test(pan),
      pan: panGiven,
      amount: askedAmount,
      // the end of the day (a fixed moment, so the question doesn't change on every render)
      dateTime: new Date(`${day}T23:59:59+05:30`),
    },
    { enabled: tdsParty && askedAmount > 0 && day !== "" },
  );
  const tdsInfo = tdsParty && askedAmount === value ? (supplierTds.data ?? null) : null;
  // an expense's TDS and reverse-charge GST (rent from a landlord without a GSTIN), worked out by the server too
  const expenseTax = trpc.transactions.payment.expenseTax.useQuery(
    {
      paidToLedgerId: to?.kind === "ledger" ? to.ledger.id : null,
      newHeadTdsType: to?.kind === "new" ? newHeadTds : null,
      payeeLedgerId: !rent && payee?.kind === "ledger" ? payee.ledger.id : null,
      payeeLandlordId: landlord?.id ?? null,
      newPayee: !rent && payee?.kind === "party",
      newPayeePan: PAN_RE.test(pan) ? pan : "",
      newPayeeHasGstin: newPayee.addresses.some((a) => a.gstin.trim() !== ""),
      newPayeeDeclared: newPayee.transportDeclaration,
      rentMonths: rent ? Number(rentMonths) || 1 : 1,
      gst: gstInput,
      pan: panGiven,
      amount: askedAmount,
      dateTime: new Date(`${day}T23:59:59+05:30`),
    },
    { enabled: (headTds !== null || gstInput !== null) && askedAmount > 0 && day !== "" },
  );
  const tax = (headTds || gstInput) && askedAmount === value ? (expenseTax.data ?? null) : null;
  // interest on a loan we took: its TDS depends on who gave it, as told when the loan was registered
  const interestTds = trpc.transactions.payment.interestTds.useQuery(
    { dueId: loan?.id ?? "", pan: panGiven, amount: askedAmount, dateTime: new Date(`${day}T23:59:59+05:30`) },
    { enabled: kind === "interestPaid" && loan !== null && askedAmount > 0 && day !== "" },
  );
  const interestInfo = kind === "interestPaid" && loan && askedAmount === value ? (interestTds.data ?? null) : null;
  const tdsAmount = tdsInfo?.tds ?? tax?.tds?.tds ?? interestInfo?.tds?.tds ?? 0;
  const tdsRate = tdsInfo?.rate ?? tax?.tds?.rate ?? interestInfo?.tds?.rate ?? 0;
  const noPan = tdsInfo ? tdsInfo.rate === 5 : (tax?.tds?.rate ?? interestInfo?.tds?.rate) === 20;
  // a payment that can carry TDS (its year's switch is on): its breakup shows even while it's under the limit
  // anyone with no PAN where TDS applies, saved or new: asked below the amount, and it stays on their record
  const asksPan = tdsInfo?.rate === 5 || !!tax?.panMissing || !!interestInfo?.panMissing || pan !== "";
  const tdsApplies = tdsInfo !== null || (!!tax?.applies && !skipped) || !!interestInfo?.applies;
  // an expense's TDS depends on who was paid, so it's open until they're picked
  const tdsKnown = tdsInfo !== null || hasPayee || interestInfo !== null;
  // the amount typed is without TDS and reverse-charge GST; with them, it must still fit what the source holds
  const rcmAmount = tax?.rcm?.gst ?? 0;
  const total = Math.round((value + tdsAmount + rcmAmount) * 100) / 100;
  // reverse charge is open on rent until the landlord is picked, as it depends on their GSTIN
  // a Pay button or calculator: the total to reach, TDS included (reverse-charge GST goes on top). The amount typed is what's handed over, so once the TDS is known the
  // amount moves until the total is that figure; a few tries, so it can't chase a limit for ever
  const [totalGoal, setTotalGoal] = useState<{ total: number; tries: number } | null>(null);
  const [interestMonths, setInterestMonths] = useState("12");
  // interest typed in, from a statement: it replaces what the months come to, until the months are changed
  const [interestTyped, setInterestTyped] = useState<string | null>(null);
  useEffect(() => setInterestTyped(null), [loan?.id]);
  useEffect(() => {
    if (!totalGoal || (!interestInfo && !tdsInfo && !tax) || totalGoal.tries >= 6) return;
    const gap = Math.round((total - rcmAmount - totalGoal.total) * 100) / 100;
    if (Math.abs(gap) <= 0.01) return;
    setTotalGoal({ ...totalGoal, tries: totalGoal.tries + 1 });
    // each rupee paid carries its share of TDS, so the step is that much smaller
    setAmount(String(Math.round((value - (gap * (100 - tdsRate)) / 100) * 100) / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the TDS answer comes
  }, [interestInfo, tdsInfo, tax]);
  // what's typed or spoken replaces a button's amount
  const typeAmount = (raw: string) => {
    autoFilled.current = false;
    setTotalGoal(null);
    setAmount(raw);
  };
  const payTotal = (goal: number) => {
    setTotalGoal({ total: goal, tries: 0 });
    setAmount(String(goal));
  };

  // a loan's interest and a landlord's rent are worked out, not typed: the months being paid, on what's left at the loan's
  // rate or at a month's rent, which starts from what their godowns come to and can be changed for this payment; TDS included
  const interestCalc = kind === "interestPaid" && !!loan?.interestRate;
  // a row per godown; a landlord with none (or staff, who don't see rents) has one row to fill in
  const rentRows = landlord ? (landlord.godowns.length > 0 ? landlord.godowns : [{ id: "rent", name: t("rentDue"), monthlyRent: 0 }]) : [];
  const rentOf = (row: (typeof rentRows)[number]) => rentEdits[row.id] ?? (row.monthlyRent > 0 ? String(row.monthlyRent) : "");
  // neither rent nor months go below 1: a 0 becomes 1 as it's typed
  const atLeastOne = (typed: string) => (typed !== "" && Number(typed) < 1 ? "1" : typed);
  const monthlyRent = rentRows.reduce((sum, row) => sum + (Number(rentOf(row)) || 0), 0);
  const rentCalc = rent && !!landlord;
  // another landlord starts from their own rent
  useEffect(() => {
    setRentMonths("1");
    setRentEdits({});
    setEditingRent(null);
  }, [landlordId]);
  const calc = interestCalc || rentCalc;
  const interestWorked = interestCalc ? Math.round((loan!.left * loan!.interestRate! * Number(interestMonths)) / 12) / 100 : 0;
  const calcDue = interestCalc
    ? interestTyped !== null ? Number(interestTyped) : interestWorked
    : rentCalc
      ? Math.round(monthlyRent * Number(rentMonths) * 100) / 100
      : 0;
  useEffect(() => {
    if (!calc) return;
    setTotalGoal(calcDue > 0 ? { total: calcDue, tries: 0 } : null);
    setAmount(calcDue > 0 ? String(calcDue) : "");
  }, [calc, calcDue]);

  // what can pay the total: a source that doesn't hold it isn't offered (staff see no balances, so the save still checks)
  const cashCovers = cashHeld === null || cashHeld >= total;
  const coveringBanks = (banks.data ?? []).filter((b) => {
    const has = bankHeld(b.id);
    return has === null || (has > 0 && has >= total);
  });
  const bankCovers = coveringBanks.length > 0;
  // the most any one place holds; past it, nothing could pay
  const mostHeld = cashHeld === null ? null : Math.max(cashHeld, ...allBanks.map((b) => b.available ?? 0));
  const tooMuch = mostHeld !== null && total > mostHeld;
  // the amount settled: a source that can't pay it lets go, and the only one that can is picked
  useEffect(() => {
    if (askedAmount !== value || value <= 0 || !sources.data || !banks.data) return;
    if (into === "cash" && !cashCovers) setInto(null);
    if (into === "bank" && !bankCovers) setInto(null);
    if (bankId !== null && !coveringBanks.some((b) => b.id === bankId)) setBankId(null);
    if (into === null && cashCovers && !bankCovers) setInto("cash");
    if (into === null && bankCovers && !cashCovers) setInto("bank");
    if (into === "bank" && bankId === null && coveringBanks.length === 1) setBankId(coveringBanks[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the amount or source changes
  }, [askedAmount, value, total, into, bankId, sources.data, banks.data]);
  const rcmOpen = (rent || headKey === "legalFees") && !hasPayee;
  const asksGst = offersGst && !tax?.rcm;
  const breakup = tdsApplies || !!tax?.rcm || rcmOpen;
  const fits = trpc.transactions.payment.fits.useQuery(
    {
      settledIn: into ?? "cash",
      bankDetailsId: into === "bank" ? bankId : null,
      amount: askedAmount === value ? total : askedAmount,
    },
    {
      enabled:
        into !== null &&
        (into === "cash" || !!bankId) &&
        held === null &&
        sources.isSuccess &&
        askedAmount > 0,
    },
  );

  const over = held !== null ? total > held : askedAmount === value && fits.data?.fits === false;
  const loanOver = kind === "loanRepaid" && loan !== null && value > loan.left;
  // what a tax has owing, and what a supplier is owed (staff see no balances, so neither is known to them)
  const toBalance = to?.kind === "ledger" ? to.ledger.balance?.today ?? null : null;
  const taxOwed = kind === "taxPaid" && toBalance ? toBalance.amount : null;
  const supplierDue = kind === "supplier" && toBalance?.side === "credit" && toBalance.amount > 0 ? toBalance.amount : null;
  // what's still owed on the loan, tax or supplier picked (shown above the amount when there's any)
  const unpaid = kind === "loanRepaid" ? (loan?.left ?? null) : kind === "taxPaid" ? taxOwed : supplierDue;
  const dueShown = unpaid !== null && unpaid > 0 ? unpaid : null;
  // picking one fills in what's unpaid, or the most any one place holds when that's less; once each, so what's typed
  // afterwards stays
  const unpaidOf = kind === "loanRepaid" ? (loan?.id ?? null) : dueShown !== null && to?.kind === "ledger" ? to.ledger.id : null;
  const filledFor = useRef<string | null>(null);
  // a filled-in amount belongs to its pick: picking someone else clears it (one that was typed stays)
  const autoFilled = useRef(false);
  const pickKey = kind === "loanRepaid" ? (loan?.id ?? null) : to?.kind === "ledger" ? to.ledger.id : null;
  useEffect(() => {
    if (!autoFilled.current) return;
    autoFilled.current = false;
    setTotalGoal(null);
    setAmount("");
  }, [pickKey]);
  useEffect(() => {
    if (unpaidOf === null || unpaid === null || !sources.isSuccess || filledFor.current === unpaidOf) return;
    filledFor.current = unpaidOf;
    const goal = mostHeld === null ? unpaid : Math.min(unpaid, mostHeld);
    if (goal <= 0) return;
    // a supplier's TDS comes out of the total, so it's the total that's filled
    if (kind === "supplier") payTotal(goal);
    else typeAmount(String(goal));
    autoFilled.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when another loan or supplier is picked
  }, [unpaidOf, sources.isSuccess]);
  // the most the amount can be typed up to: what's left on a loan, what a tax owes, or what labour can go unnamed for
  const cap = kind === "loanRepaid" && loan ? loan.left : taxOwed !== null ? taxOwed : skipped ? LABOUR_SKIP_MAX : undefined;

  // when each card is filled in
  // the amount's fill: not while it's over what's held, when it shows red
  const filled = value > 0 && !over;
  // what an expense or a tax is paid under is picked in the Paid for card itself
  const subInKind = kind === "expense" || kind === "taxPaid";
  const toDone = loanOf
    ? loan !== null && !loanOver
    : to !== null && (to.kind !== "party" || (!matched && partyOk(newParty, true)));
  const sourceDone = into !== null && (into === "cash" || !!bank) && !over && (held !== null || (askedAmount === value && fits.data?.fits === true));
  const complete: Record<Step, boolean> = {
    rent: rentRows.every((row) => Number(rentOf(row)) >= 1) && Number(rentMonths) >= 1,
    amount: value > 0 && !tooMuch && !loanOver && sourceDone,
    source: sourceDone,
    kind: kind !== null && (!subInKind || toDone),
    to: toDone,
    payee: rent ? !!landlord : skipped || (payee !== null && (payee.kind !== "party" || (!payeeMatched && partyOk(newPayee, true, payeePhoneOptional)))),
    gst: gstMode === "none" || gstInput !== null,
    terms: !Object.values(loanProblems(terms)).some(Boolean) && !(dueOn !== "" && dueOn < day),
    details: day !== "" && !panBad,
  };
  // the cards that apply now, shown up to the first one not yet filled in
  const steps: Step[] = [
    "kind",
    ...(subInKind ? [] : (["to"] as Step[])),
    ...(headTds ? (["payee"] as Step[]) : []),
    ...(asksGst ? (["gst"] as Step[]) : []),
    ...(kind === "loanGiven" ? (["terms"] as Step[]) : []),
    ...(rentCalc ? (["rent"] as Step[]) : []),
    "amount",
    "details",
  ];
  const firstOpen = steps.findIndex((s) => !complete[s]);
  // a card once open stays open while something above it is changed, so the page never jumps; only changing what it
  // was paid for asks the rest again
  const opened = useRef(new Set<string>(["kind"]));
  // nothing past what it was for, or who it went to, shows until those are done, nor past an amount nothing can pay; an
  // amount being changed otherwise leaves the rest
  const firstWho = steps.findIndex((s) => ((s === "kind" || s === "to" || s === "payee") && !complete[s]) || (s === "amount" && tooMuch));
  const shown = firstOpen === -1 ? steps : steps.filter((s, i) => (i <= firstOpen || opened.current.has(s)) && (firstWho === -1 || i <= firstWho));
  const ready = firstOpen === -1;

  // a card's name; an expense's "Paid to" card is its head, and who was paid has its own
  const stepName = (s: Step) => t(rentCalc && s === "amount" ? "steps.source" : kind === "expense" && s === "to" ? "steps.head" : kind === "taxPaid" && s === "to" ? "steps.tax" : s === "details" && into !== "bank" ? "steps.remarks" : `steps.${s}`);

  // someone new being filled in: Change, beside the card's name, goes back to searching
  const changeOf = (s: Step) => {
    if (s === "to" && to?.kind === "party") {
      return () => {
        setTo(null);
        setGstMode("none");
        setPayeeSkipped(false);
      };
    }
    if (s === "payee" && payee?.kind === "party") {
      return () => {
        setPayee(null);
        setPayeeSkipped(false);
      };
    }
    return null;
  };

  // what's answered so far, a line each, for the summary (a card left empty has none)
  const toName = loanOf
    ? loan && titleCase(loan.partyName)
    : to?.kind === "ledger"
      ? (to.ledger.party ? titleCase(to.ledger.party.name) : nameOf(to.ledger))
      : to?.kind === "new"
        ? to.name
        : to?.kind === "party"
          ? titleCase(newParty.name) || tc("newParty")
          : null;
  const summary: { step: Step; value: string | null }[] = [
    {
      step: "source",
      value: into === "cash" ? tc("cash") : bank ? `${titleCase(bank.bankName)} ••${bank.last4}` : null,
    },
    { step: "kind", value: kind && tk(kind) },
    { step: "to", value: toName },
    {
      step: "payee",
      value: landlord
        ? partyLabel(landlord)
        : skipped
          ? tc("skipped")
          : payee?.kind === "ledger"
          ? payee.ledger.party
            ? titleCase(payee.ledger.party.name)
            : nameOf(payee.ledger)
          : payee?.kind === "party"
            ? titleCase(newPayee.name) || tc("newParty")
            : null,
    },
    {
      step: "gst",
      value: gstMode === "none" ? null : t(`gstModes.${gstMode}`),
    },
    {
      step: "terms",
      value:
        kind === "loanGiven" && terms.rate !== ""
          ? [
              `${terms.rate}% ${tc("aYear")}`,
              terms.frequency && tl(`frequencies.${terms.frequency}`),
              dueOn && tc("dueBy", { day: dayInWords(dueOn, locale) }),
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
    },
    {
      step: "details",
      value: [into === "bank" && reference, remarks.trim()].filter(Boolean).join(" · ") || null,
    },
  ];

  // leaving with something entered asks first (not after a save, which goes on to the payment's page)
  const { dialog: leaveDialog } = useLeaveGuard(!create.isSuccess && (value > 0 || kind !== null || remarks !== ""), onDiscard);

  // when a card opens for the first time, the form moves only as far as shows it whole, and not at all if it's already
  // in view. While the amount or a new party's details are being typed it waits: the page keeps still, a button at the
  // bottom says what came next if it's out of view (a phone's keyboard closing doesn't leave the field), and leaving
  // the field (or that button) then scrolls on
  const scroller = useRef<HTMLDivElement>(null);
  const cards = useRef<HTMLElement[]>([]);
  // Save shows once it's known what the money was for, filled in or not
  const canSave = kind !== null;
  const shownCount = shown.length + (canSave ? 1 : 0);
  const order = [...shown, ...(canSave ? ["save"] : [])];
  // the card that came while the page held still, until it's scrolled to or into view
  const [waitingAt, setWaitingAt] = useState<number | null>(null);
  // how far down the form has to move to show a card whole, never past the card's top
  const shortBy = (index: number) => {
    const box = scroller.current;
    const card = cards.current[index];
    if (!box || !card) return 0;
    return Math.min(card.offsetTop - 12, card.offsetTop + card.offsetHeight + 12 - box.clientHeight) - box.scrollTop;
  };
  const goTo = (index: number) => {
    const far = shortBy(index);
    if (far > 0) scroller.current?.scrollBy({ top: far, behavior: "smooth" });
    setWaitingAt(null);
  };
  // the waiting card scrolled into view by hand: the button goes
  const onScroll = () => {
    const box = scroller.current;
    const card = waitingAt === null ? undefined : cards.current[waitingAt];
    if (box && card && card.offsetTop < box.scrollTop + box.clientHeight - 80) setWaitingAt(null);
  };
  useEffect(() => {
    // a card hidden again counts as new when it comes back, so the form moves to it
    for (const o of [...opened.current]) if (!order.includes(o)) opened.current.delete(o);
    const first = order.findIndex((o) => !opened.current.has(o));
    order.forEach((o) => opened.current.add(o));
    if (first === -1) return;
    // a card still loading (a list of parties) grows just after it opens, so the form follows it for a moment
    let growing: ResizeObserver | undefined;
    let settled: ReturnType<typeof setTimeout> | undefined;
    const scrollOn = () => {
      goTo(first);
      const card = cards.current[first];
      if (!card) return;
      growing = new ResizeObserver(() => goTo(first));
      growing.observe(card);
      settled = setTimeout(() => growing?.disconnect(), 1500);
    };
    const partyCard =
      to?.kind === "party" ? cards.current[shown.indexOf("to")] : payee?.kind === "party" ? cards.current[shown.indexOf("payee")] : undefined;
    const amountCard = cards.current[shown.indexOf("amount")];
    let holder: HTMLElement | undefined;
    let left: ReturnType<typeof setTimeout> | undefined;
    // focus left what's being typed (checked a moment later, as a picker inside it may take focus next)
    const onLeave = () => {
      clearTimeout(left);
      left = setTimeout(() => {
        if (holder?.contains(document.activeElement)) return;
        holder?.removeEventListener("focusout", onLeave);
        scrollOn();
      }, 300);
    };
    const timer = setTimeout(() => {
      const active = document.activeElement;
      holder = partyCard?.contains(active) ? partyCard : active instanceof HTMLInputElement && amountCard?.contains(active) ? amountCard : undefined;
      if (!holder) return scrollOn();
      if (shortBy(first) <= 0) return;
      holder.addEventListener("focusout", onLeave);
      setWaitingAt(first);
    }, 500);
    return () => {
      clearTimeout(timer);
      clearTimeout(left);
      clearTimeout(settled);
      growing?.disconnect();
      holder?.removeEventListener("focusout", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when cards appear
  }, [order.join()]);

  // a summary line scrolls its card into view, to check or change it
  function jump(step: Step) {
    const card = cards.current[shown.indexOf(step === "source" ? "amount" : step)];
    if (card) scroller.current?.scrollTo({ top: card.offsetTop - 12, behavior: "smooth" });
  }

  // Save with something missing: show it in red and take them to the first card not done, at its first field in red
  function guide() {
    setTried(true);
    setTimeout(() => {
      const box = scroller.current;
      const card = cards.current[firstOpen];
      if (!box || !card) return;
      const field = card.querySelector<HTMLElement>('[aria-invalid="true"]');
      const target = field ?? card;
      const top = target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - (field ? 96 : 12);
      box.scrollTo({ top, behavior: "smooth" });
      field?.focus({ preventScroll: true });
    }, 50);
  }

  async function save() {
    if (!ready) return guide();
    // a new party with the same name in the same town: asked first
    if (!loanOf && to?.kind === "party" && !(await sameName.confirm(newParty))) return;
    if (headTds && !rent && payee?.kind === "party" && !(await sameName.confirm(newPayee))) return;
    setSaveError(null);
    try {
      const r = await create.mutateAsync({
        dateTime: momentOf(day),
        paidFor: kind!,
        paidToLedgerId: !loanOf && to?.kind === "ledger" ? to.ledger.id : null,
        dueId: loanOf ? loan!.id : null,
        newLedger: !loanOf && to?.kind === "new" ? { name: to.name, tdsType: kind === "expense" ? newHeadTds : null } : null,
        newParty: !loanOf && to?.kind === "party" ? partyInput(newParty) : null,
        payeeLedgerId: headTds && !rent && payee?.kind === "ledger" ? payee.ledger.id : null,
        payeeLandlordId: landlord?.id ?? null,
        newPayee: headTds && !rent && payee?.kind === "party" ? partyInput(newPayee) : null,
        rentMonths: rent ? Number(rentMonths) || 1 : 1,
        gst: gstInput,
        pan: panGiven,
        loan:
          kind === "loanGiven"
            ? {
                interestRate: Number(terms.rate),
                frequency: terms.frequency!,
                dueOn: dueOn || null,
              }
            : null,
        amount: value,
        settledIn: into!,
        bankDetailsId: into === "bank" ? bankId : null,
        referenceNumber: into === "bank" ? reference : "",
        remarks,
      });
      void utils.accounts.invalidate();
      void utils.transactions.due.invalidate();
      // on to the payment's own page with what the save gave back already in hand; replace, so going back doesn't
      // land on the filled form
      utils.transactions.payment.get.setData({ transactionId: r.transactionId }, r);
      utils.transactions.payment.balances.setData({ transactionId: r.transactionId }, r.balances);
      router.replace(`/transaction/payment/${r.transactionId}`);
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "CONFLICT" && (err as { message?: string }).message?.startsWith("Phone"))
        return setSaveError(tc("saveErrors.phone"));
      if (code === "PRECONDITION_FAILED") return setSaveError(tp("saveErrors.balance"));
      setSaveError(
        code === undefined
          ? tc("saveErrors.network")
          : code === "CONFLICT"
            ? tc("saveErrors.taken")
            : code === "BAD_REQUEST"
              ? tc("saveErrors.check")
              : tp("saveErrors.failed"),
      );
    }
  }

  // the balances first, so cash and bank show what they hold from the start
  if (sources.isPending || banks.isPending)
    return (
      <main className={`${PAGE} pb-28`}>
        <h1 className="sr-only">{tp("title")}</h1>
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {tc("looking")}
        </p>
      </main>
    );

  // nothing to pay from (the admin sees cash and every bank at ₹0)
  if (sources.data && banks.data && !canCash && !canBank)
    return (
      <main className={`${PAGE} pb-28`}>
        <h1 className="sr-only">{tp("title")}</h1>
        <p className="on-ivory flex items-center gap-2 rounded-2xl bg-ivory p-5 text-chestnut">
          <CircleAlert className="size-5 shrink-0" aria-hidden /> {t("nothingToPay")}
        </p>
      </main>
    );

  // the page stays put under the header (and above the phone's bar); only the cards scroll. On a wide screen the
  // summary of what's filled in stays beside them, with Save, so it's checked without scrolling back
  return (
    <main className="mx-auto flex h-[calc(100dvh-10rem)] w-full max-w-6xl gap-6 lg:h-[calc(100dvh-4rem)] lg:px-6">
      <h1 className="sr-only">{tp("title")}</h1>
      {leaveDialog}
      {sameName.dialog}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="scrollbar-none relative min-h-0 w-full min-w-0 flex-1 overflow-y-auto px-4 pt-6 sm:px-6 lg:px-0"
      >
        {/* the cards, one under another (room below, so the last one can scroll up to the top) */}
        <div className="flex flex-col gap-3 pb-[40dvh]">
          {shown.map((s, i) => (
            <section
              key={s}
              ref={(el) => {
                if (el) cards.current[i] = el;
              }}
              aria-labelledby={`card-${s}`}
              // a card with a dropdown open sits above the cards and summary after it (each card's rise makes it a layer of its own)
              className="on-ivory chat-rise relative flex shrink-0 flex-col gap-4 rounded-2xl bg-ivory p-4 text-chestnut focus-within:z-30 has-[[aria-expanded=true]]:z-30 sm:p-5"
            >
              {/* the card's name, small and muted, and Change beside it for someone new */}
              <div className="-mb-1 flex items-center justify-between gap-2">
                <h2 id={`card-${s}`} className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
                  {stepName(s)}
                </h2>
                {changeOf(s) && (
                  <button type="button" onClick={changeOf(s)!} className="text-sm font-semibold underline underline-offset-2">
                    {tpick("change")}
                  </button>
                )}
              </div>
              {/* Save was tapped and this card isn't done: what it still needs */}
              {tried && !complete[s] && <FieldMessage className="mt-0">{t(`missing.${s}`)}</FieldMessage>}
              {body(s)}
            </section>
          ))}

          {/* phones and tablets: once it's known what it was for, the summary and Save after the cards */}
          {canSave && (
            <section
              ref={(el) => {
                if (el) cards.current[shown.length] = el;
              }}
              aria-label={tp("save")}
              className="chat-rise flex shrink-0 flex-col gap-2 lg:hidden"
            >
              {summaryCard(true)}
            </section>
          )}
        </div>

        {/* what came next while the page held still (a new party's details being typed): one tap goes there */}
        {waitingAt !== null && waitingAt < shownCount && (
          <div className="pointer-events-none sticky bottom-4 -mt-11 flex justify-center">
            <button
              type="button"
              onClick={() => goTo(waitingAt)}
              className="on-ivory pointer-events-auto flex min-h-11 items-center gap-2 rounded-full bg-ivory px-4 text-sm font-semibold text-chestnut shadow-lg"
            >
              <ArrowDown className="size-4" aria-hidden />
              {waitingAt < shown.length ? stepName(shown[waitingAt]!) : tp("save")}
            </button>
          </div>
        )}
      </div>

      {/* wide screens: the summary and Save, always in view from the start */}
      <aside aria-label={tp("save")} className="hidden w-80 shrink-0 flex-col gap-2 overflow-y-auto pb-6 pt-6 lg:flex">
        {summaryCard(canSave)}
      </aside>
    </main>
  );

  // what's filled in so far: the amount large, or where TDS applies the amount, TDS and total (₹0 under the limit); then
  // a line for each card answered (a line takes you to its card); Save at the bottom once it's all filled in
  function summaryCard(withSave: boolean) {
    return (
      <div className="on-ivory flex flex-col gap-3 rounded-2xl bg-ivory p-4 text-chestnut">
        {/* its name, small and muted like the cards' */}
        <h2 className="-mb-1 text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{t("summary")}</h2>
        <div>
          {breakup ? (
            <div className="tabular flex flex-col gap-1">
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-sm">{tc("sum.amount")}</span>
                <span className={cn(money, "text-xl")}>{rupees(value)}</span>
              </p>
              {tdsApplies && (
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">
                    {tc("sum.tds")}
                    {tdsAmount > 0 && ` ${tdsRate}%`}
                    {tdsAmount > 0 && noPan && ` (${t("noPan")})`}
                  </span>
                  <span className={cn(money, "text-xl")}>{tdsKnown ? rupees(tdsAmount) : "—"}</span>
                </p>
              )}
              {(tax?.rcm || rcmOpen) && (
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{t("rcmRow", { rate: tax?.rcm?.rate ?? 18 })}</span>
                  <span className={cn(money, "text-xl")}>{tax?.rcm ? rupees(tax.rcm.gst) : "—"}</span>
                </p>
              )}
              <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-chestnut/15 pt-3">
                <span className="text-sm font-semibold">{t("total")}</span>
                <span className={cn(money, "text-3xl")}>{rupees(total)}</span>
              </p>
              {over && <FieldMessage className="mt-1">{overMessage()}</FieldMessage>}
              {tdsApplies && tdsKnown && tdsAmount === 0 && <Note className="mt-1 opacity-75">{t("underLimit")}</Note>}
              {tax?.rcm && <Note className="mt-1 opacity-75">{t("rcmNote", { on: rupees(tax.rcm.taxable) })}</Note>}
            </div>
          ) : (
            <p className={cn(money, "text-3xl")}>{rupees(value)}</p>
          )}
          {/* no TDS on a declared transporter; and the GST inside a bill, which is in the amount and claimed back */}
          {tax?.declared && <Note className="mt-1 opacity-75">{t("declaredNoTds")}</Note>}
          {tax?.bill && <Note className="tabular mt-1 opacity-75">{t("billNote", { rate: tax.bill.rate, gst: rupees(tax.bill.gst) })}</Note>}
        </div>
        <dl className="flex flex-col border-t border-chestnut/15">
          {summary
            .filter((l) => l.value && (shown.includes(l.step) || l.step === "to" || l.step === "source"))
            .map((l) => (
              <button
                key={l.step}
                type="button"
                onClick={() => jump(l.step)}
                className="flex flex-col items-start gap-0.5 border-b border-chestnut/15 py-2 text-left hover:bg-chestnut/4"
              >
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] opacity-60">
                  {stepName(l.step)}
                </dt>
                <dd className="w-full truncate font-semibold">{l.value}</dd>
              </button>
            ))}
        </dl>
        {withSave && saveBlock()}
      </div>
    );
  }

  // the amount (with its TDS) is more than the source holds; staff, who don't see balances, aren't told how much is there
  function overMessage() {
    const where = tp(into === "cash" ? "fromCash" : "fromBank");
    if (held === null) return tp("problems.overBalance", { where });
    return tdsAmount > 0
      ? tp("problems.overBalanceTds", { total: rupees(total), held: rupees(held), where })
      : tp("problems.overBalanceBy", { held: rupees(held), where });
  }

  // the day, then Save with the amount on it, and why a save failed
  function saveBlock() {
    return (
      <>
        <label className="mb-3 flex flex-col gap-2.5 text-xs font-semibold sm:max-w-72">
          <span>
            {tc("q.date")}
            <RequiredMark />
          </span>
          <DateInput
            value={day}
            max={indiaDay(new Date())}
            onChange={setDay}
            calendarLabel={tc("q.date")}
            aria-invalid={(tried && day === "") || undefined}
            className={input(day === "")}
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={create.isPending}
          aria-busy={create.isPending}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory shadow-md transition-colors hover:bg-chestnut/90 aria-busy:opacity-80"
        >
          {/* the total, as the summary shows it (with any TDS and reverse-charge GST) */}
          {create.isPending && <Spinner className="size-5" />} {tp("save")} · {rupees(total)}
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
      // rent: what each godown comes to, and for how many months
      case "rent":
        return rentBody();

      // how much: the amount within this payment's limit, the buttons that fill it in, and where it's paid from
      case "amount":
        return amountBody();

      // what it was paid for; a change asks who it went to (and what follows) again
      case "kind":
        return (
          <>
            <div role="radiogroup" aria-label={t("steps.kind")} className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => {
                    if (k === kind) return;
                    opened.current = new Set(["kind"]);
                    setGstMode("none");
                    setPayeeSkipped(false);
                    setKind(k);
                    setAddingOldLoan(false);
                    setLoanSearch("");
                    // another kind starts with no amount (a pick fills it in again)
                    setTotalGoal(null);
                    setAmount("");
                    filledFor.current = null;
                    setTo(null);
                    setLoan(null);
                    setNewParty(emptyParty());
                    setNewHeadTds(null);
                    setPayee(null);
                    setLandlordId(null);
                    setNewPayee(emptyParty());
                  }}
                  className={chip(kind === k)}
                >
                  {tk(k)}
                </button>
              ))}
            </div>
            {/* an expense's head or the tax, in this same card */}
            {subInKind && (
              <>
                <h3 className="-mb-1 mt-2 text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{stepName("to")}</h3>
                <div className="flex flex-col gap-3">{toPicker()}</div>
              </>
            )}
          </>
        );

      // who it went to: the open loan, or a party or ledger found (or added)
      case "to":
        return (
          <>
            {loanOf ? loanCards() : toPicker()}
          </>
        );

      // an expense to a head with TDS: who was paid, a party found or added
      case "payee":
        return payeePicker();

      // whether the bill carries GST
      case "gst":
        return gstCard();

      // a loan given: its interest, how often it's paid, and when it's due back (if ever)
      case "terms":
        return (
          <>
            <LoanTerms
              draft={terms}
              onChange={(patch) => setTerms((d) => ({ ...d, ...patch }))}
              tried={tried}
            />
            <label className="flex flex-col gap-2.5 text-xs font-semibold sm:w-72">
              {tc("q.dueOn")}
              <DateInput
                value={dueOn}
                min={day}
                onChange={setDueOn}
                calendarLabel={tc("q.dueOn")}
                className={input(dueOn !== "" && dueOn < day)}
              />
            </label>
          </>
        );

      // a bank payment's UTR or cheque number, and any remarks
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
                <MicField
                  onText={(said) =>
                    setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))
                  }
                >
                  <input
                    value={remarks}
                    maxLength={REMARKS_MAX}
                    placeholder={tc("hints.remarks")}
                    onChange={(e) => setRemarks(e.target.value)}
                    className={cn(input(false), "pr-11")}
                  />
                </MicField>
              </label>
            </div>
            {/* wide screens: Save right here too (phones have it in the summary below) */}
            <div className="hidden flex-col gap-2 lg:flex">{saveBlock()}</div>
          </>
        );
    }
  }

  // cash or bank, each with what it holds; then which bank, each with its balance. One that can't pay this is muted
  function sourceTiles() {
    return (
        <>
          <div
            role="radiogroup"
            aria-label={t("steps.source")}
            className="grid gap-2 sm:grid-cols-2"
          >
            {/* cash always shows, muted and not pickable when it can't pay this; its name on the left, its balance on the right */}
            <button
              type="button"
              role="radio"
              aria-checked={into === "cash"}
              disabled={!canCash || !cashCovers}
              onClick={() => setInto("cash")}
              className={cn(tile(into === "cash"), SOURCE_ROW, "p-3")}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em]">
                <Banknote className="size-4" aria-hidden /> {tc("cash")}
              </span>
              {cashHeld !== null && (
                <span className={cn(money, "text-base sm:text-2xl")}>{rupees(cashHeld)}</span>
              )}
            </button>
            {/* the bank with what all its accounts hold, and once it's chosen a dropdown of the accounts, showing the
                picked one's balance; one that can't pay this isn't listed, and with none the tile is muted. The list
                opens inside the card, which grows to hold it (a long one scrolls) */}
            {canBank && (
              <div className={cn(tile(into === "bank"), "flex flex-col gap-2 p-3", !bankCovers && "opacity-40")}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={into === "bank"}
                  disabled={!bankCovers}
                  onClick={() => setInto("bank")}
                  className={cn(SOURCE_ROW, "w-full text-left")}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em]">
                    <Landmark className="size-4" aria-hidden /> {tc("bank")}
                  </span>
                  {banksHeld !== null && (
                    <span className={cn(money, "text-base sm:text-2xl")}>{rupees(banksHeld)}</span>
                  )}
                </button>
                {into === "bank" && (
                  <PickMenu
                    label={tc("q.bank")}
                    current={bank ? `${titleCase(bank.bankName)} ••${bank.last4}` : tc("q.bank")}
                    currentHint={bank && bankHeld(bank.id) !== null ? rupees(bankHeld(bank.id)!) : undefined}
                    options={coveringBanks.map((b) => {
                      const has = bankHeld(b.id);
                      return { id: b.id, name: titleCase(b.bankName), sub: `••${b.last4}`, hint: has === null ? undefined : rupees(has) };
                    })}
                    picked={bankId ?? ""}
                    onPick={setBankId}
                    invalid={tried && !bank}
                    matchWidth
                    inFlow
                    className="bg-ivory text-chestnut"
                  />
                )}
              </div>
            )}
          </div>
          {/* what's left there after it */}
          {held !== null && value > 0 && !over && <span className="tabular text-xs opacity-70">{t("leftAfter", { left: rupees(held - total) })}</span>}
        </>
    );
  }

  // rent: a row per godown with its rent a month (the pen changes it for this payment; many rows scroll), their total,
  // then the months and what that comes to. Long names cut off, and large amounts wrap instead of pushing out
  function rentBody() {
    return (
      <div className="flex min-w-0 flex-col sm:w-96">
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
                    <button type="button" aria-label={`${t("rentPerMonth")}: ${row.name}`} onClick={() => setEditingRent(row.id)} className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]">
                      <Pencil className="size-4" aria-hidden />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex min-w-0 items-baseline justify-between gap-4 border-t-2 border-chestnut/40 py-2 pr-11 font-semibold">
          <span>{t("total")}</span>
          <span className="tabular min-w-0 break-all text-right">{rupees(monthlyRent)}</span>
        </div>

        {/* the months paid beside what that comes to */}
        <div className="mt-6 grid grid-cols-[5rem_minmax(0,1fr)] items-end gap-x-4">
          <label className="flex flex-col gap-2.5 text-xs font-semibold">
            {t("months")}
            <NumberInput value={rentMonths} onChange={(v) => setRentMonths(atLeastOne(v))} maxDigits={3} max={120} aria-invalid={calcDue === 0 || undefined} className={cn(input(calcDue === 0), "min-h-14 tabular")} />
          </label>
          <div className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
            <span>{t("rentDue")}</span>
            <output className={cn("flex min-h-14 items-center break-all rounded-control px-3 font-heading text-xl font-bold sm:text-2xl", calcDue > 0 && !tooMuch ? "bg-chestnut text-ivory" : "opacity-60")}>{rupees(calcDue)}</output>
          </div>
        </div>
      </div>
    );
  }

  // the Amount card: the amount, what stops it, the buttons this payment has, and where it's paid from
  function amountBody() {
    return (
      <>
        {rentCalc ? null : interestCalc ? (
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-end gap-x-6 sm:w-96">
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
            <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
              {t("interestDue")}
              <span className={cn("relative block", calcDue > 0 && !tooMuch && "text-ivory")}>
                <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2" aria-hidden />
                <NumberInput
                  value={interestTyped ?? (interestWorked > 0 ? String(interestWorked) : "")}
                  onChange={setInterestTyped}
                  decimals={2}
                  maxDigits={13}
                  placeholder="0"
                  aria-invalid={(tried && calcDue === 0) || tooMuch || undefined}
                  className={cn(input((tried && calcDue === 0) || tooMuch), "min-h-14 pl-10 font-heading text-2xl font-bold", calcDue > 0 && !tooMuch && "bg-chestnut text-ivory caret-ivory")}
                />
              </span>
            </label>
          </div>
        ) : (
        <div className="flex items-end gap-4 sm:gap-6">
        {/* what's owed on the supplier, loan or tax, beside the amount and looking like it, without the fill */}
        {dueShown !== null && (
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-xs font-semibold sm:w-72 sm:flex-none">
            <span>{t("due")}</span>
            <output className={cn(input(false), "relative flex min-h-14 items-center pl-10 font-heading text-lg font-bold sm:text-2xl")}>
              <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2" aria-hidden />
              <span className="tabular truncate">{rupees(dueShown).replace(/^₹\s*/, "")}</span>
            </output>
          </div>
        )}
        <label className="flex min-w-0 flex-1 flex-col gap-2.5 text-xs font-semibold sm:w-72 sm:flex-none">
          <span>
            {tc("q.amount")}
            <RequiredMark />
          </span>
          {/* a chestnut fill once there's an amount */}
          <div className={filled ? "text-ivory [&_button]:text-ivory" : undefined}>
            <MicField onText={(said) => saidAmount(said, typeAmount)}>
              <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2" aria-hidden />
              <NumberInput
                value={amount}
                onChange={typeAmount}
                decimals={2}
                maxDigits={13}
                max={cap}
                placeholder="0"
                aria-invalid={over || tooMuch || (tried && value === 0) || undefined}
                className={cn(input(over || tooMuch), "min-h-14 pl-10 pr-11 font-heading font-bold", dueShown !== null ? "text-lg sm:text-2xl" : "text-2xl", filled && !tooMuch && "bg-chestnut text-ivory caret-ivory")}
              />
            </MicField>
          </div>
        </label>
        </div>
        )}
        {tooMuch && mostHeld !== null && <FieldMessage className="mt-0">{t("tooMuch", { amount: rupees(mostHeld) })}</FieldMessage>}
        {over && !tooMuch && <FieldMessage className="mt-0">{overMessage()}</FieldMessage>}
        {loanOver && <FieldMessage className="mt-0">{tc("problems.loanLeft", { left: rupees(loan!.left) })}</FieldMessage>}

        {/* the EMI in one tap */}
        {kind === "loanRepaid" && loan?.emiAmount != null && loan.emiAmount <= loan.left && value !== loan.emiAmount && (
          <button type="button" onClick={() => typeAmount(String(loan.emiAmount))} className={ADD_ON_IVORY}>
            {t("payEmi", { amount: rupees(loan.emiAmount) })}
          </button>
        )}

        {panField()}

        {/* where it's paid from, in this same card */}
        {!rentCalc && <h3 className="-mb-1 mt-2 text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{t("steps.source")}</h3>}
        {sourceTiles()}
      </>
    );
  }

  // their PAN, where having none is costing them: it takes effect as soon as it's complete, and stays on their record
  function panField() {
    if (!asksPan) return null;
    return (
      <label className="flex flex-col gap-2.5 text-xs font-semibold sm:w-56">
        PAN
        <input
          value={pan}
          maxLength={10}
          placeholder="ABCDE1234F"
          onChange={(e) => setPan(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase())}
          aria-invalid={panBad || undefined}
          className={input(panBad && (tried || pan.length === 10))}
        />
        {!panGiven && <span className="text-xs font-normal opacity-70">{t("panHint", { rate: tdsInfo ? 5 : 20 })}</span>}
      </label>
    );
  }

  // an expense's GST: none, or on the bill (its GSTIN, number, date and rate)
  function gstCard() {
    const modes: GstMode[] = ["none", "bill"];
    return (
      <>
        <div role="radiogroup" aria-label={t("steps.gst")} className="flex flex-wrap gap-2">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={gstMode === m}
              onClick={() => {
                setGstMode(m);
                setGstin(rent ? (landlord?.gstin ?? "") : "");
              }}
              className={chip(gstMode === m)}
            >
              {t(`gstModes.${m}`)}
            </button>
          ))}
        </div>
        {gstMode === "bill" && (
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2.5 text-xs font-semibold">
              <span>
                GSTIN
                <RequiredMark />
              </span>
              <input
                value={gstin}
                maxLength={15}
                onChange={(e) => setGstin(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase())}
                aria-invalid={(gstin !== "" && !gstinOk) || (tried && gstin === "") || undefined}
                className={input((gstin.length === 15 && !gstinOk) || (tried && !complete.gst && !gstinOk))}
              />
            </label>
            <label className="flex flex-col gap-2.5 text-xs font-semibold">
              <span>
                {t("billNumber")}
                <RequiredMark />
              </span>
              <input
                value={billNumber}
                maxLength={BILL_NUMBER_MAX}
                onChange={(e) => setBillNumber(e.target.value.toUpperCase())}
                aria-invalid={(tried && billNumber === "") || undefined}
                className={input(tried && billNumber === "")}
              />
            </label>
            <label className="flex flex-col gap-2.5 text-xs font-semibold">
              <span>
                {t("billDate")}
                <RequiredMark />
              </span>
              <DateInput value={billDate} max={day} onChange={setBillDate} calendarLabel={t("billDate")} aria-invalid={(tried && billDate === "") || undefined} className={input(tried && billDate === "")} />
            </label>
            <div role="radiogroup" aria-label={t("gstRate")} className="flex flex-col gap-2.5 text-xs font-semibold">
              <span>
                {t("gstRate")}
                <RequiredMark />
              </span>
              <div className="flex flex-wrap gap-2">
                {BILL_RATES.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={billRate === r} onClick={() => setBillRate(r)} className={chip(billRate === r)}>
                    {r}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // the loan: searched and picked like everyone else paid, each open one we took with what's left on it (a repayment can't
  // be more than that); one from before the app is added right here, and then picked
  function loanCards() {
    if (addingOldLoan) {
      return (
        <OldLoanForm
          newPartyDetails={newPartyDetails}
          onAdded={(id) => {
            setAddedLoanId(id);
            setAddingOldLoan(false);
          }}
          onCancel={() => setAddingOldLoan(false)}
        />
      );
    }
    const details = (l: Loan) =>
      [
        l.branch,
        l.loanAccountNumber && `••${l.loanAccountNumber.slice(-4)}`,
        dayInWords(indiaDay(new Date(l.dated)), locale),
        l.interestRate !== null && `${l.interestRate}% ${tc("aYear")}`,
        l.dueOn && tc("dueBy", { day: dayInWords(l.dueOn, locale) }),
      ]
        .filter(Boolean)
        .join(" · ");
    const needle = loanSearch.trim().toLowerCase();
    const shownLoans = (loans.data ?? []).filter((l) => needle === "" || [l.partyName, l.partyPhone ?? ""].some((v) => v.toLowerCase().includes(needle)));
    if (loan) {
      return (
        <div className="flex flex-col gap-2">
          <div className={PICKED}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{titleCase(loan.partyName)}</span>
              <span className="truncate text-xs opacity-75">{details(loan)}</span>
            </span>
            <span className="tabular shrink-0 text-sm font-semibold">{rupees(loan.left)}</span>
            {isAdmin && (
              <button type="button" aria-label={tpick("edit")} onClick={() => setEditingLoan((on) => !on)} className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-ivory/10">
                <Pencil className="size-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setLoan(null);
                setTotalGoal(null);
              }}
              className="shrink-0 rounded-control px-2 py-1 text-sm font-semibold underline underline-offset-2"
            >
              {tpick("change")}
            </button>
          </div>
          {/* who gave it, changed right here: a lender's details, or a party's */}
          {editingLoan &&
            (loan.lenderId ? (
              <LenderEdit
                lenderId={loan.lenderId}
                onCancel={() => setEditingLoan(false)}
                onSaved={(saved) => {
                  setEditingLoan(false);
                  setLoan({ ...loan, partyName: saved.name, branch: saved.branch });
                }}
              />
            ) : (
              <PartyEdit
                partyId={loan.partyId}
                onCancel={() => setEditingLoan(false)}
                onSaved={(saved) => {
                  setEditingLoan(false);
                  setLoan({ ...loan, partyName: saved.name });
                }}
              />
            ))}
          {loanOver && <FieldMessage className="mt-1">{tc("problems.loanLeft", { left: rupees(loan.left) })}</FieldMessage>}
        </div>
      );
    }
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
                <span className="truncate text-xs opacity-75">{details(l)}</span>
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

  // a party or ledger of this kind, searched right in the card; the admin adds a new party (its details right here) or a new expense
  function toPicker() {
    return (
      <>
        <LedgerSearch
          purpose="payment"
          receiptKind={null}
          paymentKind={kind}
          value={to}
          onChange={(c) => {
            setTo(c);
            setGstMode("none");
            setPayeeSkipped(false);
            if (c?.kind === "party") setNewParty(emptyParty());
            // a transporter's tick belongs to the head it was given under
            setNewPayee((d) => ({ ...d, transportDeclaration: false }));
          }}
          canAdd={isAdmin && (toParty || kind === "expense")}
          onEdit={isAdmin && to?.kind === "ledger" && (to.ledger.party || (kind === "expense" && to.ledger.key === null)) ? () => setEditingTo((on) => !on) : undefined}
          addParty={toParty}
          placeholder={toParty ? tc("hints.from") : t("searchLedger")}
        />

        {/* what's picked, changed right here: a party's details, or the name of an expense head of our own */}
        {editingTo && to?.kind === "ledger" && to.ledger.party && partyEditor(to.ledger, (ledger) => setTo({ kind: "ledger", ledger }), () => setEditingTo(false))}
        {editingTo && to?.kind === "ledger" && !to.ledger.party && (
          <HeadEdit
            ledgerId={to.ledger.id}
            name={nameOf(to.ledger)}
            onSaved={(name) => {
              setEditingTo(false);
              setTo({ kind: "ledger", ledger: { ...to.ledger, name } });
            }}
            onCancel={() => setEditingTo(false)}
          />
        )}

        {/* a new expense head: the TDS its payments carry */}
        {kind === "expense" && to?.kind === "new" && <TdsTypePicker value={newHeadTds} onChange={setNewHeadTds} />}

        {to?.kind === "party" && newPartyDetails(newParty, setNewParty, matched, (m) => setTo({ kind: "ledger", ledger: m }))}
      </>
    );
  }

  // a picked party's details changed right here; the saved name, phone and town then show on what's picked
  function partyEditor(ledger: Pickable, setLedger: (ledger: Pickable) => void, close: () => void) {
    return (
      <PartyEdit
        partyId={ledger.referenceId!}
        onCancel={close}
        onSaved={(saved) => {
          close();
          const home = saved.addresses.find((a) => a.isDefault) ?? saved.addresses[0];
          setLedger({ ...ledger, party: { ...ledger.party!, name: saved.name, shortName: saved.shortName, phone: saved.phone, city: home?.city ?? null } });
        }}
      />
    );
  }

  // who an expense with TDS was paid to: a party found, or one added here (the admin)
  function payeePicker() {
    if (rent)
      return (
        <>
          <LandlordSearch twoColumns asksPan={false} canEdit={isAdmin} landlords={landlords.data ?? []} picked={landlordId} onPick={setLandlordId} canAdd={isAdmin} startOpen />
        </>
      );
    return (
      <>
        <LedgerSearch
          purpose="payment"
          receiptKind={null}
          paymentKind="supplier"
          payee="other"
          value={payee}
          onChange={(c) => {
            setPayee(c);
            setPayeeSkipped(false);
            if (c?.kind === "party") setNewPayee(emptyParty());
          }}
          canAdd={isAdmin}
          addParty
          placeholder={tc("hints.from")}
          onEdit={isAdmin && payee?.kind === "ledger" && payee.ledger.party ? () => setEditingPayee((on) => !on) : undefined}
          besideNew={
            canSkipPayee && (
              <button type="button" aria-pressed={skipped} onClick={() => setPayeeSkipped((on) => !on)} className={cn(chip(skipped), "min-h-11 px-5 text-sm font-semibold")}>
                {tc("skip")}
              </button>
            )
          }
        />
        {editingPayee && payee?.kind === "ledger" && payee.ledger.party && partyEditor(payee.ledger, (ledger) => setPayee({ kind: "ledger", ledger }), () => setEditingPayee(false))}
        {payee?.kind === "party" && newPartyDetails(newPayee, setNewPayee, payeeMatched, (m) => setPayee({ kind: "ledger", ledger: m }), headTds === "contract" && headKey !== "labour", payeePhoneOptional)}
      </>
    );
  }

  // someone new: their details, phone first. A phone someone already has shows them instead: use them, or change the
  // phone
  function newPartyDetails(
    draft: PartyDraft,
    setDraft: React.Dispatch<React.SetStateAction<PartyDraft>>,
    match: Pickable | null,
    pickMatch: (m: Pickable) => void,
    transporter = false,
    phoneOptional = false,
  ) {
    // where TDS applies, the PAN is asked below the amount instead
    const tdsPerson = draft === newPayee || kind === "supplier";
    return (
      <>
        <PartyFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} tried={tried} strict asksRemarks={false} asksPan={!tdsPerson} phoneOptional={phoneOptional} onAddressesOpen={() => setTried(false)} onlyPhone={!!match} transporter={transporter} />
        {match?.party && (
          <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/4 p-3">
            <span className="text-xs font-semibold">{tc("q.phoneMatch")}</span>
            <PartyPick ledger={match} party={match.party} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => pickMatch(match)} className={chip(true)}>
                {t("useThem")}
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
}
