"use client";

import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleAlert,
  IndianRupee,
  Pencil,
  Plus,
  Trash2,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Note } from "~/components/ui/note";
import { Reveal } from "~/components/ui/reveal";
import {
  ADD_ON_IVORY,
  PAGE,
  PICK_LIST,
  PICK_NEW,
  PICK_ROW,
  PICK_SEARCH,
  PICK_TWO_COLUMNS,
} from "~/components/ui/page-styles";
import { fieldClass } from "~/components/ui/card-form";
import { DateInput, dayInWords } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicButton, MicField } from "~/components/ui/mic-button";
import { PickMenu } from "~/components/stock/pick-menu";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
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
import {
  HeadEdit,
  type LedgerChoice,
  LedgerSearch,
  type PaymentKind,
  type Pickable,
} from "./ledger-picker";
import { LenderEdit } from "./lender-fields";
import { moveCard, useCardHistory } from "./card-steps";
import { AdvanceTag, type AmountRow, AmountTable } from "./amount-table";
import { appOfUpi, type BankMode, upiFormatOk } from "@repo/trpc/client";
import { DueBar } from "./due-bar";
import { PickedCard } from "./picked-card";
import { UpiQr } from "./upi-qr";
import { emptyLoan, type LoanDraft, loanProblems, LoanTerms } from "./loan-terms";
import { OldLoanForm } from "./old-loan-form";
import { PartyPick, usePhoneMatches } from "./party-finder";
import { type TdsType, TdsTypePicker } from "./tds-type-picker";

type Loan = RouterOutputs["transactions"]["due"]["openLoans"][number];

// a summary line: words, or a name with its amount on the right; a step can have several, one under another
type SummaryLine = string | { name: string; amount: string };

// the cards, in order (only the ones that apply are shown)
type Step = "kind" | "to" | "payee" | "gst" | "terms" | "rent" | "amount" | "source" | "details";

// another bank account paying part of the bank's share, when no one account holds it all
type MorePart = {
  key: string;
  bankId: string | null;
  amount: string;
  mode: BankMode | null;
};
let morePartKeys = 0;

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

// section 40A(3): an expense paid in cash above this to one person in a day can't be claimed (more for a transporter)
const CASH_EXPENSE_LIMIT = 10_000;
const CASH_TRANSPORT_LIMIT = 35_000;
// what pays an expense the cash limit is about: purchases, expenses, and interest
const CASH_LIMIT_KINDS: PaymentKind[] = ["supplier", "expense", "interestPaid"];
const REMARKS_MAX = 100;

const input = (bad: boolean) =>
  `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;
// how a bank payment was made, in the order they're offered
const BANK_MODES: BankMode[] = ["upi", "imps", "neftRtgs", "cheque"];

const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-control border px-3.5 text-sm font-semibold transition-colors",
    on ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50 hover:bg-chestnut/[0.06]",
  );
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
// the open loan, an expense or tax ledger); 4 TDS (a supplier); 5 a loan given's terms; 6 the day and
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
  // Back, Next and how far along, worded as on a receipt
  const tr = useTranslations("transactions.receipt");
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
  // where it's paid from: cash, one bank account, or cash and a bank account together
  const [into, setInto] = useState<"cash" | "bank" | "both" | null>(null);
  const [bankId, setBankId] = useState<string | null>(null);
  // paid from both: the cash part (the bank pays the rest); filled with what cash holds until it's typed
  const [cashPart, setCashPart] = useState("");
  const cashPartAuto = useRef(true);
  // Cash + Bank: which part's field is being typed in, and the bank's as typed (the cash part is kept; the bank's follows)
  const [partTyping, setPartTyping] = useState<"cash" | "bank" | null>(null);
  const [bankTyped, setBankTyped] = useState("");
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
  // how the bank's part was paid (UPI already, once the QR's bank was confirmed)
  const [bankMode, setBankMode] = useState<BankMode | null>(null);
  // more accounts after the first, each with what it pays and how; the first account pays the rest
  const [moreParts, setMoreParts] = useState<MorePart[]>([]);
  // what card 1's account pays, typed
  const [firstAmount, setFirstAmount] = useState("");
  // Bank picked: the accounts' list opens by itself (back to 0 once an account is picked, so it doesn't open again)
  const [accountsOpen, setAccountsOpen] = useState(0);
  // the account cards folded to their one-line summary (by key; the first is "first")
  const [foldedCards, setFoldedCards] = useState<string[]>([]);
  const setMorePart = (key: string, patch: Partial<MorePart>) =>
    setMoreParts((all) => all.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const [remarks, setRemarks] = useState("");
  // rent: the months being paid, and each godown's rent a month where it's changed for this payment
  const [rentMonths, setRentMonths] = useState("1");
  const [rentEdits, setRentEdits] = useState<Record<string, string>>({});
  const [editingRent, setEditingRent] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);
  // the red marks from a Next or Save tapped clear once anything on the amount card changes; they come back only on the
  // next tap, so a part shown after a pick (the bank account after Paid by) never opens red
  useEffect(() => setTried(false), [amount, into, bankId, bankMode, cashPart, moreParts]);
  // another place to pay from starts with the first account alone
  useEffect(() => setMoreParts([]), [into]);

  // what's typed, worked out
  const value = Number(amount) || 0;
  const bank = banks.data?.find((b) => b.id === bankId);
  const cashHeld = sources.data?.cash ?? null;
  const bankHeld = (id: string) => sources.data?.banks.find((b) => b.id === id)?.available ?? null;
  const pickedHeld = bankId ? bankHeld(bankId) : null;
  // what the picked place holds (both together, from cash and a bank); null when it isn't known (staff)
  const held =
    into === "cash"
      ? cashHeld
      : into === "bank" && bankId
        ? pickedHeld
        : into === "both" && cashHeld !== null && pickedHeld !== null
          ? cashHeld + pickedHeld
          : null;
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
  useEffect(
    () => setEditingPayee(false),
    [kind, payee?.kind === "ledger" ? payee.ledger.id : null],
  );
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
  const headTds =
    kind === "expense"
      ? to?.kind === "ledger"
        ? to.ledger.tdsType
        : to?.kind === "new"
          ? newHeadTds
          : null
      : null;
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
  const offersGst =
    kind === "expense" &&
    to !== null &&
    headKey !== "transport" &&
    headKey !== "legalFees" &&
    !(rent && !landlord?.gstin);
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
    {
      dueId: loan?.id ?? "",
      pan: panGiven,
      amount: askedAmount,
      dateTime: new Date(`${day}T23:59:59+05:30`),
    },
    { enabled: kind === "interestPaid" && loan !== null && askedAmount > 0 && day !== "" },
  );
  const interestInfo =
    kind === "interestPaid" && loan && askedAmount === value ? (interestTds.data ?? null) : null;
  const tdsAmount = tdsInfo?.tds ?? tax?.tds?.tds ?? interestInfo?.tds?.tds ?? 0;
  const tdsRate = tdsInfo?.rate ?? tax?.tds?.rate ?? interestInfo?.tds?.rate ?? 0;
  const noPan = tdsInfo ? tdsInfo.rate === 5 : (tax?.tds?.rate ?? interestInfo?.tds?.rate) === 20;
  // a payment that can carry TDS (its year's switch is on): its breakup shows even while it's under the limit
  // anyone with no PAN where TDS applies, saved or new: asked below the amount, and it stays on their record
  const asksPan =
    tdsInfo?.rate === 5 || !!tax?.panMissing || !!interestInfo?.panMissing || pan !== "";
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
  const rentRows = landlord
    ? landlord.godowns.length > 0
      ? landlord.godowns
      : [{ id: "rent", name: t("rentDue"), monthlyRent: 0 }]
    : [];
  const rentOf = (row: (typeof rentRows)[number]) =>
    rentEdits[row.id] ?? (row.monthlyRent > 0 ? String(row.monthlyRent) : "");
  // neither rent nor months go below 1: a 0 becomes 1 as it's typed
  const atLeastOne = (typed: string) => (typed !== "" && Number(typed) < 1 ? "1" : typed);
  const monthlyRent = rentRows.reduce((sum, row) => sum + (Number(rentOf(row)) || 0), 0);
  const rentCalc = rent && !!landlord;
  // every godown's rent and the months are in
  const rentOk = rentRows.every((row) => Number(rentOf(row)) >= 1) && Number(rentMonths) >= 1;
  // the godown-by-godown breakup, opened from its total; open from the start while a rent is still to be typed
  const [rentOpen, setRentOpen] = useState(false);
  // another landlord starts from their own rent
  useEffect(() => {
    setRentMonths("1");
    setRentEdits({});
    setEditingRent(null);
  }, [landlordId]);
  const calc = interestCalc || rentCalc;
  const interestWorked = interestCalc
    ? Math.round((loan!.left * loan!.interestRate! * Number(interestMonths)) / 12) / 100
    : 0;
  const calcDue = interestCalc
    ? interestTyped !== null
      ? Number(interestTyped)
      : interestWorked
    : rentCalc
      ? Math.round(monthlyRent * Number(rentMonths) * 100) / 100
      : 0;
  useEffect(() => {
    if (!calc) return;
    setTotalGoal(calcDue > 0 ? { total: calcDue, tries: 0 } : null);
    setAmount(calcDue > 0 ? String(calcDue) : "");
  }, [calc, calcDue]);

  // what can pay the amount: only the amount leaves cash or the bank, on every head and kind (TDS and reverse-charge GST
  // are owed to the government, paid later), so a source that doesn't hold the amount isn't offered (staff see no
  // balances; the save checks)
  const cashCovers = cashHeld === null || cashHeld >= value;
  // any account with money can pay (more accounts join in when one alone can't hold it)
  const coveringBanks = (banks.data ?? []).filter((b) => hasMoney(bankHeld(b.id)));
  const bankCovers = coveringBanks.length > 0 && (banksHeld === null || banksHeld >= value);
  // the most cash, or the bank accounts together, hold; past it, cash and the banks pay it together
  const mostHeld = cashHeld === null ? null : Math.max(cashHeld, banksHeld ?? 0);
  const needsBoth = mostHeld !== null && value > mostHeld;
  // the most cash and the bank accounts hold together; past it, nothing could pay
  const pairMost = cashHeld === null ? null : cashHeld + (banksHeld ?? 0);
  const tooMuch = pairMost !== null && value > pairMost;
  // Cash + Bank: part in cash and the rest from a bank, whenever there's cash and a bank (unless both together can't pay)
  const offerBoth = canCash && canBank && !tooMuch;
  // with cash: a bank account that holds the rest of the total once cash has given all it has
  const bothBanks = coveringBanks;
  // the two parts: what's typed for cash, and the rest from the bank
  const cashValue = Number(cashPart) || 0;
  const bankValue = Math.round((value - cashValue) * 100) / 100;
  // the bank's share, what more accounts pay of it, and what's left for the first account
  const bankShare = into === "bank" ? value : into === "both" ? bankValue : 0;
  const moreValue = moreParts.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  // more than one account: one was added, or the account picked holds less than the bank's share. Otherwise the one
  // account pays all of it
  const multi =
    moreParts.length > 0 || (!!bankId && pickedHeld !== null && pickedHeld < bankShare);
  const firstPart = multi ? Number(firstAmount) || 0 : bankShare;
  // what the more accounts picked hold (null when any isn't known, as for staff)
  const moreHeld = moreParts.every((m) => m.bankId && bankHeld(m.bankId) !== null)
    ? moreParts.reduce((sum, m) => sum + (bankHeld(m.bankId!) ?? 0), 0)
    : null;
  // what the cards still have to pay of the bank's share (another account takes it)
  const firstShort = Math.max(0, Math.round((bankShare - firstPart - moreValue) * 100) / 100);
  const moreOver = moreParts.some(
    (m) =>
      m.bankId !== null && bankHeld(m.bankId) !== null && Number(m.amount) > bankHeld(m.bankId)!,
  );
  // the accounts not used yet that still hold money, for another account
  const freeBanks = coveringBanks.filter(
    (b) => b.id !== bankId && !moreParts.some((m) => m.bankId === b.id),
  );
  // another account card, below the cards, while an account is left to add
  const canAddAccount =
    (into === "bank" || into === "both") &&
    // before card 1 has its account, one account stays for it
    freeBanks.length > (bankId ? 0 : 1) &&
    // something is still to pay, and every card has its account
    (!multi || (firstShort > 0 && !!bankId && moreParts.every((m) => m.bankId))) &&
    moreParts.length < 4;
  // every card has an account, an amount and how it was paid, and together they pay all of the bank's share
  const morePartsOk =
    firstPart > 0 &&
    firstShort === 0 &&
    moreParts.every((m) => m.bankId && Number(m.amount) > 0 && m.mode) &&
    !moreOver;
  // a new account card opens; the cards before it fold to their summary
  const addAccount = () => {
    setFoldedCards(["first", ...moreParts.map((m) => m.key)]);
    setMoreParts((all) => [
      ...all,
      { key: `more-${++morePartKeys}`, bankId: null, amount: "", mode: null },
    ]);
  };
  // the party's UPI IDs, and what goes out of the bank to it (all of it, or the bank's part with cash)
  // who the QR pays and their UPI IDs: the landlord on rent, the person paid on a head's payee card (professional,
  // advocate, labour…) whether picked or being added here, otherwise the party behind Paid to (a head has none)
  const newPayeeUpis = newPayee.upiIds.map((u) => u.upiId.trim()).filter((u) => upiFormatOk(u));
  const qrParty =
    landlord ??
    (payee?.kind === "ledger" ? payee.ledger.party : null) ??
    (payee?.kind === "party" ? { name: newPayee.name.trim(), upiIds: newPayeeUpis } : null) ??
    (to?.kind === "ledger" ? to.ledger.party : null);
  // their UPI ID for the QR: filled in with the one saved on them, or typed (a new one is saved on them with the payment)
  const [typedUpi, setTypedUpi] = useState("");
  const savedUpis = qrParty?.upiIds ?? [];
  // name@handle, and the handle (after @) one a UPI app gives out: @okicici, @ybl, @paytm, a bank's own… (one already
  // saved on them is taken as it is)
  const typedUpiShapeOk = upiFormatOk(typedUpi.trim());
  const typedUpiOk =
    typedUpiShapeOk && (appOfUpi(typedUpi) !== null || savedUpis.includes(typedUpi.trim().toLowerCase()));
  // its mistakes show once the box is left (or Next is pressed), not while the handle is still being typed
  const [upiLeft, setUpiLeft] = useState(false);
  // any account paying by UPI: card 1's, or one added after it
  const anyUpi = bankMode === "upi" || moreParts.some((m) => m.mode === "upi");
  // the box shows whenever someone is being paid by UPI (a head paid to no one, like electricity, has none)
  const asksUpi = !!qrParty && (into === "bank" || into === "both") && anyUpi;
  const payeeUpis = typedUpiOk ? [typedUpi.trim().toLowerCase()] : [];
  // another party: the box starts with their saved UPI ID, or empty
  const savedKey = `${qrParty?.name ?? ""}|${savedUpis.join()}`;
  useEffect(() => {
    setTypedUpi(savedUpis[0] ?? "");
    setUpiLeft(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the party or their saved UPI IDs change
  }, [savedKey]);
  // what the first account pays (the QR is for it; more accounts pay their parts apart)
  const upiAmount = firstPart;
  // the party's QR shows: a UPI ID, a bank picked, and something for it to pay
  // (it stays while the bank is picked again: the QR pays the party, whichever account it's paid from; cash hides it)
  const qrShown =
    payeeUpis.length > 0 &&
    (into === "bank" || into === "both") &&
    bankMode === "upi" &&
    upiAmount > 0;
  // Cash + Bank: the least each part can be, as the other can't give more than it holds (the bank picked, or before that
  // the fullest one); unknown to staff, who see no balances
  const bothBankMost = banksHeld;
  const cashLeast =
    into === "both" && bothBankMost !== null
      ? Math.max(0, Math.round((value - bothBankMost) * 100) / 100)
      : 0;
  const bankLeast =
    into === "both" && cashHeld !== null
      ? Math.max(0, Math.round((value - cashHeld) * 100) / 100)
      : 0;
  const partsOk =
    into !== "both" ||
    (cashValue > 0 && bankValue > 0 && cashValue >= cashLeast && bankValue >= bankLeast);
  // a part left below its least is raised to it (the other part gives up the difference)
  const raiseToLeast = () => {
    if (into !== "both" || cashPart === "") return;
    if (cashValue < cashLeast) setCashPart(String(cashLeast));
    else if (bankValue < bankLeast)
      setCashPart(String(Math.round((value - bankLeast) * 100) / 100));
  };
  // Cash + Bank: the bank's part is in (typed, or filled in from the cash part), so how it was paid can follow
  const bothBankSet = into === "both" && cashPart !== "" && bankValue > 0;
  // when no one place can pay it, the cash part starts as all the cash there is (leaving the bank at least a paisa);
  // otherwise it starts empty, for the part paid in cash to be typed
  const fillCashPart = () => {
    if (cashHeld === null || value <= 0) return;
    setCashPart(String(Math.max(0, Math.min(cashHeld, Math.round((value - 0.01) * 100) / 100))));
  };
  const pickBoth = () => {
    cashPartAuto.current = needsBoth;
    setInto("both");
    if (needsBoth) fillCashPart();
    else setCashPart("");
  };
  useEffect(() => {
    if (into === "both" && cashPartAuto.current) fillCashPart();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the amount or the source changes
  }, [into, value, cashHeld]);
  // the amount settled: a source that can't pay it lets go; nothing is picked for staff
  useEffect(() => {
    if (askedAmount !== value || value <= 0 || !sources.data || !banks.data) return;
    if (into === "cash" && !cashCovers) setInto(null);
    if (into === "bank" && !bankCovers) setInto(null);
    if (into === "both" && !offerBoth) setInto(null);
    const list = into === "both" ? bothBanks : coveringBanks;
    if (bankId !== null && !list.some((b) => b.id === bankId)) setBankId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the amount or source changes
  }, [askedAmount, value, total, into, bankId, sources.data, banks.data]);
  // the amount changed: where it's paid from starts again, nothing left over (cash or bank, the accounts, their
  // amounts and how each was paid, the cash part)
  const amountSeen = useRef(value);
  useEffect(() => {
    if (amountSeen.current === value) return;
    amountSeen.current = value;
    setInto(null);
    setBankId(null);
    setBankMode(null);
    setMoreParts([]);
    setFirstAmount("");
    setFoldedCards([]);
    setCashPart("");
    setBankTyped("");
  }, [value]);
  // the first account changed: what came after it starts again (how it was paid, its amount, the other cards)
  const accountSeen = useRef(bankId);
  useEffect(() => {
    if (accountSeen.current === bankId) return;
    accountSeen.current = bankId;
    setBankMode(null);
    setMoreParts([]);
    setFirstAmount("");
    setFoldedCards([]);
  }, [bankId]);
  const rcmOpen = (rent || headKey === "legalFees") && !hasPayee;
  const asksGst = offersGst && !tax?.rcm;
  const fits = trpc.transactions.payment.fits.useQuery(
    {
      settledIn: into === "both" ? "cashAndBank" : (into ?? "cash"),
      bankDetailsId: into === "cash" ? null : bankId,
      cashAmount: into === "both" ? cashValue : null,
      moreBankParts: moreParts
        .filter((m) => m.bankId && Number(m.amount) > 0)
        .map((m) => ({ bankDetailsId: m.bankId!, amount: Number(m.amount) })),
      amount: askedAmount,
    },
    {
      enabled:
        into !== null &&
        (into === "cash" || !!bankId) &&
        partsOk &&
        held === null &&
        sources.isSuccess &&
        askedAmount > 0,
    },
  );

  // over what's held; from both, either part over its own place counts too
  const cashOver = into === "both" && cashHeld !== null && cashValue > cashHeld;
  const bankOver = (into === "both" || into === "bank") && firstShort > 0;
  // what the places picked hold, more accounts included
  const placesHeld =
    held === null
      ? null
      : moreParts.length === 0
        ? held
        : moreHeld === null
          ? null
          : held + moreHeld;
  const over =
    placesHeld !== null
      ? value > placesHeld || cashOver || bankOver || moreOver
      : askedAmount === value && fits.data?.fits === false;
  // the amount itself in red: not when the only trouble is the first account holding less than its share, which is
  // shown beside the account with another account to add
  const amountOver = over && !(firstShort > 0 && !cashOver && !moreOver);
  const loanOver = kind === "loanRepaid" && loan !== null && value > loan.left;
  // what a tax has owing, and what a supplier is owed (staff see no balances, so neither is known to them)
  const toBalance = to?.kind === "ledger" ? (to.ledger.balance?.today ?? null) : null;
  const taxOwed = kind === "taxPaid" && toBalance ? toBalance.amount : null;
  const supplierDue =
    kind === "supplier" && toBalance?.side === "credit" && toBalance.amount > 0
      ? toBalance.amount
      : null;
  // what's still owed on the loan, tax or supplier picked (shown above the amount when there's any)
  const unpaid =
    kind === "loanRepaid" ? (loan?.left ?? null) : kind === "taxPaid" ? taxOwed : supplierDue;
  const dueShown = unpaid !== null && unpaid > 0 ? unpaid : null;
  // a supplier paid more than we owe them (or nothing owed): the rest is an advance with them. Only when their balance
  // is known (staff see none); someone new is owed nothing yet, so all of it is an advance
  const toSupplier =
    kind === "supplier" &&
    ((to?.kind === "ledger" && !!to.ledger.party && !!to.ledger.balance) || to?.kind === "party");
  const weOwe = toSupplier && toBalance?.side === "credit" ? toBalance.amount : 0;
  const heldAdvance = toSupplier && toBalance?.side === "debit" ? toBalance.amount : 0;
  const settlesTotal = Math.round((total - rcmAmount) * 100) / 100;
  const advance =
    toSupplier && settlesTotal > weOwe ? Math.round((settlesTotal - weOwe) * 100) / 100 : 0;
  // picking one fills in what's unpaid, or the most any one place holds when that's less; once each, so what's typed
  // afterwards stays
  const unpaidOf =
    kind === "loanRepaid"
      ? (loan?.id ?? null)
      : dueShown !== null && to?.kind === "ledger"
        ? to.ledger.id
        : null;
  const filledFor = useRef<string | null>(null);
  // a filled-in amount belongs to its pick: picking someone else clears it (one that was typed stays)
  const autoFilled = useRef(false);
  const pickKey =
    kind === "loanRepaid" ? (loan?.id ?? null) : to?.kind === "ledger" ? to.ledger.id : null;
  useEffect(() => {
    if (!autoFilled.current) return;
    autoFilled.current = false;
    setTotalGoal(null);
    setAmount("");
  }, [pickKey]);
  useEffect(() => {
    if (
      unpaidOf === null ||
      unpaid === null ||
      !sources.isSuccess ||
      filledFor.current === unpaidOf
    )
      return;
    filledFor.current = unpaidOf;
    const goal = pairMost === null ? unpaid : Math.min(unpaid, pairMost);
    if (goal <= 0) return;
    // a supplier's TDS comes out of the total, so it's the total that's filled
    if (kind === "supplier") payTotal(goal);
    else typeAmount(String(goal));
    autoFilled.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when another loan or supplier is picked
  }, [unpaidOf, sources.isSuccess]);
  // the most the amount can be typed up to: what's left on a loan, what a tax owes, or what labour can go unnamed for
  const ruleCap =
    kind === "loanRepaid" && loan
      ? loan.left
      : taxOwed !== null
        ? taxOwed
        : skipped
          ? LABOUR_SKIP_MAX
          : undefined;
  // never more than the money there is: cash and the banks together (a new amount starts Paid from again, so the
  // place picked before doesn't limit it). Unknown to staff (the save checks)
  const moneyCap = pairMost;
  const cap = [ruleCap, moneyCap ?? undefined]
    .filter((c): c is number => c !== undefined)
    .reduce<number | undefined>((m, c) => (m === undefined ? c : Math.min(m, c)), undefined);

  // when each card is filled in
  // the amount's fill: not while it's over what's held, when it shows red
  const filled = value > 0 && !amountOver;
  // what an expense or a tax is paid under is picked in the Paid for card itself
  const subInKind = kind === "expense" || kind === "taxPaid";
  const toDone = loanOf
    ? loan !== null && !loanOver
    : to !== null && (to.kind !== "party" || (!matched && partyOk(newParty, true)));
  const sourceDone =
    into !== null &&
    (into === "cash" || (bankMode !== null && !!bank && morePartsOk)) &&
    partsOk &&
    !over &&
    (held !== null || (askedAmount === value && fits.data?.fits === true));

  // section 40A(3): what goes in cash to this person today, this payment's cash and what was paid them earlier that day.
  // Only a warning: a purchase, an expense or interest paid above the limit can't be claimed
  const cashNow = into === "cash" ? value : into === "both" ? cashValue : 0;
  const cashLimitApplies = kind !== null && CASH_LIMIT_KINDS.includes(kind) && cashNow > 0;
  const cashLimit = headKey === "transport" ? CASH_TRANSPORT_LIMIT : CASH_EXPENSE_LIMIT;
  const cashWho = {
    paidToLedgerId: kind === "supplier" && to?.kind === "ledger" ? to.ledger.id : null,
    payeeLedgerId: kind === "expense" && !rent && payee?.kind === "ledger" ? payee.ledger.id : null,
    payeeLandlordId: kind === "expense" ? (landlord?.id ?? null) : null,
    dueId: kind === "interestPaid" ? (loan?.id ?? null) : null,
  };
  const cashToday = trpc.transactions.payment.cashToday.useQuery(
    { ...cashWho, day },
    { enabled: cashLimitApplies && day !== "" && Object.values(cashWho).some((v) => v !== null) },
  );
  const cashThatDay = cashNow + (cashToday.data?.paid ?? 0);
  const overCashLimit = cashLimitApplies && cashThatDay > cashLimit;

  const complete: Record<Step, boolean> = {
    rent: rentOk,
    amount:
      value > 0 &&
      !tooMuch &&
      !loanOver &&
      sourceDone &&
      (!rentCalc || rentOk) &&
      (into === "cash" || into === null || bankMode !== null),
    source: sourceDone,
    kind: kind !== null && (!subInKind || toDone),
    to: toDone,
    payee: rent
      ? !!landlord
      : skipped ||
        (payee !== null &&
          (payee.kind !== "party" ||
            (!payeeMatched && partyOk(newPayee, true, payeePhoneOptional)))),
    gst: gstMode === "none" || gstInput !== null,
    terms: !Object.values(loanProblems(terms)).some(Boolean) && !(dueOn !== "" && dueOn < day),
    details:
      day !== "" &&
      !panBad &&
      (into === "cash" || into === null || bankMode !== null),
  };
  // the cards that apply now, shown up to the first one not yet filled in
  const steps: Step[] = [
    "kind",
    ...(subInKind ? [] : (["to"] as Step[])),
    ...(headTds ? (["payee"] as Step[]) : []),
    ...(asksGst ? (["gst"] as Step[]) : []),
    ...(kind === "loanGiven" ? (["terms"] as Step[]) : []),
    "amount",
    "details",
  ];
  const [at, setAt] = useState<Step>("kind");
  // a card that no longer applies (loan terms, once it isn't a loan given) gives way to the amount
  const current: Step = steps.includes(at) ? at : "amount";

  // the Amount card opens with its field ready to type in
  useEffect(() => {
    if (current === "amount")
      document.getElementById("amount-field")?.focus({ preventScroll: true });
  }, [current]);
  const index = steps.indexOf(current);
  const firstOpen = steps.findIndex((s) => !complete[s]);
  const ready = firstOpen === -1;
  // a summary line can go back to any card up to the first one not yet filled in
  const reachable = (s: Step) => steps.indexOf(s) <= (ready ? steps.length - 1 : firstOpen);
  // phones: the summary folded into a bar above the card
  const [summaryOpen, setSummaryOpen] = useState(false);
  // the phone's Back goes to the card before; each card moved to is remembered as a step back
  const remember = useCardHistory<Step>("kind", (card) => {
    moveCard(() => {
      setTried(false);
      setAt(card);
    }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // a card's name; an expense's "Paid to" card is its head, and who was paid has its own
  const stepName = (s: Step) =>
    t(
      kind === "expense" && s === "to"
        ? "steps.head"
        : kind === "taxPaid" && s === "to"
          ? "steps.tax"
          : s === "details" && (into === "cash" || into === null)
            ? "steps.remarks"
            : `steps.${s}`,
    );

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
      ? to.ledger.party
        ? titleCase(to.ledger.party.name)
        : nameOf(to.ledger)
      : to?.kind === "new"
        ? to.name
        : to?.kind === "party"
          ? titleCase(newParty.name) || tc("newParty")
          : null;
  const summary: { step: Step; heading?: string; value: SummaryLine | SummaryLine[] | null }[] = [
    { step: "kind", value: kind && tk(kind) },
    { step: "to", value: toName },
    // what's due to them (a supplier, loan or tax with something owing), under its own heading after Paid to
    { step: "to", heading: t("due"), value: toName && dueShown !== null ? rupees(dueShown) : null },
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
              terms.frequency ? tl(`frequencies.${terms.frequency}`) : "",
              dueOn ? tc("dueBy", { day: dayInWords(dueOn, locale) }) : "",
            ].filter((v) => v !== "")
          : null,
    },
    {
      step: "source",
      // from both: cash and the bank, a line each with what it paid
      value:
        into === "cash"
          ? tc("cash")
          : !bank
            ? null
            : moreParts.length > 0
              ? [
                  ...(into === "both" ? [{ name: tc("cash"), amount: rupees(cashValue) }] : []),
                  {
                    name: `${bankNameIn(bank.bankName, locale)} ••${bank.last4}`,
                    amount: rupees(firstPart),
                  },
                  ...moreParts.flatMap((m) => {
                    const b = banks.data?.find((x) => x.id === m.bankId);
                    return b
                      ? [
                          {
                            name: `${bankNameIn(b.bankName, locale)} ••${b.last4}`,
                            amount: rupees(Number(m.amount) || 0),
                          },
                        ]
                      : [];
                  }),
                ]
              : into === "both"
                ? [
                    { name: tc("cash"), amount: rupees(cashValue) },
                    {
                      name: `${bankNameIn(bank.bankName, locale)} ••${bank.last4}`,
                      amount: rupees(bankValue),
                    },
                    ...(bankMode ? [t(`modes.${bankMode}`)] : []),
                  ]
                : [
                    `${bankNameIn(bank.bankName, locale)} ••${bank.last4}`,
                    ...(bankMode ? [t(`modes.${bankMode}`)] : []),
                  ],
    },
    {
      step: "details",
      value: ((lines) => (lines.length > 0 ? lines : null))(
        [remarks.trim()].filter((v) => v !== ""),
      ),
    },
  ];

  // leaving with something entered asks first (not after a save, which goes on to the payment's page)
  const { dialog: leaveDialog } = useLeaveGuard(
    !create.isSuccess && (value > 0 || kind !== null || remarks !== ""),
    onDiscard,
  );

  // a new card starts at the top of the page, with nothing in red yet
  function show(step: Step) {
    // back to an earlier card slides in from the left
    moveCard(
      () => {
        setTried(false);
        setAt(step);
      },
      steps.indexOf(step) < index,
    );
    remember(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Next: on to the card after this one, once it's filled in; otherwise what's missing shows in red, at its first field
  function next() {
    // Cash + Bank with the whole amount in one of them: it's paid from that one alone, then Next goes on as usual
    if (current === "amount" && into === "both" && value > 0 && cashPart !== "") {
      const alone = cashValue === value ? "cash" : cashValue === 0 ? "bank" : null;
      if (alone) {
        nextAfterAlone.current = true;
        setCashPart("");
        setInto(alone);
        return;
      }
    }
    if (!complete[current]) return guide();
    show(steps[index + 1]!);
  }
  // once Cash + Bank has become cash or the bank alone, the Next that did it carries on
  const nextAfterAlone = useRef(false);
  useEffect(() => {
    if (!nextAfterAlone.current) return;
    nextAfterAlone.current = false;
    next();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once the source has changed
  }, [into]);

  // someone or something picked from a list (who it's paid to, an expense head or tax, a loan, the landlord, who was
  // paid): on to the next card once the pick has settled, if that card is done (Back comes here to change it)
  // `pastPayee` goes on past who was paid too (labour, its payee skipped)
  const nextAfterPick = useRef<"next" | "pastPayee" | null>(null);
  const movesOn = (how: "next" | "pastPayee" = "next") => {
    nextAfterPick.current = how;
  };
  useEffect(() => {
    const how = nextAfterPick.current;
    if (!how) return;
    nextAfterPick.current = null;
    if (!complete[current]) return;
    const later = steps.slice(index + 1);
    show(
      how === "pastPayee" && later[0] === "payee" && complete.payee && later[1]
        ? later[1]
        : later[0]!,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once a pick has settled
  }, [to, loan, landlordId, payee]);

  // something missing: show it in red and put the cursor on its first field
  function guide() {
    setTried(true);
    setTimeout(
      () => document.querySelector<HTMLElement>('main section [aria-invalid="true"]')?.focus(),
      50,
    );
  }

  // Save tapped and still working: the button says so and can't be tapped again
  const [saving, setSaving] = useState(false);
  async function save() {
    // something still missing: back to the first card that needs it
    if (!ready) {
      setAt(steps[firstOpen]!);
      return guide();
    }
    // a new party with the same name in the same town: asked first
    // saving from the first tap until the saved payment opens (the checks, the save, then the page)
    setSaving(true);
    if (!loanOf && to?.kind === "party" && !(await sameName.confirm(newParty))) return setSaving(false);
    if (headTds && !rent && payee?.kind === "party" && !(await sameName.confirm(newPayee))) return setSaving(false);
    setSaveError(null);
    try {
      const r = await create.mutateAsync({
        dateTime: momentOf(day),
        paidFor: kind!,
        paidToLedgerId: !loanOf && to?.kind === "ledger" ? to.ledger.id : null,
        dueId: loanOf ? loan!.id : null,
        newLedger:
          !loanOf && to?.kind === "new"
            ? { name: to.name, tdsType: kind === "expense" ? newHeadTds : null }
            : null,
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
        settledIn: into === "both" ? "cashAndBank" : into!,
        // their UPI ID typed for the QR: saved on them for next time
        payeeUpiId:
          asksUpi && typedUpiOk && !savedUpis.includes(typedUpi.trim().toLowerCase())
            ? typedUpi.trim().toLowerCase()
            : null,
        cashAmount: into === "both" ? cashValue : null,
        bankDetailsId: into === "cash" ? null : bankId,
        bankMode: into === "cash" ? null : bankMode,
        moreBankParts:
          into === "cash"
            ? []
            : moreParts.map((m) => ({
                bankDetailsId: m.bankId!,
                amount: Number(m.amount),
                mode: m.mode!,
              })),
        remarks,
      });
      void utils.accounts.invalidate();
      // what cash and the banks hold now changed: the success page asks again
      void utils.transactions.payment.sources.invalidate();
      void utils.transactions.due.invalidate();
      // on to the payment's own page with what the save gave back already in hand; replace, so going back doesn't
      // land on the filled form
      utils.transactions.payment.get.setData({ transactionId: r.transactionId }, r);
      utils.transactions.payment.balances.setData({ transactionId: r.transactionId }, r.balances);
      router.replace(`/transaction/payment/${r.transactionId}`);
    } catch (err) {
      setSaving(false);
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

  // the card on its own, with Back and Next; beside it on a wide screen the summary of what's filled in, and above it
  // on a phone the same summary folded into a bar
  return (
    <main className="mx-auto flex w-full max-w-6xl items-start gap-6 px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
      <h1 className="sr-only">{tp("title")}</h1>
      {leaveDialog}
      {sameName.dialog}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {kind && <div className="lg:hidden">{summaryBar()}</div>}
        <section
          key={current}
          aria-labelledby={`card-${current}`}
          className="txn-card on-ivory chat-rise flex flex-col gap-4 rounded-2xl bg-ivory p-4 text-chestnut sm:p-5"
        >
          {/* back to the card before, then this card's name (Change beside it for someone new) */}
          {index > 0 && (
            <button
              type="button"
              onClick={() => show(steps[index - 1]!)}
              className="-mb-1 flex min-h-9 w-fit items-center gap-1.5 text-sm font-semibold"
            >
              <ArrowLeft className="size-4" aria-hidden /> {tr("back")}
            </button>
          )}
          <div className="-mb-1 flex items-center justify-between gap-2">
            <h2
              id={`card-${current}`}
              className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60"
            >
              {stepName(current)}
            </h2>
            {changeOf(current) && (
              <button
                type="button"
                onClick={changeOf(current)!}
                className="text-sm font-semibold underline underline-offset-2"
              >
                {tpick("change")}
              </button>
            )}
          </div>
          {/* Next or Save was tapped and this card isn't done: what it still needs */}
          {tried && !complete[current] && (
            <FieldMessage className="mt-0">
              {/* the amount card names only what's missing: the amount, where it's paid from, or else what's red */}
              {current === "amount"
                ? t(
                    value === 0
                      ? "missing.amountEmpty"
                      : into === null
                        ? "missing.source"
                        : "missing.details",
                  )
                : t(`missing.${current}`)}
            </FieldMessage>
          )}
          {body(current)}
          {/* on to the next card; the last one saves. Paid for moves on by itself when a chip is picked (an expense or a
              tax asks its head first), and an old loan being added has its own Add instead */}
          {current === "details" ? (
            saveBlock()
          ) : (current === "kind" && !subInKind) || (current === "to" && addingOldLoan) ? null : (
            <button
              type="button"
              onClick={next}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-colors hover:bg-chestnut/90"
            >
              {tr("next")} <ArrowRight className="size-5" aria-hidden />
            </button>
          )}
        </section>
      </div>

      {/* wide screens: the summary, always in view */}
      <aside aria-label={t("summary")} className="sticky top-20 hidden w-80 shrink-0 lg:block">
        {summaryCard()}
      </aside>
    </main>
  );

  // phones: the total, in a bar that opens to the summary's lines
  function summaryBar() {
    return (
      <div className="on-ivory flow-root rounded-2xl bg-ivory text-chestnut">
        <button
          type="button"
          aria-expanded={summaryOpen}
          onClick={() => setSummaryOpen((o) => !o)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
            {t("summary")}
          </span>
          <span className="flex items-center gap-3">
            <span className={cn(money, "text-lg")}>{rupees(total)}</span>
            <ChevronDown
              className={cn("size-4 transition-transform", summaryOpen && "rotate-180")}
              aria-hidden
            />
          </span>
        </button>
        {summaryOpen && <div className="px-4 pb-3">{summaryLines()}</div>}
      </div>
    );
  }

  // what's filled in so far: the amount large, or where TDS applies the amount, TDS and total (₹0 under the limit); then
  // a line for each card answered
  function summaryCard() {
    return (
      <div className="on-ivory flex flex-col gap-3 rounded-2xl bg-ivory p-4 text-chestnut">
        {/* its name, small and muted like the cards' */}
        <h2 className="-mb-1 text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
          {t("summary")}
        </h2>
        {/* just what it comes to; its breakup is under the amount */}
        <p className={cn(money, "text-3xl")}>{rupees(total)}</p>
        {summaryLines()}
      </div>
    );
  }

  // a line for each card answered; a line goes back to its card (Paid from to the Amount card it's in)
  function summaryLines() {
    const lines = summary.filter((l) => l.value && (l.step === "source" || steps.includes(l.step)));
    if (lines.length === 0) return null;
    return (
      <dl className="flex flex-col border-t border-chestnut/15">
        {lines.map((l) => {
          const step = l.step === "source" ? "amount" : l.step;
          return (
            <button
              key={l.heading ?? l.step}
              type="button"
              disabled={!reachable(step)}
              onClick={() => {
                setSummaryOpen(false);
                show(step);
              }}
              className={cn(
                "flex flex-col items-start gap-0.5 border-b border-chestnut/15 py-2 text-left hover:bg-chestnut/4",
                step === current && "font-bold",
              )}
            >
              <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] opacity-60">
                {l.heading ?? stepName(l.step)}
              </dt>
              <dd className="flex w-full flex-col font-semibold">
                {(Array.isArray(l.value) ? l.value : l.value === null ? [] : [l.value]).map(
                  (line, i) =>
                    typeof line === "string" ? (
                      <span key={i} className="truncate">
                        {line}
                      </span>
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
          disabled={saving || create.isPending}
          aria-busy={saving || create.isPending}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory shadow-md transition-colors hover:bg-chestnut/90 aria-busy:opacity-80"
        >
          {/* the total, as the summary shows it (with any TDS and reverse-charge GST) */}
          {saving || create.isPending ? (
            <>
              <Spinner className="size-5" />
              <span>{tp("saving")}</span>
            </>
          ) : (
            <>
              <span>{tp("save")}</span>
              <span className="tabular">{rupees(total)}</span>
            </>
          )}
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
      // how much: the amount within this payment's limit, the buttons that fill it in, and where it's paid from
      case "amount":
        return amountBody();

      // what it was paid for; a change asks who it went to (and what follows) again
      case "kind":
        return (
          <>
            <div
              role="radiogroup"
              aria-label={t("steps.kind")}
              className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
            >
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => {
                    // the same one again: on to the next card with everything kept (expense and tax pick more here)
                    if (k === kind) {
                      if (k !== "expense" && k !== "taxPaid") show("to");
                      return;
                    }
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
                    if (k !== "expense" && k !== "taxPaid") show("to");
                  }}
                  className={chip(kind === k)}
                >
                  {tk(k)}
                </button>
              ))}
            </div>
            {/* an expense's head or the tax, in this same card */}
            <Reveal show={subInKind}>
              <div className="flex flex-col gap-3">
                <h3 className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
                  {stepName("to")}
                </h3>
                <div className="flex flex-col gap-3">{toPicker()}</div>
              </div>
            </Reveal>
          </>
        );

      // who it went to: the open loan, or a party or ledger found (or added)
      case "to":
        return <>{loanOf ? loanCards() : toPicker()}</>;

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
            <div className="grid gap-x-6 gap-y-3">
              <label className="flex flex-col gap-2.5 text-xs font-semibold">
                {tc("q.remarks")}
                <MicField
                  onText={(said) =>
                    setRemarks((v) =>
                      (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX),
                    )
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
          </>
        );
    }
  }

  // where it's paid from: cash, a bank or both, picked from one list with what each holds (the admin only); then one
  // panel with a row for each part in use, its amount on the right. The bank's row goes on with how it was paid (two
  // by two), the party's QR for UPI, then the account it left. Cash + Bank types either part and the other follows;
  // the bank's steps wait for its part. The cash-limit warning closes the panel
  function sourceTiles() {
    // all three, always, for every kind of payment: one that can't pay it (nothing held, or not enough for this
    // amount) shows muted
    const places: {
      id: "cash" | "bank" | "both";
      name: string;
      hint?: string;
      disabled: boolean;
    }[] = [
      {
        id: "cash",
        name: tc("cash"),
        hint: cashHeld === null ? undefined : rupees(cashHeld),
        disabled: !(canCash && cashCovers),
      },
      {
        id: "bank",
        name: t("bankPlace"),
        hint: banksHeld === null ? undefined : rupees(banksHeld),
        disabled: !(canBank && bankCovers),
      },
      {
        id: "both",
        name: t("cashAndBank"),
        // all the money there is: cash and every bank account, as Cash and Bank show them
        hint: cashHeld === null || banksHeld === null ? undefined : rupees(cashHeld + banksHeld),
        disabled: !offerBoth,
      },
    ];
    const place = places.find((o) => o.id === into);
    const usesBank = into === "bank" || into === "both";
    return (
      <>
        {/* cash or a bank: the list opens exactly as wide as the button */}
        <div>
          <PickMenu
            moneyHints
            label={t("steps.source")}
            current={place ? place.name : t("pickPlace")}
            options={places}
            picked={into ?? ""}
            onPick={(id) => {
              setBankId(null);
              if (id === "cash") {
                setInto("cash");
                setBankMode(null);
              } else if (id === "both") pickBoth();
              else {
                setInto("bank");
                setAccountsOpen((n) => n + 1);
              }
            }}
            invalid={tried && into === null}
            matchWidth
            inFlow
            className={cn(
              "min-h-14 text-base font-semibold",
              place ? "bg-chestnut text-ivory" : "bg-ivory text-chestnut",
            )}
          />
        </div>

        {/* the panel, all in one box: with Cash + Bank a row per part to type; then the bank's steps (straight away when
            it's the bank alone); then the cash-limit warning. Cash alone has only the warning, when there is one */}
        <Reveal follow show={usesBank || overCashLimit} gap="0.625rem">
          <div className="overflow-hidden rounded-control text-sm shadow-[0_0_5px_0] shadow-chestnut/25">
            {into === "both" && partRow("cash")}
            {usesBank && (
              <div className={cn(into === "both" && "border-t border-chestnut/15")}>
                {/* with cash: the bank's part, typed or the rest of the cash part */}
                {into === "both" && partRow("bank")}
                {/* the account cards, card 1 from the start (with cash, once the cash part is in) */}
                <Reveal follow show={into === "bank" || bothBankSet || moreParts.length > 0} gap="0px">
                  {multi ? accountRows() : oneAccount()}
                </Reveal>
              </div>
            )}
            {/* section 40A(3): a warning only, the payment still saves */}
            <Reveal show={overCashLimit} gap="0px">
              <div className={cn("px-3 py-2.5", into !== "cash" && "border-t border-chestnut/15")}>
                <Note className="text-amber-700">
                  {t("cashLimit", { amount: rupees(cashThatDay), limit: rupees(cashLimit) })}
                </Note>
              </div>
            </Reveal>
          </div>
        </Reveal>
      </>
    );
  }

  // a part's row: its name as a heading, then what it holds on the left (the admin only) and on the right what it
  // pays. With cash and a bank together it's typed (either fills in the other), otherwise it's the whole amount
  function partRow(part: "cash" | "bank") {
    const both = into === "both";
    const pays = both ? (part === "cash" ? cashValue : Math.max(0, bankValue)) : value;
    // what it holds, always in view while typing (the admin only): cash, the account picked, or before that all the
    // bank accounts together (as Bank shows in Paid from)
    const has = part === "cash" ? cashHeld : bankId ? pickedHeld : banksHeld;
    const name = part === "cash" ? tc("cash") : t("bankPlace");
    // the least it can be, and whether it's below that (only once it's filled in)
    const least = both ? (part === "cash" ? cashLeast : bankLeast) : 0;
    const short = both && cashPart !== "" && partTyping !== part && pays < least;
    const bad =
      short ||
      (part === "cash" ? cashOver || (tried && !partsOk) : bankOver || (tried && !partsOk));
    const Row = both ? "label" : "div";
    return (
      <Row className="flex flex-col gap-1.5 px-3 py-2.5">
        {/* its name as a heading; then what it holds on the left, what it pays on the right */}
        <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{name}</span>
        <span className="flex min-h-11 items-center justify-between gap-3">
          <span className={cn(money, "min-w-0 text-lg text-chestnut")}>
            {has === null ? null : rupees(has)}
          </span>
          {both ? (
            <span className="flex w-40 shrink-0 flex-col items-end gap-1">
              <span className="relative block w-full">
                <IndianRupee
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <NumberInput
                  value={
                    part === "cash"
                      ? cashPart
                      : partTyping === "bank"
                        ? bankTyped
                        : cashPart === ""
                          ? ""
                          : String(Math.max(0, bankValue))
                  }
                  onFocus={() => setPartTyping(part)}
                  onBlur={() => {
                    setPartTyping(null);
                    raiseToLeast();
                  }}
                  onChange={(v) => {
                    cashPartAuto.current = false;
                    if (part === "cash") return setCashPart(v);
                    // the bank's part typed: cash is the rest
                    setBankTyped(v);
                    setCashPart(
                      v === ""
                        ? ""
                        : String(Math.max(0, Math.round((value - Number(v)) * 100) / 100)),
                    );
                  }}
                  decimals={2}
                  maxDigits={13}
                  max={
                    part === "cash"
                      ? cashHeld === null
                        ? value
                        : Math.min(cashHeld, value)
                      : Math.min(value, banksHeld ?? value)
                  }
                  placeholder="0"
                  aria-label={name}
                  aria-invalid={bad || undefined}
                  className={cn(
                    input(bad),
                    "min-h-11 pl-8 text-right font-heading text-lg font-bold",
                  )}
                />
              </span>
              {/* the least this part can be, when the other can't cover the rest */}
              {least > 0 && (
                <span
                  className={cn(
                    "tabular text-xs",
                    short ? "font-semibold text-danger" : "opacity-70",
                  )}
                >
                  {t("atLeast", { amount: rupees(least) })}
                </span>
              )}
            </span>
          ) : (
            <span className={cn(money, "shrink-0 text-lg")}>{rupees(pays)}</span>
          )}
        </span>
      </Row>
    );
  }

  // the bank's accounts: a numbered card each (card 1 always, more added below it), folding to a summary (account, amount, how it was paid). Open, it has
  // the account dropdown with its balance, then the amount from it (typing the first's changes the last one's), then
  // how it was paid; the first account's UPI QR under its card; then another account while one is still short
  // how a bank payment was made: a grid of chips, two to a row
  function modeChips(mode: BankMode | null, onPick: (m: BankMode) => void) {
    return (
      <>
        <span>
          {t("paidBy")}
          <RequiredMark />
        </span>
        <div role="radiogroup" aria-label={t("paidBy")} className="grid grid-cols-2 gap-2">
          {BANK_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onPick(m)}
              className={cn(chip(mode === m), tried && mode === null && "border-danger")}
            >
              {t(`modes.${m}`)}
            </button>
          ))}
        </div>
        {tried && mode === null && <FieldMessage className="mt-0">{t("pickMode")}</FieldMessage>}
      </>
    );
  }

  // paid by UPI to someone with no UPI ID on file: a box to type theirs, for the QR
  function upiField() {
    const bad = (upiLeft || tried) && typedUpi.trim() !== "" && !typedUpiOk;
    return (
      <Reveal follow show={asksUpi} gap="0px">
        <label className="flex flex-col gap-2 text-xs font-semibold">
          <span>{t("payeeUpi")}</span>
          <input
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={typedUpi}
            maxLength={255}
            onChange={(e) => {
              setUpiLeft(false);
              setTypedUpi(e.target.value.toLowerCase().replace(/[^a-z0-9.@_-]/g, ""));
            }}
            onBlur={() => setUpiLeft(true)}
            placeholder="name@bank"
            aria-invalid={bad || undefined}
            className={input(bad)}
          />
          {bad && (
            <FieldMessage className="mt-0">
              {typedUpiShapeOk
                ? t("payeeUpiHandle", { handle: `@${typedUpi.trim().split("@")[1]}` })
                : t("payeeUpiBad")}
            </FieldMessage>
          )}
        </label>
      </Reveal>
    );
  }

  // one account pays it all: the account dropdown with its balance, then how it was paid once it's picked, then the
  // party's UPI QR. An account holding less than its share turns this into the cards (accountRows)
  function oneAccount() {
    return (
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-2 text-xs font-semibold">
          <span>
            {t("account")}
            <RequiredMark />
          </span>
          <PickMenu
            moneyHints
            label={t("account")}
            current={bank ? bankNameIn(bank.bankName, locale) : t("pickAccount")}
            currentSub={bank ? `••${bank.last4}` : undefined}
            options={coveringBanks.map((b) => {
              const h = bankHeld(b.id);
              return { id: b.id, name: bankNameIn(b.bankName, locale), sub: `••${b.last4}`, hint: h === null ? undefined : rupees(h) };
            })}
            picked={bankId ?? ""}
            onPick={(id) => {
              setAccountsOpen(0);
              setBankId(id);
              // it holds less than the amount: the cards come up, and the cursor goes to card 1's amount
              const h = bankHeld(id);
              if (h !== null && h < bankShare) setTimeout(() => document.getElementById("card-amount-first")?.focus(), 50);
            }}
            openSignal={accountsOpen}
            invalid={tried && !bank}
            matchWidth
            inFlow
            className={cn("min-h-14 text-base font-semibold", bank ? "bg-chestnut text-ivory" : "bg-ivory text-chestnut")}
          />
        </div>
        <Reveal follow show={!!bank} gap="0px">
          <div className="flex flex-col gap-2 text-xs font-semibold">
            {modeChips(bankMode, (m) => m !== bankMode && setBankMode(m))}
          </div>
        </Reveal>
        {upiField()}
        <Reveal follow show={qrShown} gap="0px">
          <UpiQr key={payeeUpis.join()} upiIds={payeeUpis} payee={qrParty?.name ?? ""} amount={upiAmount} />
        </Reveal>
      </div>
    );
  }

  function accountRows() {
    const rows = [
      { key: "first", first: true, id: bankId, mode: bankMode, amountText: firstAmount, amount: firstPart },
      ...moreParts.map((m) => ({ key: m.key, first: false, id: m.bankId, mode: m.mode, amountText: m.amount, amount: Number(m.amount) || 0 })),
    ];
    // how much of the bank's share the cards pay so far
    const paid = Math.round((bankShare - firstShort) * 100) / 100;
    const done = bankShare > 0 && firstShort === 0;
    return (
      <div className="flex flex-col gap-2.5 p-3">
        {/* a bar on top that fills as the cards pay the bank's share: paid on the left, what's left on the right */}
        <div className="flex flex-col gap-1.5 pb-1">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={bankShare}
            aria-valuenow={paid}
            className="h-3 overflow-hidden rounded-full bg-chestnut/10 shadow-[inset_0_0_0_1px] shadow-chestnut/15"
          >
            <div
              className={cn("h-full rounded-full transition-[width] duration-300", done ? "bg-success" : "bg-chestnut")}
              style={{ width: `${bankShare > 0 ? Math.min(100, (paid / bankShare) * 100) : 0}%` }}
            />
          </div>
          <div className="tabular flex justify-between gap-3 text-xs font-semibold">
            <span>{t("barPaid", { amount: rupees(paid) })}</span>
            <span className={cn(done && "text-success")}>
              {done ? t("barDone") : t("barLeft", { amount: rupees(firstShort) })}
            </span>
          </div>
        </div>
        {rows.map((r, i) => {
          const acc = banks.data?.find((b) => b.id === r.id);
          const has = r.id ? bankHeld(r.id) : null;
          // its own account, or one no other card uses
          const options = coveringBanks.filter(
            (b) => b.id === r.id || (b.id !== bankId && !moreParts.some((m) => m.bankId === b.id)),
          );
          const amountBad = (tried && !(r.amount > 0)) || (has !== null && r.amount > has);
          const incomplete = !r.id || !(r.amount > 0) || r.mode === null;
          // a card with something wrong after Next stays open
          const open = !foldedCards.includes(r.key) || (tried && incomplete) || amountBad;
          const toggle = () =>
            setFoldedCards((all) => (all.includes(r.key) ? all.filter((k) => k !== r.key) : [...all, r.key]));
          const setMode = (mode: BankMode) => {
            if (r.first) {
              if (mode === bankMode) return;
              setBankMode(mode);
            } else if (mode !== r.mode) setMorePart(r.key, { mode });
          };
          return (
            <div key={r.key} className="overflow-hidden rounded-control shadow-[0_0_5px_0] shadow-chestnut/30">
              {/* the card's top: (folded) the bank on one line and under it the amount with how it was paid
                  beside it, the bin then the arrow on the right. Tapping anywhere on it opens or folds it */}
              {(() => {
                const summary = !open && !!acc;
                const bin = !r.first && (
                  <button
                    type="button"
                    aria-label={t("removeAccount")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreParts((all) => all.filter((m) => m.key !== r.key));
                      setFoldedCards((all) => all.filter((k) => k !== r.key));
                    }}
                    className="grid size-11 place-items-center rounded-control hover:bg-chestnut/[0.08]"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                );
                const arrow = (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={t("accountN", { n: i + 1 })}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle();
                    }}
                    className="grid size-11 place-items-center rounded-control hover:bg-chestnut/[0.08]"
                  >
                    <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
                  </button>
                );
                return (
                  <div
                    onClick={toggle}
                    className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 pl-3 pr-1.5"
                  >
                    {summary ? (
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate font-semibold">{bankNameIn(acc.bankName, locale)}</span>
                        <span className="tabular shrink-0 text-xs opacity-70">{`••${acc.last4}`}</span>
                      </span>
                    ) : (
                      <span className="min-w-0 text-xs font-semibold uppercase tracking-[0.08em] opacity-70">
                        {t("accountN", { n: i + 1 })}
                      </span>
                    )}
                    {summary ? (
                      <span className="min-h-11" />
                    ) : (
                      // open: the bin beside the arrow (there's no amount line)
                      <span className="flex items-center justify-self-end">
                        {bin}
                        {arrow}
                      </span>
                    )}
                    {summary && (
                      <>
                        {/* the amount and, beside it at the same height, how it was paid; on the right the bin, then the arrow */}
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className={cn(money, "flex h-9 items-center rounded-control bg-chestnut px-2.5 text-lg text-ivory")}>
                            {rupees(r.amount)}
                          </span>
                          {r.mode && (
                            <span className="flex h-9 items-center rounded-control border border-chestnut/50 px-3 text-xs font-semibold">
                              {t(`modes.${r.mode}`)}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center justify-self-end">
                          {bin}
                          {arrow}
                        </span>
                      </>
                    )}
                  </div>
                );
              })()}

              <Reveal show={open} gap="0px">
                <div className="flex flex-col gap-3 border-t border-chestnut/15 px-3 pb-3 pt-3">
                  {/* the account, with what it holds */}
                  <div className="flex flex-col gap-2 text-xs font-semibold">
                    <span>
                      {t("account")}
                      <RequiredMark />
                    </span>
                    <PickMenu
            moneyHints
                      label={t("account")}
                      current={acc ? bankNameIn(acc.bankName, locale) : t("pickAccount")}
                      currentSub={acc ? `••${acc.last4}` : undefined}
                      options={options.map((b) => {
                        const h = bankHeld(b.id);
                        return { id: b.id, name: bankNameIn(b.bankName, locale), sub: `••${b.last4}`, hint: h === null ? undefined : rupees(h) };
                      })}
                      picked={r.id ?? ""}
                      onPick={(id) => {
                        // the account picked: its amount is next, so the cursor goes there
                        setTimeout(() => document.getElementById(`card-amount-${r.key}`)?.focus(), 0);
                        if (r.first) return setBankId(id);
                        // another account: its amount and how it was paid start again
                        if (id !== r.id) setMorePart(r.key, { bankId: id, amount: "", mode: null });
                      }}
                      invalid={tried && !r.id}
                      matchWidth
                      inFlow
                      className={cn(
                        "min-h-14 text-base font-semibold",
                        acc ? "bg-chestnut text-ivory" : "bg-ivory text-chestnut",
                      )}
                    />
                  </div>

                  {/* what it pays, up to what it holds and what's still to pay */}
                  <label className="flex flex-col gap-2 text-xs font-semibold">
                    <span>
                      {t("accountAmount")}
                      <RequiredMark />
                    </span>
                    <span className="relative block">
                      <IndianRupee
                        className={cn("pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2", r.amount > 0 && !amountBad && "text-ivory")}
                        aria-hidden
                      />
                      <NumberInput
                        id={`card-amount-${r.key}`}
                        value={r.amountText}
                        onChange={(v) => (r.first ? setFirstAmount(v) : setMorePart(r.key, { amount: v }))}
                        decimals={2}
                        maxDigits={13}
                        max={(() => {
                          const room = Math.round((r.amount + firstShort) * 100) / 100;
                          return has === null ? room : Math.min(has, room);
                        })()}
                        placeholder="0"
                        aria-invalid={amountBad || undefined}
                        className={cn(
                          input(amountBad),
                          "min-h-12 pl-8 font-heading text-lg font-bold",
                          // filled in: chestnut, as the amount on the Amount card
                          r.amount > 0 && !amountBad && "bg-chestnut text-ivory caret-ivory",
                        )}
                      />
                    </span>
                  </label>

                  {/* how it was paid, as chips, once it pays something */}
                  <Reveal follow show={r.amount > 0} gap="0px">
                    <div className="flex flex-col gap-2 text-xs font-semibold">
                      {modeChips(r.mode, setMode)}
                    </div>
                  </Reveal>

                  {/* the first account by UPI to someone with a UPI ID: its QR */}
                  {/* their UPI ID, asked once: in the first card paid by UPI; every card by UPI then shows its QR */}
                  {r.mode === "upi" && i === rows.findIndex((x) => x.mode === "upi") && upiField()}
                  <Reveal follow show={r.mode === "upi" && payeeUpis.length > 0 && r.amount > 0} gap="0px">
                    <UpiQr key={payeeUpis.join()} upiIds={payeeUpis} payee={qrParty?.name ?? ""} amount={r.amount} />
                  </Reveal>
                </div>
              </Reveal>
            </div>
          );
        })}
        {canAddAccount && (
          <button type="button" onClick={addAccount} className={cn(ADD_ON_IVORY, "mt-3 w-full sm:w-auto sm:self-start")}>
            <Plus className="size-4" aria-hidden /> {t("anotherAccount")}
          </button>
        )}
      </div>
    );
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
        <div className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
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
    );
  }

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
      ...(advance > 0 && weOwe > 0
        ? [{ key: "due", label: t("due"), amount: weOwe, gapBefore: true }]
        : []),
      ...(advance > 0
        ? [
            {
              key: "advance",
              label: <AdvanceTag>{t("advancePart")}</AdvanceTag>,
              amount: advance,
              tone: "advance" as const,
              gapBefore: weOwe === 0,
            },
          ]
        : []),
    ];
  }

  function amountBody() {
    return (
      // on a phone one column; on a wider screen the amount (its due, TDS, PAN, breakup) on the left, where it's paid
      // from on the right, starting level: the same for every kind of payment. Rent's godowns come above both, as wide
      // as the left column
      <div className="flex flex-col gap-4">
        {rentCalc && <div className="min-w-0 sm:w-[calc(50%-0.75rem)]">{rentBreakdown()}</div>}
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-6">
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
                <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
                  {t("interestDue")}
                  <span className={cn("relative block", calcDue > 0 && !tooMuch && "text-ivory")}>
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
                        max={cap}
                        placeholder="0"
                        aria-invalid={amountOver || tooMuch || (tried && value === 0) || undefined}
                        className={cn(
                          input(amountOver || tooMuch || (tried && value === 0)),
                          "min-h-14 pl-10 pr-11 font-heading text-2xl font-bold",
                          filled && !tooMuch && "bg-chestnut text-ivory caret-ivory",
                        )}
                      />
                    </MicField>
                  </div>
                </label>
                {/* what's owed on the supplier, loan or tax, and how much of it this settles (with its TDS) */}
                <Reveal follow show={dueShown !== null} gap="0.625rem">
                  <DueBar
                    due={dueShown ?? 0}
                    showDue={kind === "supplier"}
                    green
                    settles={
                      kind === "supplier" ? Math.min(settlesTotal, dueShown ?? 0) : settlesTotal
                    }
                  />
                </Reveal>
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
            {tooMuch && mostHeld !== null && (
              <FieldMessage className="mt-0">
                {t("tooMuch", { amount: rupees(mostHeld) })}
              </FieldMessage>
            )}
            {amountOver && !tooMuch && <FieldMessage className="mt-0">{overMessage()}</FieldMessage>}
            {loanOver && (
              <FieldMessage className="mt-0">
                {tc("problems.loanLeft", { left: rupees(loan!.left) })}
              </FieldMessage>
            )}

            {/* their PAN, where TDS applies and there's none on record: above the breakup it changes */}
            {panField()}
            {/* the amount's breakup, always (paid, any TDS and reverse-charge GST, the total, a due and an advance); then
            how the GST was worked out */}
            <AmountTable rows={amountRows()} />
            <Reveal follow show={value > 0 && !!tax?.declared}>
              <Note className="text-chestnut/70">{t("declaredNoTds")}</Note>
            </Reveal>
            <Reveal follow show={value > 0 && !!tax?.rcm}>
              {tax?.rcm && (
                <Note className="tabular text-chestnut/70">
                  {t("rcmNote", { on: rupees(tax.rcm.taxable) })}
                </Note>
              )}
            </Reveal>
            <Reveal follow show={value > 0 && !!tax?.bill}>
              {tax?.bill && (
                <Note className="tabular text-chestnut/70">
                  {t("billNote", { rate: tax.bill.rate, gst: rupees(tax.bill.gst) })}
                </Note>
              )}
            </Reveal>

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

          {/* where it's paid from, in this same card */}
          <div className="flex min-w-0 flex-col gap-2.5">
            <h3 className="text-xs font-semibold">{t("steps.source")}</h3>
            {sourceTiles()}
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
        <Reveal show={gstMode === "bill"}>
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
                className={input(
                  (gstin.length === 15 && !gstinOk) || (tried && !complete.gst && !gstinOk),
                )}
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
              <DateInput
                value={billDate}
                max={day}
                onChange={setBillDate}
                calendarLabel={t("billDate")}
                aria-invalid={(tried && billDate === "") || undefined}
                className={input(tried && billDate === "")}
              />
            </label>
            <div
              role="radiogroup"
              aria-label={t("gstRate")}
              className="flex flex-col gap-2.5 text-xs font-semibold"
            >
              <span>
                {t("gstRate")}
                <RequiredMark />
              </span>
              <div className="flex flex-wrap gap-2">
                {BILL_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={billRate === r}
                    onClick={() => setBillRate(r)}
                    className={chip(billRate === r)}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
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
      ].filter((v): v is string => typeof v === "string" && v !== "");
    const detailLines = (l: Loan) =>
      details(l).map((d) => (
        <span key={d} className="block truncate text-xs opacity-75">
          {d}
        </span>
      ));
    const needle = loanSearch.trim().toLowerCase();
    const shownLoans = (loans.data ?? []).filter(
      (l) =>
        needle === "" ||
        [l.partyName, l.partyPhone ?? ""].some((v) => v.toLowerCase().includes(needle)),
    );
    if (loan) {
      return (
        <div className="flex flex-col gap-2">
          <PickedCard
            aside={
              <span className="tabular shrink-0 text-sm font-semibold">{rupees(loan.left)}</span>
            }
            onEdit={isAdmin ? () => setEditingLoan((on) => !on) : undefined}
            onChange={() => {
              setLoan(null);
              setTotalGoal(null);
            }}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{titleCase(loan.partyName)}</span>
              {detailLines(loan)}
            </span>
          </PickedCard>
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
          {loanOver && (
            <FieldMessage className="mt-1">
              {tc("problems.loanLeft", { left: rupees(loan.left) })}
            </FieldMessage>
          )}
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
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLoan(l);
                movesOn();
              }}
              className={PICK_ROW}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{titleCase(l.partyName)}</span>
                {detailLines(l)}
              </span>
              <span className={cn("tabular shrink-0 text-sm", l.overdue && "text-danger")}>
                {rupees(l.left)}
              </span>
            </button>
          ))}
          {loans.isPending && (
            <p className="col-span-full flex items-center gap-2 px-1 py-2 text-sm">
              <Spinner className="size-4" /> {tc("looking")}
            </p>
          )}
          {!loans.isPending && shownLoans.length === 0 && (
            <p className="col-span-full px-1 py-2 text-sm">{tc("noLoans")}</p>
          )}
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
            // labour starts with who was paid skipped (Back opens it to name someone)
            const labour = kind === "expense" && c?.kind === "ledger" && c.ledger.key === "labour";
            setPayeeSkipped(labour);
            if (c?.kind === "party") setNewParty(emptyParty());
            // a transporter's tick belongs to the head it was given under
            setNewPayee((d) => ({ ...d, transportDeclaration: false }));
            // one picked from the list moves on by itself (labour past its skipped payee); someone or a head being
            // added waits for their details
            if (c?.kind === "ledger") movesOn(labour ? "pastPayee" : "next");
          }}
          canAdd={isAdmin && (toParty || kind === "expense")}
          onEdit={
            isAdmin &&
            to?.kind === "ledger" &&
            (to.ledger.party || (kind === "expense" && to.ledger.key === null))
              ? () => setEditingTo((on) => !on)
              : undefined
          }
          addParty={toParty}
          placeholder={toParty ? tc("hints.from") : t("searchLedger")}
        />

        {/* what's picked, changed right here: a party's details, or the name of an expense head of our own */}
        {editingTo &&
          to?.kind === "ledger" &&
          to.ledger.party &&
          partyEditor(
            to.ledger,
            (ledger) => setTo({ kind: "ledger", ledger }),
            () => setEditingTo(false),
          )}
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
        {kind === "expense" && to?.kind === "new" && (
          <TdsTypePicker value={newHeadTds} onChange={setNewHeadTds} />
        )}

        {to?.kind === "party" &&
          newPartyDetails(newParty, setNewParty, matched, (m) =>
            setTo({ kind: "ledger", ledger: m }),
          )}
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
          setLedger({
            ...ledger,
            party: {
              ...ledger.party!,
              name: saved.name,
              shortName: saved.shortName,
              phone: saved.phone,
              city: home?.city ?? null,
              upiIds: saved.upiIds,
            },
          });
        }}
      />
    );
  }

  // who an expense with TDS was paid to: a party found, or one added here (the admin)
  function payeePicker() {
    if (rent)
      return (
        <>
          <LandlordSearch
            twoColumns
            asksPan={false}
            canEdit={isAdmin}
            landlords={landlords.data ?? []}
            picked={landlordId}
            onPick={(id) => {
              setLandlordId(id);
              if (id) movesOn();
            }}
            canAdd={isAdmin}
            startOpen
          />
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
            if (c?.kind === "ledger") movesOn();
          }}
          canAdd={isAdmin}
          addParty
          placeholder={tc("hints.from")}
          onEdit={
            isAdmin && payee?.kind === "ledger" && payee.ledger.party
              ? () => setEditingPayee((on) => !on)
              : undefined
          }
          besideNew={
            canSkipPayee && (
              <button
                type="button"
                aria-pressed={skipped}
                onClick={() => setPayeeSkipped((on) => !on)}
                className={cn(chip(skipped), "min-h-11 px-5 text-sm font-semibold")}
              >
                {tc("skip")}
              </button>
            )
          }
        />
        {editingPayee &&
          payee?.kind === "ledger" &&
          payee.ledger.party &&
          partyEditor(
            payee.ledger,
            (ledger) => setPayee({ kind: "ledger", ledger }),
            () => setEditingPayee(false),
          )}
        {payee?.kind === "party" &&
          newPartyDetails(
            newPayee,
            setNewPayee,
            payeeMatched,
            (m) => setPayee({ kind: "ledger", ledger: m }),
            headTds === "contract" && headKey !== "labour",
            payeePhoneOptional,
          )}
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
        <PartyFields
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          tried={tried}
          strict
          asksRemarks={false}
          asksPan={!tdsPerson}
          phoneOptional={phoneOptional}
          onAddressesOpen={() => setTried(false)}
          onlyPhone={!!match}
          transporter={transporter}
        />
        {match?.party && (
          <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/4 p-3">
            <span className="text-xs font-semibold">{tc("q.phoneMatch")}</span>
            <PartyPick ledger={match} party={match.party} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => pickMatch(match)} className={chip(true)}>
                {t("useThem")}
              </button>
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, phone: "" }))}
                className={chip(false)}
              >
                {tc("changePhone")}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }
}
