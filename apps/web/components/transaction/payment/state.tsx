"use client";

import { ERROR_MS } from "~/components/ui/field-message";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { dayInWords } from "~/components/ui/date-input";
import { bankNameIn } from "~/lib/bank-names";

import { type QrItem } from "../shared/qr-spot";
import { type GridPlace } from "../shared/split-grid";
import { rupees, titleCase } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import {
  useCashToday,
  useExpenseTax,
  useInterestTds,
  useLandlords,
  useOpenLoans,
  usePayment,
  usePaymentFits,
  useSupplierTds,
} from "~/providers/payment";
import { indiaDay } from "../../account/balance";
import { useLedgerName } from "../../account/ledger-name";
import { useSameNameConfirm } from "../../account/party/same-name";
import { partyLabel } from "../../account/party/party-kinds";
import {
  draftInput as partyInput,
  draftOk as partyOk,
  emptyDraft as emptyParty,
  type PartyDraft,
} from "../../account/party/party-fields";
import { type LedgerChoice, type PaymentKind } from "../pickers/ledger-picker";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { appOfUpi, type BankMode, upiFormatOk } from "@repo/trpc/client";
import { refOkFor } from "../shared/bank-mode";
import { emptyLoan, type LoanDraft, loanProblems } from "../loans/loan-terms";
import { usePhoneMatches } from "../pickers/party-finder";
import { type TdsType } from "../pickers/tds-type-picker";
import { createContext, useContext } from "react";
import {
  Loan,
  SummaryLine,
  Step,
  MorePart,
  PARTY_KINDS,
  LOAN_KINDS,
  GstMode,
  PAN_RE,
  GSTIN_RE,
  BILL_RATES,
  LABOUR_SKIP_MAX,
  CASH_EXPENSE_LIMIT,
  CASH_TRANSPORT_LIMIT,
  CASH_LIMIT_KINDS,
  isParty,
  momentOf,
} from "./shared";

let morePartKeys = 0;

// everything the payment form holds and works out: what's typed, what the server says, and the moves between
// cards. Made once in PaymentEntry; every card reads it with usePaymentEntry()
export function usePaymentEntryState({
  isAdmin,
  onDiscard,
}: {
  isAdmin: boolean;
  onDiscard: () => void;
}) {
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
  const router = useRouter();
  // the bank accounts, what cash and each account hold today (null for staff), and the save
  const {
    banks,
    sources,
    loading,
    loadFailed,
    retryLoad,
    savePayment,
    saving: creating,
    saved,
  } = usePayment();

  // the answers
  // where it's paid from: cash, one bank account, or cash and a bank account together
  const [into, setInto] = useState<"cash" | "bank" | "both" | null>(null);
  const [bankId, setBankId] = useState<string | null>(null);
  // paid from both: the cash part (the bank pays the rest); filled with what cash holds until it's typed
  const [cashPart, setCashPart] = useState("");
  const cashPartAuto = useRef(true);
  // Cash + Bank: which part's field is being typed in, and the bank's as typed (the cash part is kept; the bank's follows)
  const [partTyping, setPartTyping] = useState<"cash" | "bank" | null>(null);
  // an amount typed past what can be paid is cut to the most; this says why, under that field, until it's typed again
  const [capNote, setCapNote] = useState<{ key: string; text: string } | null>(null);
  // a cap's warning goes after a while, like every problem's words
  useEffect(() => {
    if (!capNote) return;
    const timer = setTimeout(() => setCapNote(null), ERROR_MS);
    return () => clearTimeout(timer);
  }, [capNote]);
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
  // the PAN as typed in its box, and the one Saved: only a Saved PAN counts (for the TDS and on their record), so
  // typing never makes the TDS (and the box with it) blink while the server works it out again
  const [pan, setPan] = useState("");
  const [savedPan, setSavedPan] = useState("");
  // the box open for typing: always while none is Saved, else once the pen is tapped
  const [panEditing, setPanEditing] = useState(false);
  // its mistakes show once Save is tapped (or Next)
  const [panLeft, setPanLeft] = useState(false);
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
  // each bank account's UTR or cheque number (by card key; the first is "first"), with how it was paid when typed: one
  // typed for another way of paying is dropped. A box left shows what's wrong with it
  const [refs, setRefs] = useState<Record<string, { mode: BankMode; text: string }>>({});
  const [refLeft, setRefLeft] = useState<string[]>([]);
  // a cash payment's own reference (a bill or voucher number), beside the remarks
  const [cashRef, setCashRef] = useState("");
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
  const bank = banks?.find((b) => b.id === bankId);
  const cashHeld = sources?.cash ?? null;
  const bankHeld = (id: string) => sources?.banks.find((b) => b.id === id)?.available ?? null;
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
  const allBanks = sources?.banks ?? [];
  const banksHeld =
    allBanks.length > 0 && allBanks.every((b) => b.available !== null)
      ? allBanks.reduce((sum, b) => sum + (b.available ?? 0), 0)
      : null;
  const canCash = hasMoney(cashHeld);
  const canBank = (banks?.length ?? 0) > 0 && hasMoney(banksHeld);
  const loanOf = kind !== null && LOAN_KINDS.includes(kind);
  const toParty = kind !== null && PARTY_KINDS.includes(kind);
  const { loans, loansLoading, loansFailed, retryLoans } = useOpenLoans(loanOf);
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
    const added = loans?.find((l) => l.id === addedLoanId);
    if (!added) return;
    setLoan(added);
    setAddedLoanId(null);
  }, [loans, addedLoanId]);
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
  // this payment can carry TDS (a supplier, an expense head with TDS, interest on a loan we took): the Amount box is
  // then named the bill, TDS coming out of it
  const tdsPossible = tdsParty || headTds !== null || kind === "interestPaid";
  const { landlords, landlordsFailed, retryLandlords } = useLandlords(rent);
  const landlord = rent ? landlords?.find((l) => l.id === landlordId) : undefined;
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

  // a Saved PAN counts; it's for this person only. Something typed and not Saved (or not a PAN) holds the form up
  const panGiven = PAN_RE.test(savedPan) ? savedPan : null;
  const panTypedOk = PAN_RE.test(pan);
  const panBad = pan !== savedPan;
  const savePan = () => {
    setPanLeft(true);
    if (pan === "" || panTypedOk) {
      setSavedPan(pan);
      setPanEditing(false);
    }
  };
  useEffect(() => {
    setPan("");
    setSavedPan("");
    setPanEditing(false);
    setPanLeft(false);
  }, [kind, to, payee, landlordId, loan?.id]);

  // staff don't see balances: once typing pauses, the server says whether the amount fits
  const [askedAmount, setAskedAmount] = useState(0);
  // the amount as last typed by hand in its box (not filled in by the website or a button)
  const keyedAmount = useRef<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setAskedAmount(value), 400);
    return () => clearTimeout(timer);
  }, [value]);
  // a supplier's TDS (section 194Q) is the website's to work out, never asked: the server says what it comes to
  const { supplierTds, supplierTdsFailed, retrySupplierTds } = useSupplierTds(
    {
      paidToLedgerId: to?.kind === "ledger" ? to.ledger.id : null,
      newPartyHasPan: panGiven !== null,
      pan: panGiven,
      amount: askedAmount,
      // the end of the day (a fixed moment, so the question doesn't change on every render)
      dateTime: new Date(`${day}T23:59:59+05:30`),
    },
    tdsParty && askedAmount > 0 && day !== "",
  );
  const tdsInfo = tdsParty && askedAmount === value ? (supplierTds ?? null) : null;
  // an expense's TDS and reverse-charge GST (rent from a landlord without a GSTIN), worked out by the server too
  const { expenseTax, expenseTaxFailed, retryExpenseTax } = useExpenseTax(
    {
      paidToLedgerId: to?.kind === "ledger" ? to.ledger.id : null,
      newHeadTdsType: to?.kind === "new" ? newHeadTds : null,
      payeeLedgerId: !rent && payee?.kind === "ledger" ? payee.ledger.id : null,
      payeeLandlordId: landlord?.id ?? null,
      newPayee: !rent && payee?.kind === "party",
      newPayeePan: panGiven ?? "",
      newPayeeHasGstin: newPayee.addresses.some((a) => a.gstin.trim() !== ""),
      newPayeeDeclared: newPayee.transportDeclaration,
      rentMonths: rent ? Number(rentMonths) || 1 : 1,
      gst: gstInput,
      pan: panGiven,
      amount: askedAmount,
      dateTime: new Date(`${day}T23:59:59+05:30`),
    },
    (headTds !== null || gstInput !== null) && askedAmount > 0 && day !== "",
  );
  const tax = (headTds || gstInput) && askedAmount === value ? (expenseTax ?? null) : null;
  // interest on a loan we took: its TDS depends on who gave it, as told when the loan was registered
  const { interestTds, interestTdsFailed, retryInterestTds } = useInterestTds(
    {
      dueId: loan?.id ?? "",
      pan: panGiven,
      amount: askedAmount,
      dateTime: new Date(`${day}T23:59:59+05:30`),
    },
    kind === "interestPaid" && loan !== null && askedAmount > 0 && day !== "",
  );
  const interestInfo =
    kind === "interestPaid" && loan && askedAmount === value ? (interestTds ?? null) : null;
  const tdsAmount = tdsInfo?.tds ?? tax?.tds?.tds ?? interestInfo?.tds?.tds ?? 0;
  const tdsRate = tdsInfo?.rate ?? tax?.tds?.rate ?? interestInfo?.tds?.rate ?? 0;
  const noPan = tdsInfo ? tdsInfo.rate === 5 : (tax?.tds?.rate ?? interestInfo?.tds?.rate) === 20;
  // a payment that can carry TDS (its year's switch is on): its breakup shows even while it's under the limit
  // anyone with no PAN where TDS applies, saved or new: asked below the amount, and it stays on their record
  const asksPan =
    tdsInfo?.rate === 5 ||
    !!tax?.panMissing ||
    !!interestInfo?.panMissing ||
    pan !== "" ||
    savedPan !== "";
  const tdsApplies = tdsInfo !== null || (!!tax?.applies && !skipped) || !!interestInfo?.applies;
  // the PAN box: only while TDS is actually taken on this payment and they've no PAN on record. Decided once the
  // amount has settled (and the server has answered), so it doesn't come and go on every key while the amount is typed
  const panNeeded = asksPan && tdsApplies && tdsAmount > 0;
  const [showPan, setShowPan] = useState(false);
  // (while the server is still working the TDS out for a new amount nothing has answered: the box stays as it was)
  const taxAnswered = tdsInfo !== null || tax !== null || interestInfo !== null;
  useEffect(() => {
    if (askedAmount === value && taxAnswered) setShowPan(panNeeded);
  }, [askedAmount, value, panNeeded, taxAnswered]);
  // another payee starts without it
  useEffect(() => setShowPan(false), [kind, to, payee, landlordId, loan?.id]);
  // an expense's TDS depends on who was paid, so it's open until they're picked
  const tdsKnown = tdsInfo !== null || hasPayee || interestInfo !== null;
  // the amount typed is without TDS and reverse-charge GST; with them, it must still fit what the source holds
  const rcmAmount = tax?.rcm?.gst ?? 0;
  const total = Math.round((value + tdsAmount + rcmAmount) * 100) / 100;
  // reverse charge is open on rent until the landlord is picked, as it depends on their GSTIN
  // the bill: what's typed in the Amount box (or filled in: a due, a Pay button, rent or interest worked out). TDS comes
  // out of it and the rest is handed over, so once the TDS is known the amount handed over (`amount`) moves until it
  // and the TDS make the bill (reverse-charge GST goes on top, to the government); a few tries, so it can't chase a
  // limit for ever. With no TDS the two are the same
  const [billText, setBillText] = useState("");
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
  // a bill typed, spoken or filled in: the amount handed over starts at it, then the TDS is taken out
  const setBill = (raw: string) => {
    setBillText(raw);
    const bill = Number(raw) || 0;
    setTotalGoal(bill > 0 ? { total: bill, tries: 0 } : null);
    setAmount(raw);
  };
  // what's typed or spoken replaces a figure that was filled in
  const typeAmount = (raw: string) => {
    autoFilled.current = false;
    setBill(raw);
  };
  const payTotal = (goal: number) => setBill(String(goal));

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
    setBill(calcDue > 0 ? String(calcDue) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the worked-out figure changes
  }, [calc, calcDue]);

  // what can pay the amount: only the amount leaves cash or the bank, on every head and kind (TDS and reverse-charge GST
  // are owed to the government, paid later), so a source that doesn't hold the amount isn't offered (staff see no
  // balances; the save checks)
  const cashCovers = cashHeld === null || cashHeld >= value;
  // any account with money can pay (more accounts join in when one alone can't hold it)
  const coveringBanks = (banks ?? []).filter((b) => hasMoney(bankHeld(b.id)));
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
  const multi = moreParts.length > 0 || (!!bankId && pickedHeld !== null && pickedHeld < bankShare);
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
  // what the UPI ID box is called: named for who's paid (a supplier, a lender, the landlord ...), never "their"
  const upiLabel =
    kind === "supplier"
      ? "supplierUpi"
      : kind === "loanRepaid" || kind === "interestPaid"
        ? "lenderUpi"
        : kind === "loanGiven"
          ? "borrowerUpi"
          : kind === "refund"
            ? "customerUpi"
            : rent
              ? "landlordUpi"
              : headKey === "transport"
                ? "transporterUpi"
                : "payeeUpi";
  // their UPI ID for the QR: filled in with the one saved on them, or typed (a new one is saved on them with the payment)
  const [typedUpi, setTypedUpi] = useState("");
  const savedUpis = qrParty?.upiIds ?? [];
  // name@handle, and the handle (after @) one a UPI app gives out: @okicici, @ybl, @paytm, a bank's own… (one already
  // saved on them is taken as it is)
  const typedUpiShapeOk = upiFormatOk(typedUpi.trim());
  const typedUpiOk =
    typedUpiShapeOk &&
    (appOfUpi(typedUpi) !== null || savedUpis.includes(typedUpi.trim().toLowerCase()));
  // its mistakes show once the box is left (or Next is pressed), not while the handle is still being typed
  const [upiLeft, setUpiLeft] = useState(false);
  // the pen beside the UPI ID under the QR brings the box back to change it
  const [upiEditing, setUpiEditing] = useState(false);
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
    if (askedAmount !== value || value <= 0 || !sources || !banks) return;
    if (into === "cash" && !cashCovers) setInto(null);
    if (into === "bank" && !bankCovers) setInto(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the amount or source changes
  }, [askedAmount, value, total, into, bankId, sources, banks]);
  // nothing picks where it's paid from: the first card comes up by itself, offering cash and every bank account, and
  // what's typed in the cards says which it is (all cash, all bank, or both, settled on Next). An amount typed by hand
  // waits for the typing to pause; one filled in (what's unpaid, a Pay button, rent or interest worked out) doesn't
  // wait: that's set where the amount changes, below
  useEffect(() => {
    if (into !== null || value <= 0) return;
    if (keyedAmount.current === amount && askedAmount !== value) return;
    cashPartAuto.current = false;
    setInto("both");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- amount goes with value
  }, [into, value, askedAmount]);
  // a card changed after Next had settled it as cash or the bank alone (Back): it's open to both again
  const reopenBoth = () => {
    if (into === "cash" || into === "bank") setInto("both");
  };
  // a card each for cash and every bank account, its
  // amount typed or filled by Auto (off to start with: switched on, it fills them) from what each holds, cash first. The first account with an
  // amount is the bank's main part (bankId, firstAmount, bankMode), the others its more parts, the cash box the cash part
  const usesGrid = into === "bank" || into === "both";
  // null is Auto; it starts off, everything empty
  const [gridTyped, setGridTyped] = useState<Record<string, string> | null>({});
  const [gridModes, setGridModes] = useState<Record<string, BankMode | null>>({});
  const gridIds = ["cash", ...(banks ?? []).map((b) => b.id)];
  const gridHeld = (id: string) => (id === "cash" ? cashHeld : bankHeld(id));
  const gridFilled = (() => {
    let need = value;
    return Object.fromEntries(
      gridIds.map((id) => {
        const take = Math.round(Math.max(0, Math.min(gridHeld(id) ?? Infinity, need)) * 100) / 100;
        need = Math.round((need - take) * 100) / 100;
        return [id, take > 0 ? String(take) : ""];
      }),
    );
  })();
  const gridTexts = gridTyped ?? gridFilled;
  const gridPlaces: GridPlace[] = gridIds.map((id) => {
    const b = banks?.find((x) => x.id === id);
    return {
      id,
      name: id === "cash" ? tc("cash") : b ? bankNameIn(b.bankName, locale) : "",
      sub: id === "cash" ? null : `••${b?.last4 ?? ""}`,
      held: gridHeld(id),
      text: gridTexts[id] ?? "",
      amount: Number(gridTexts[id]) || 0,
      mode: id === "cash" ? null : (gridModes[id] ?? null),
    };
  });
  const gridTotal = Math.round(gridPlaces.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const gridAccs = gridPlaces.filter((p) => p.id !== "cash" && p.amount > 0);
  // what the grid still needs: it adds up to the amount, none past what it holds, every account taking something says
  // how, and Cash + Bank has something in each
  const gridOk =
    !usesGrid ||
    (gridTotal === value &&
      gridPlaces.every((p) => p.held === null || p.amount <= p.held) &&
      gridAccs.every((p) => p.mode !== null) &&
      gridAccs.length > 0 &&
      (into !== "both" || (gridPlaces[0]?.amount ?? 0) > 0));
  function setGridText(id: string, text: string) {
    reopenBoth();
    setGridTyped((was) => ({ ...(was ?? gridFilled), [id]: text }));
  }
  function setGridAuto(on: boolean) {
    // off: the cards keep what Auto had filled
    reopenBoth();
    setGridTyped(on ? null : gridFilled);
  }
  // Paid from changed by hand: the breakdown starts again, every card empty, no Paid by, Auto off
  function resetGrid() {
    setGridTyped({});
    setGridModes({});
  }
  function setGridMode(id: string, mode: BankMode | null) {
    reopenBoth();
    setGridModes((all) => ({ ...all, [id]: mode }));
  }
  // the grid feeds what's saved: the cash part, the first account, and the more parts (kept in step: set again when
  // anything else resets them)
  const gridKey = JSON.stringify([gridAccs, gridTexts.cash ?? ""]);
  useEffect(() => {
    if (!usesGrid) return;
    const first = gridAccs[0];
    const cash = into === "both" ? (gridTexts.cash ?? "") : "";
    const more: MorePart[] = gridAccs
      .slice(1)
      .map((p) => ({ key: `acc-${p.id}`, bankId: p.id, amount: p.text, mode: p.mode }));
    if (into === "both" && cashPart !== cash) {
      cashPartAuto.current = false;
      setCashPart(cash);
    }
    if (bankId !== (first?.id ?? null)) setBankId(first?.id ?? null);
    if (firstAmount !== (first?.text ?? "")) setFirstAmount(first?.text ?? "");
    if (bankMode !== (first?.mode ?? null)) setBankMode(first?.mode ?? null);
    if (JSON.stringify(moreParts) !== JSON.stringify(more)) setMoreParts(more);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gridKey stands for the grid's accounts and cash
  }, [usesGrid, into, gridKey, cashPart, bankId, firstAmount, bankMode, moreParts]);

  // a QR for each account paying by UPI to someone with a UPI ID, shown inside that account's card
  const qrItems: QrItem[] =
    !usesGrid || payeeUpis.length === 0
      ? []
      : gridAccs
          .filter((p) => p.mode === "upi")
          .map((p) => ({
            key: p.id,
            title: `${p.name} ${p.sub ?? ""}`.trim(),
            upiIds: payeeUpis,
            payee: qrParty?.name ?? "",
            amount: p.amount,
          }));

  // the amount changed: where it's paid from starts again, nothing left over (cash or bank, the accounts, their
  // amounts and how each was paid, the cash part)
  const amountSeen = useRef(value);
  useEffect(() => {
    if (amountSeen.current === value) return;
    amountSeen.current = value;
    // typed by hand: the cards wait for the typing to pause; filled in: the first card is there at once
    const filled = value > 0 && keyedAmount.current !== amount;
    if (filled) cashPartAuto.current = false;
    setInto(filled ? "both" : null);
    setBankId(null);
    setBankMode(null);
    setMoreParts([]);
    setFirstAmount("");
    setFoldedCards([]);
    setCashPart("");
    setBankTyped("");
    setGridTyped({});
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
  const { fits, fitsFailed, retryFits } = usePaymentFits(
    {
      settledIn: into === "both" ? "cashAndBank" : (into ?? "cash"),
      bankDetailsId: into === "cash" ? null : bankId,
      cashAmount: into === "both" ? cashValue : null,
      moreBankParts: moreParts
        .filter((m) => m.bankId && Number(m.amount) > 0)
        .map((m) => ({ bankDetailsId: m.bankId!, amount: Number(m.amount) })),
      amount: askedAmount,
    },
    into !== null &&
      (into === "cash" || !!bankId) &&
      partsOk &&
      held === null &&
      sources !== undefined &&
      askedAmount > 0,
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
      : askedAmount === value && fits === false;
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
    setBill("");
  }, [pickKey]);
  useEffect(() => {
    if (
      unpaidOf === null ||
      unpaid === null ||
      sources === undefined ||
      filledFor.current === unpaidOf
    )
      return;
    filledFor.current = unpaidOf;
    const goal = pairMost === null ? unpaid : Math.min(unpaid, pairMost);
    if (goal <= 0) return;
    // the due is the bill: any TDS comes out of it
    payTotal(goal);
    autoFilled.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when another loan or supplier is picked
  }, [unpaidOf, sources !== undefined]);
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
  const moneyCap = tdsApplies ? null : pairMost;
  const cap = [ruleCap, moneyCap ?? undefined]
    .filter((c): c is number => c !== undefined)
    .reduce<number | undefined>((m, c) => (m === undefined ? c : Math.min(m, c)), undefined);

  // when each card is filled in
  // the amount's fill: not while it's over what's held, when it shows red
  const filled = value > 0 && !amountOver;
  // what an expense or a tax is paid under is picked in the Paid for card itself
  const toDone = loanOf
    ? loan !== null && !loanOver
    : to !== null && (to.kind !== "party" || (!matched && partyOk(newParty, true)));
  const sourceDone =
    gridOk &&
    into !== null &&
    (into === "cash" || (bankMode !== null && !!bank && morePartsOk)) &&
    partsOk &&
    !over &&
    (held !== null || (askedAmount === value && fits === true));

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
  const { cashTodayPaid, cashTodayFailed, retryCashToday } = useCashToday(
    { ...cashWho, day },
    cashLimitApplies && day !== "" && Object.values(cashWho).some((v) => v !== null),
  );
  const cashThatDay = cashNow + cashTodayPaid;
  const overCashLimit = cashLimitApplies && cashThatDay > cashLimit;
  // the TDS and GST couldn't be worked out (even after the retries): Try again asks for whichever failed
  const taxFailed = supplierTdsFailed || expenseTaxFailed || interestTdsFailed;
  const retryTax = () => {
    if (supplierTdsFailed) retrySupplierTds();
    if (expenseTaxFailed) retryExpenseTax();
    if (interestTdsFailed) retryInterestTds();
  };

  // the bank accounts it goes out of, each with how it was paid: a reference box each, in its own card on the Amount
  // card (keyed by the account, so it stays with it whichever order the cards are in)
  const refAccounts =
    into === "cash" || into === null
      ? []
      : [
          { key: bankId ?? "", bankId, mode: bankMode },
          ...moreParts.map((m) => ({ key: m.bankId ?? "", bankId: m.bankId, mode: m.mode })),
        ].filter(
          (a): a is { key: string; bankId: string; mode: BankMode } =>
            a.bankId !== null && a.mode !== null,
        );
  // an account's reference as typed (empty once it's paid another way), and whether it fits how it was paid
  const refOf = (a: { key: string; mode: BankMode }) =>
    refs[a.key]?.mode === a.mode ? refs[a.key]!.text : "";
  const refOk = (a: { key: string; mode: BankMode }) => refOkFor(a.mode, refOf(a));

  const complete: Record<Step, boolean> = {
    rent: rentOk,
    amount:
      value > 0 &&
      !tooMuch &&
      !loanOver &&
      sourceDone &&
      (!rentCalc || rentOk) &&
      (into === "cash" || into === null || bankMode !== null) &&
      refAccounts.every(refOk),
    source: sourceDone,
    kind: kind !== null,
    to: toDone,
    payee: rent
      ? !!landlord
      : skipped ||
        (payee !== null &&
          (payee.kind !== "party" ||
            (!payeeMatched && partyOk(newPayee, true, payeePhoneOptional)))),
    gst: gstMode === "none" || gstInput !== null,
    terms: !Object.values(loanProblems(terms)).some(Boolean) && !(dueOn !== "" && dueOn < day),
    // a PAN typed and not Saved holds it up, only while its box is there
    details:
      day !== "" && !(panBad && showPan) && (into === "cash" || into === null || bankMode !== null),
  };
  // the cards that apply now, shown up to the first one not yet filled in
  const steps: Step[] = [
    "kind",
    "to",
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
          : s === "details"
            ? "steps.reference"
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
          ? { name: tc("cash"), amount: rupees(value) }
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
                    const b = banks?.find((x) => x.id === m.bankId);
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
                  ]
                : [
                    {
                      name: `${bankNameIn(bank.bankName, locale)} ••${bank.last4}`,
                      amount: rupees(value),
                    },
                  ],
    },
    {
      step: "details",
      value: ((lines) => (lines.length > 0 ? lines : null))(
        [
          ...(into === "cash" || into === "both" ? [cashRef] : []),
          ...refAccounts.map(refOf),
          remarks.trim(),
        ].filter((v) => v !== ""),
      ),
    },
  ];

  // leaving with something entered asks first (not after a save, which goes on to the payment's page)
  const { dialog: leaveDialog } = useLeaveGuard(
    !saved && (value > 0 || kind !== null || remarks !== ""),
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

  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());

  // an advance in it: asked once before going on ("Did you pay ₹X as advance?"); asked again if the advance changes
  const [advanceOk, setAdvanceOk] = useState<number | null>(null);
  const [askingAdvance, setAskingAdvance] = useState<((go: boolean) => void) | null>(null);
  function confirmAdvance() {
    if (advance <= 0 || advanceOk === advance) return Promise.resolve(true);
    return new Promise<boolean>((answer) =>
      setAskingAdvance(() => (go: boolean) => {
        setAskingAdvance(null);
        if (go) setAdvanceOk(advance);
        answer(go);
      }),
    );
  }

  // Next: on to the card after this one, once it's filled in; otherwise what's missing shows in red, at its first field
  async function next() {
    // Cash + Bank whose cards add up to the amount but all of it from one side (every rupee from the banks, or all
    // in cash): it's paid from that one alone, then Next goes on as usual. Adding up to the amount is all it asks
    const gridCash = gridPlaces.find((p) => p.id === "cash")?.amount ?? 0;
    if (current === "amount" && into === "both" && value > 0 && gridTotal === value) {
      const alone = gridCash === value ? "cash" : gridCash === 0 ? "bank" : null;
      if (alone) {
        nextAfterAlone.current = true;
        setCashPart("");
        setInto(alone);
        return;
      }
    }
    if (!complete[current]) return guide();
    // the amount leaves an advance: they say it's one before going on
    if (current === "amount" && !(await confirmAdvance())) return;
    show(steps[index + 1]!);
  }
  // once Cash + Bank has become cash or the bank alone, the Next that did it carries on
  const nextAfterAlone = useRef(false);
  useEffect(() => {
    if (!nextAfterAlone.current) return;
    nextAfterAlone.current = false;
    void next();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once the source has changed
  }, [into]);

  // someone or something picked from a list (who it's paid to, an expense head or tax, a loan, the landlord, who was
  // paid, or Skip on who was paid): on to the next card once the pick has settled, if that card is done (Back comes
  // here to change it)
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
  }, [to, loan, landlordId, payee, payeeSkipped]);

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
    // an advance not yet said to be one (the amount changed after Next): asked here too
    if (!(await confirmAdvance())) return;
    // a new party with the same name in the same town: asked first
    // saving from the first tap until the saved payment opens (the checks, the save, then the page)
    setSaving(true);
    if (!loanOf && to?.kind === "party" && !(await sameName.confirm(newParty)))
      return setSaving(false);
    if (headTds && !rent && payee?.kind === "party" && !(await sameName.confirm(newPayee)))
      return setSaving(false);
    setSaveError(null);
    try {
      const r = await savePayment({
        saveKey,
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
        referenceNumber:
          into !== "cash" && bankMode ? refOf({ key: bankId!, mode: bankMode }) || null : null,
        cashReferenceNumber: into === "cash" || into === "both" ? cashRef || null : null,
        moreBankParts:
          into === "cash"
            ? []
            : moreParts.map((m) => ({
                bankDetailsId: m.bankId!,
                amount: Number(m.amount),
                mode: m.mode!,
                referenceNumber: refOf({ key: m.bankId!, mode: m.mode! }) || null,
              })),
        remarks,
      });
      // on to the payment's own page (the save put it in hand); replace, so going back doesn't land on the filled form
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
            : code === "TOO_MANY_REQUESTS"
              ? tc("saveErrors.busy")
              : code === "BAD_REQUEST"
                ? tc("saveErrors.check")
                : tp("saveErrors.failed"),
      );
    }
  }

  return {
    usesGrid,
    gridShort: usesGrid ? Math.max(0, Math.round((value - gridTotal) * 100) / 100) : 0,
    gridPlaces,
    setGridText,
    setGridMode,
    gridAuto: gridTyped === null,
    setGridAuto,
    resetGrid,
    qrItems,
    t,
    tc,
    tpick,
    tp,
    tr,
    locale,
    tk,
    tl,
    nameOf,
    sameName,
    router,
    banks,
    sources,
    loading,
    loadFailed,
    retryLoad,
    savePayment,
    creating,
    saved,
    into,
    setInto,
    bankId,
    setBankId,
    cashPart,
    setCashPart,
    cashPartAuto,
    partTyping,
    setPartTyping,
    capNote,
    setCapNote,
    bankTyped,
    setBankTyped,
    amount,
    setAmount,
    kind,
    setKind,
    to,
    setTo,
    newParty,
    setNewParty,
    newHeadTds,
    setNewHeadTds,
    payee,
    setPayee,
    newPayee,
    setNewPayee,
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
    payeeSkipped,
    setPayeeSkipped,
    landlordId,
    setLandlordId,
    gstMode,
    setGstMode,
    gstin,
    setGstin,
    billNumber,
    setBillNumber,
    billDate,
    setBillDate,
    billRate,
    setBillRate,
    loan,
    setLoan,
    terms,
    setTerms,
    dueOn,
    setDueOn,
    day,
    setDay,
    bankMode,
    setBankMode,
    moreParts,
    setMoreParts,
    firstAmount,
    setFirstAmount,
    askingAdvance,
    accountsOpen,
    setAccountsOpen,
    foldedCards,
    setFoldedCards,
    setMorePart,
    remarks,
    setRemarks,
    refs,
    setRefs,
    refLeft,
    cashRef,
    setCashRef,
    setRefLeft,
    rentMonths,
    setRentMonths,
    rentEdits,
    setRentEdits,
    editingRent,
    setEditingRent,
    saveError,
    setSaveError,
    tried,
    setTried,
    value,
    bank,
    cashHeld,
    bankHeld,
    pickedHeld,
    held,
    hasMoney,
    allBanks,
    banksHeld,
    canCash,
    canBank,
    loanOf,
    toParty,
    loans,
    loansLoading,
    loansFailed,
    retryLoans,
    addingOldLoan,
    setAddingOldLoan,
    editingTo,
    setEditingTo,
    editingPayee,
    setEditingPayee,
    editingLoan,
    setEditingLoan,
    loanSearch,
    setLoanSearch,
    addedLoanId,
    setAddedLoanId,
    phoneMatches,
    matched,
    tdsParty,
    headTds,
    rent,
    landlords,
    landlordsFailed,
    retryLandlords,
    landlord,
    hasPayee,
    headKey,
    payeePhoneOptional,
    canSkipPayee,
    skipped,
    offersGst,
    gstinOk,
    gstInput,
    payeeMatches,
    payeeMatched,
    panGiven,
    panBad,
    askedAmount,
    setAskedAmount,
    keyedAmount,
    supplierTds,
    supplierTdsFailed,
    retrySupplierTds,
    tdsInfo,
    expenseTax,
    expenseTaxFailed,
    retryExpenseTax,
    tax,
    interestTds,
    interestTdsFailed,
    retryInterestTds,
    interestInfo,
    tdsAmount,
    tdsRate,
    noPan,
    asksPan,
    tdsApplies,
    tdsKnown,
    rcmAmount,
    total,
    totalGoal,
    setTotalGoal,
    interestMonths,
    setInterestMonths,
    interestTyped,
    setInterestTyped,
    typeAmount,
    payTotal,
    billText,
    tdsPossible,
    interestCalc,
    rentRows,
    rentOf,
    atLeastOne,
    monthlyRent,
    rentCalc,
    rentOk,
    rentOpen,
    setRentOpen,
    calc,
    interestWorked,
    calcDue,
    cashCovers,
    coveringBanks,
    bankCovers,
    mostHeld,
    needsBoth,
    pairMost,
    tooMuch,
    offerBoth,
    bothBanks,
    cashValue,
    bankValue,
    bankShare,
    moreValue,
    multi,
    firstPart,
    moreHeld,
    firstShort,
    moreOver,
    freeBanks,
    canAddAccount,
    morePartsOk,
    addAccount,
    newPayeeUpis,
    qrParty,
    typedUpi,
    setTypedUpi,
    savedUpis,
    typedUpiShapeOk,
    typedUpiOk,
    upiLeft,
    setUpiLeft,
    upiEditing,
    setUpiEditing,
    upiLabel,
    anyUpi,
    asksUpi,
    payeeUpis,
    savedKey,
    upiAmount,
    qrShown,
    bothBankMost,
    cashLeast,
    bankLeast,
    partsOk,
    raiseToLeast,
    bothBankSet,
    fillCashPart,
    pickBoth,
    amountSeen,
    accountSeen,
    rcmOpen,
    asksGst,
    fits,
    fitsFailed,
    retryFits,
    cashOver,
    bankOver,
    placesHeld,
    over,
    amountOver,
    loanOver,
    toBalance,
    taxOwed,
    supplierDue,
    unpaid,
    dueShown,
    toSupplier,
    weOwe,
    heldAdvance,
    settlesTotal,
    advance,
    unpaidOf,
    filledFor,
    autoFilled,
    pickKey,
    ruleCap,
    moneyCap,
    cap,
    filled,
    toDone,
    sourceDone,
    cashNow,
    cashLimitApplies,
    cashLimit,
    cashWho,
    cashTodayPaid,
    cashTodayFailed,
    retryCashToday,
    cashThatDay,
    overCashLimit,
    taxFailed,
    retryTax,
    refAccounts,
    refOf,
    refOk,
    complete,
    steps,
    at,
    setAt,
    current,
    index,
    firstOpen,
    ready,
    reachable,
    summaryOpen,
    setSummaryOpen,
    remember,
    stepName,
    changeOf,
    toName,
    summary,
    leaveDialog,
    show,
    next,
    nextAfterAlone,
    nextAfterPick,
    movesOn,
    guide,
    saving,
    setSaving,
    save,
    isAdmin,
    onDiscard,
  };
}

export type PaymentEntryState = ReturnType<typeof usePaymentEntryState>;

const PaymentEntryContext = createContext<PaymentEntryState | null>(null);
export const PaymentEntryProvider = PaymentEntryContext.Provider;

export function usePaymentEntry() {
  const value = useContext(PaymentEntryContext);
  if (!value) throw new Error("usePaymentEntry is used outside PaymentEntryProvider");
  return value;
}
