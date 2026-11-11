"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

import { dayInWords } from "~/components/ui/date-input";
import { bankNameIn } from "~/lib/bank-names";

import { type QrItem } from "../shared/qr-spot";
import { type GridPlace } from "../shared/split-grid";
import { rupees, titleCase } from "~/lib/format";
import { useLeaveGuard } from "~/lib/use-leave-guard";
import { useLoansGiven, useReceipt } from "~/providers/receipt";
import {
  appOfUpi,
  type BankMode,
  gstOutOf,
  SCRAP_GST,
  type UpiApp,
  upiFormatOk,
  upiProblem,
} from "@repo/trpc/client";

import { indiaDay } from "../../account/balance";
import { useLedgerName } from "../../account/ledger-name";
import { useSameNameConfirm } from "../../account/party/same-name";
import {
  draftInput as partyInput,
  draftOk as partyOk,
  emptyDraft as emptyParty,
  type PartyDraft,
} from "../../account/party/party-fields";
import {
  type BankLender,
  emptyLender,
  lenderInput,
  type LenderDraft,
  lenderOk,
} from "../loans/lender-fields";
import { emptyLoan, type LoanDraft, loanInput, loanProblems } from "../loans/loan-terms";
import { type LedgerChoice, type ReceiptKind } from "../pickers/ledger-picker";
import { usePhoneMatches } from "../pickers/party-finder";
import { refOkFor } from "../shared/bank-mode";
import { moveCard, useCardHistory } from "../shared/card-steps";
import { type SummaryItem } from "../shared/entry-frame";
import {
  isParty,
  type Lender,
  type Loan,
  LOAN_KINDS,
  momentOf,
  type MorePart,
  PARTY_KINDS,
  type Step,
  TDS_RATE,
  tdsOn,
} from "./shared";

let morePartKeys = 0;

// everything the receipt form holds and works out: what's typed, what the server says, and the moves between cards.
// Made once in ReceiptEntry; every card reads it with useReceiptEntry()
export function useReceiptEntryState({
  isAdmin,
  onDiscard,
}: {
  isAdmin: boolean;
  onDiscard: () => void;
}) {
  const t = useTranslations("transactions.receipt.form");
  const tr = useTranslations("transactions.receipt");
  const tk = useTranslations("transactions.receipt.kinds");
  // words both forms use: the bank, its accounts and how money moved
  const tpf = useTranslations("transactions.payment.form");
  const tc = useTranslations("transactions.chat");
  const tl = useTranslations("transactions.loan");
  const locale = useLocale();
  const nameOf = useLedgerName();
  const sameName = useSameNameConfirm();
  const router = useRouter();
  const tdsLabel = useId();
  // the bank accounts, what cash and each account hold today (null for staff), and the save
  const {
    banks,
    sources,
    loading,
    loadFailed,
    retryLoad,
    saveReceipt,
    saving: creating,
    saved,
  } = useReceipt();

  // the answers
  const [kind, setKind] = useState<ReceiptKind | null>(null);
  const [from, setFrom] = useState<LedgerChoice>(null);
  // a scrap sale: the party who bought it, picked under Scrap sale, or a new one's details
  const [buyer, setBuyer] = useState<LedgerChoice>(null);
  const [buyerDraft, setBuyerDraft] = useState<PartyDraft>(() => emptyParty());
  const [newParty, setNewParty] = useState<PartyDraft>(() => emptyParty());
  const [lender, setLender] = useState<Lender | null>(null);
  const [bankLender, setBankLender] = useState<LenderDraft>(emptyLender);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [terms, setTerms] = useState<LoanDraft>(emptyLoan);
  const [dueOn, setDueOn] = useState("");
  const [amount, setAmount] = useState("");
  const [tdsOnIt, setTdsOnIt] = useState(false);
  const [tdsRate, setTdsRate] = useState("");
  // where it came into: cash, the bank, or cash and the bank together
  const [into, setInto] = useState<"cash" | "bank" | "both" | null>(null);
  const [bankId, setBankId] = useState<string | null>(null);
  // into both: the cash part (the bank takes the rest), and which part's field is being typed in with the bank's as
  // typed (the cash part is kept; the bank's follows)
  const [cashPart, setCashPart] = useState("");
  const [partTyping, setPartTyping] = useState<"cash" | "bank" | null>(null);
  const [bankTyped, setBankTyped] = useState("");
  // how the first account's part came in
  const [bankMode, setBankMode] = useState<BankMode | null>(null);
  // more accounts after the first, each with what came in and how; the first account takes the rest
  const [moreParts, setMoreParts] = useState<MorePart[]>([]);
  const [firstAmount, setFirstAmount] = useState("");
  // a UPI ID typed for an account with none, for its QR (by account; added to it with the receipt), and the boxes left
  // (their mistakes show then, not while the handle is still being typed)
  const [ourUpis, setOurUpis] = useState<Record<string, string>>({});
  const [ourUpisLeft, setOurUpisLeft] = useState<string[]>([]);
  // the app each typed UPI ID is in (by account): picked, or picked by itself from a known handle (@ybl → PhonePe)
  const [ourUpiApps, setOurUpiApps] = useState<Record<string, UpiApp | null>>({});
  // the account whose typed UPI ID is being changed (the pen above its QR brings its box back)
  const [ourUpiEditing, setOurUpiEditing] = useState<string | null>(null);
  // made when the form opens: a second save with it (a retry after the connection dropped) gets the first one's result
  const [saveKey] = useState(() => crypto.randomUUID());
  // Bank picked: the accounts' list opens by itself (back to 0 once an account is picked, so it doesn't open again)
  const [accountsOpen, setAccountsOpen] = useState(0);
  // the account cards folded to their one-line summary (by key; the first is "first")
  const [foldedCards, setFoldedCards] = useState<string[]>([]);
  const setMorePart = (key: string, patch: Partial<MorePart>) =>
    setMoreParts((all) => all.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const [day, setDay] = useState(() => indiaDay(new Date()));
  // each bank account's UTR or cheque number (by card key; the first is "first"), with how it came in when typed: one
  // typed for another way is dropped. A box left shows what's wrong with it
  const [refs, setRefs] = useState<Record<string, { mode: BankMode; text: string }>>({});
  const [refLeft, setRefLeft] = useState<string[]>([]);
  // the cash part's own reference (a bill or voucher number)
  const [cashRef, setCashRef] = useState("");
  const [remarks, setRemarks] = useState("");
  // the amount's breakdown, opened from the arrow beside its field
  // interest received: the months it's for, or what was typed in from a statement instead
  const [interestMonths, setInterestMonths] = useState("12");
  const [interestTyped, setInterestTyped] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Next or Save was tapped with something missing: what's missing shows in red
  const [tried, setTried] = useState(false);
  // the red marks clear once anything on the amount card changes; they come back only on the next tap
  useEffect(() => setTried(false), [amount, into, bankId, bankMode, cashPart, moreParts]);
  // another place starts with the first account alone
  useEffect(() => setMoreParts([]), [into]);
  // the picked party, lender or ledger being changed right here
  const [editingFrom, setEditingFrom] = useState(false);
  const fromLedgerId = from?.kind === "ledger" ? from.ledger.id : null;
  useEffect(() => setEditingFrom(false), [kind, fromLedgerId, loan?.id]);
  // a scrap sale: Scrap sale picked as the ledger; another ledger asks for no buyer
  const scrap = from?.kind === "ledger" && from.ledger.key === "scrapSale";
  // the buyer starts again for another ledger or another kind; Change on the ledger and Scrap sale picked again keeps
  // a buyer already filled in
  const buyerLedger = useRef<string | null>(null);
  useEffect(() => {
    if (fromLedgerId === null || fromLedgerId === buyerLedger.current) return;
    buyerLedger.current = fromLedgerId;
    setBuyer(null);
    setBuyerDraft(emptyParty());
  }, [fromLedgerId]);
  useEffect(() => {
    buyerLedger.current = null;
    setBuyer(null);
    setBuyerDraft(emptyParty());
  }, [kind]);
  // a new buyer's phone someone already has: they're used instead, or the phone is changed
  const buyerPhoneMatches = usePhoneMatches(buyerDraft.phone, "customer");
  const buyerMatched =
    buyer?.kind === "party" && buyerPhoneMatches.length > 0 ? buyerPhoneMatches[0]! : null;
  const [loanSearch, setLoanSearch] = useState("");
  // an old loan given being added in the card, and the one just added, picked once the list has it
  const [addingOldLoan, setAddingOldLoan] = useState(false);
  const [addedLoanId, setAddedLoanId] = useState<string | null>(null);

  // what's typed, worked out
  const value = Number(amount) || 0;
  const bank = banks?.find((b) => b.id === bankId);
  const cashHeld = sources?.cash ?? null;
  const bankHeld = (id: string) => sources?.banks.find((b) => b.id === id)?.available ?? null;
  const allBanks = sources?.banks ?? [];
  const banksHeld =
    allBanks.length > 0 && allBanks.every((b) => b.available !== null)
      ? allBanks.reduce((sum, b) => sum + (b.available ?? 0), 0)
      : null;
  const loanOf = kind !== null && LOAN_KINDS.includes(kind);
  const fromParty = kind !== null && PARTY_KINDS.includes(kind);
  const { loans, loansLoading, loansFailed, retryLoans } = useLoansGiven(loanOf);
  useEffect(() => {
    const added = loans?.find((l) => l.id === addedLoanId);
    if (!added) return;
    setLoan(added);
    setAddedLoanId(null);
  }, [loans, addedLoanId]);
  // a loan we took from a bank or NBFC: the lender's details instead of a party's, and only into a bank account
  const bankLoan: BankLender | null =
    kind === "loanTaken" && (lender === "bank" || lender === "nbfc") ? lender : null;
  useEffect(() => {
    if (bankLoan && (into === "cash" || into === "both")) setInto(null);
  }, [bankLoan, into]);
  const phoneMatches = usePhoneMatches(newParty.phone, "customer");
  // a new party's phone someone already has (one phone, one party): they're used instead, or the phone is changed
  const matched = from?.kind === "party" && phoneMatches.length > 0 ? phoneMatches[0]! : null;

  // TDS: a customer (a party) paying us, or a borrower paying interest, may have deducted it; they say so with the
  // switch and the law's rate is used
  const tdsCan =
    (kind === "customer" &&
      ((from?.kind === "ledger" && isParty(from.ledger)) || from?.kind === "party")) ||
    (kind === "interestReceived" && loan !== null && !loan.lenderId);
  const tdsValue = Number(tdsRate) || 0;
  const tdsBad = tdsCan && tdsOnIt && !(tdsValue > 0 && tdsValue < 100);
  const tdsAmount = tdsCan && tdsOnIt && !tdsBad ? tdsOn(value, tdsValue) : 0;
  useEffect(() => {
    setTdsOnIt(false);
    setTdsRate(kind ? (TDS_RATE[kind] ?? "") : "");
  }, [kind, from, loan?.id]);
  // what it settles: what came in and the TDS taken from it
  const total = Math.round((value + tdsAmount) * 100) / 100;
  // a scrap sale's GST, taken out of what came in at the law's rate (the split into CGST + SGST or IGST is the server's,
  // by the buyer's state): the price before GST and the GST
  const scrapGst =
    scrap && value > 0 ? gstOutOf(Math.round(value * 100), SCRAP_GST.rate, true) : null;

  // interest on a loan we gave: what's left at its rate for the months, or a figure typed in (then the months show --)
  const interestCalc = kind === "interestReceived" && !!loan?.interestRate;
  const interestWorked = interestCalc
    ? Math.round((loan!.left * loan!.interestRate! * Number(interestMonths)) / 12) / 100
    : 0;
  const interestDue = interestTyped !== null ? Number(interestTyped) || 0 : interestWorked;
  useEffect(() => setInterestTyped(null), [loan?.id]);
  useEffect(() => {
    if (interestCalc) setAmount(interestDue > 0 ? String(interestDue) : "");
  }, [interestCalc, interestDue]);

  // what's still owed by the customer or on the loan given back, above the amount; picking them fills it in (once each,
  // so what's typed afterwards stays; picking someone else clears a figure that was filled in)
  const fromBalance = from?.kind === "ledger" ? (from.ledger.balance?.today ?? null) : null;
  const customerDue =
    kind === "customer" && fromBalance?.side === "debit" && fromBalance.amount > 0
      ? fromBalance.amount
      : null;
  const unpaid = kind === "loanReturned" ? (loan?.left ?? null) : customerDue;
  const dueShown = unpaid !== null && unpaid > 0 ? unpaid : null;
  const unpaidOf =
    kind === "loanReturned"
      ? (loan?.id ?? null)
      : dueShown !== null && from?.kind === "ledger"
        ? from.ledger.id
        : null;
  const filledFor = useRef<string | null>(null);
  const autoFilled = useRef(false);
  const pickKey =
    kind === "loanReturned" ? (loan?.id ?? null) : from?.kind === "ledger" ? from.ledger.id : null;
  useEffect(() => {
    if (!autoFilled.current) return;
    autoFilled.current = false;
    setAmount("");
  }, [pickKey]);
  useEffect(() => {
    if (unpaidOf === null || unpaid === null || filledFor.current === unpaidOf || unpaid <= 0)
      return;
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
  // a loan given back can't be more than is left on it
  const loanOver = kind === "loanReturned" && loan !== null && value > loan.left;
  // a customer paying more than they owe (or owing nothing): the rest is an advance with us. Only worked out when their
  // balance is known (staff see none); someone new owes nothing yet, so all of it is an advance
  const fromCustomer =
    kind === "customer" &&
    ((from?.kind === "ledger" && !!from.ledger.party && !!from.ledger.balance) ||
      from?.kind === "party");
  const owes = fromCustomer && fromBalance?.side === "debit" ? fromBalance.amount : 0;
  const heldAdvance = fromCustomer && fromBalance?.side === "credit" ? fromBalance.amount : 0;
  const advance = fromCustomer && total > owes ? Math.round((total - owes) * 100) / 100 : 0;

  // where it came into. Money coming in fits anywhere, so nothing is capped; a bank's loan comes into a bank only
  const canBank = (banks?.length ?? 0) > 0;
  // the two parts with cash and the bank: what's typed for cash, and the rest into the bank
  const cashValue = Number(cashPart) || 0;
  const bankValue = Math.round((value - cashValue) * 100) / 100;
  // the bank's share, what more accounts take of it, and what's left for the first account
  const bankShare = into === "bank" ? value : into === "both" ? bankValue : 0;
  const moreValue = moreParts.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  // more than one account: one was added. Otherwise the one account takes all of it
  const multi = moreParts.length > 0;
  const firstPart = multi ? Number(firstAmount) || 0 : bankShare;
  // what the cards still have to take of the bank's share (another account takes it)
  const firstShort = Math.max(0, Math.round((bankShare - firstPart - moreValue) * 100) / 100);
  // the accounts not used yet, for another account
  const freeBanks = (banks ?? []).filter(
    (b) => b.id !== bankId && !moreParts.some((m) => m.bankId === b.id),
  );
  // another account card, below the cards, once the first has its account and while something is still to place
  const canAddAccount =
    (into === "bank" || into === "both") &&
    !!bankId &&
    freeBanks.length > 0 &&
    moreParts.every((m) => m.bankId) &&
    (!multi || firstShort > 0) &&
    moreParts.length < 4;
  // every card has an account, an amount and how it came in, and together they take all of the bank's share
  const morePartsOk =
    firstPart > 0 &&
    firstShort === 0 &&
    moreParts.every((m) => m.bankId && Number(m.amount) > 0 && m.mode);
  // a new account card opens: the first card's amount is typed first when it was taking all of it; the cards before it
  // fold to their summary once they have one
  const addAccount = () => {
    if (!multi) {
      setFirstAmount("");
      setFoldedCards([]);
      setTimeout(() => document.getElementById("card-amount-first")?.focus(), 50);
    } else setFoldedCards(["first", ...moreParts.map((m) => m.key)]);
    setMoreParts((all) => [
      ...all,
      { key: `more-${++morePartKeys}`, bankId: null, amount: "", mode: null },
    ]);
  };
  // both parts take something
  const partsOk = into !== "both" || (cashValue > 0 && bankValue > 0);
  // Cash + Bank: the bank's part is in, so its account can follow
  const bothBankSet = into === "both" && cashPart !== "" && bankValue > 0;
  // the amount changed: where it came into starts again, nothing left over (cash or bank, the accounts, their amounts
  // and how each came in, the cash part)
  const amountSeen = useRef(value);
  useEffect(() => {
    if (amountSeen.current === value) return;
    amountSeen.current = value;
    setInto(null);
    setBankId(null);
    setBankMode(null);
    setGridModes({});
    setCashPart("");
    setBankTyped("");
    setMoreParts([]);
    setFirstAmount("");
    setFoldedCards([]);
    setGridTexts({});
  }, [value]);
  // the first account changed: what came after it starts again (how it came in, its amount, the other cards)
  const accountSeen = useRef(bankId);
  useEffect(() => {
    if (accountSeen.current === bankId) return;
    accountSeen.current = bankId;
    setBankMode(null);
    setMoreParts([]);
    setFirstAmount("");
    setFoldedCards([]);
  }, [bankId]);

  // the bank accounts it came into, each with how: a reference box each, in its own card on the Amount card (keyed by
  // the account, so it stays with it whichever order the cards are in)
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
  // an account's reference as typed (empty once it came in another way), and whether it fits how it came in
  const refOf = (a: { key: string; mode: BankMode }) =>
    refs[a.key]?.mode === a.mode ? refs[a.key]!.text : "";
  const refOk = (a: { key: string; mode: BankMode }) => refOkFor(a.mode, refOf(a));

  // when each card is filled in
  const filled = value > 0 && !loanOver;
  const fromDone = loanOf
    ? loan !== null
    : kind === "loanTaken" && lender === null
      ? false
      : bankLoan
        ? lenderOk(bankLender)
        : from !== null && (from.kind !== "party" || (!matched && partyOk(newParty, true)));
  // a scrap sale's buyer, on its own card: a customer found, or a new one filled in
  const buyerDone =
    buyer?.kind === "ledger" ||
    (buyer?.kind === "party" && !buyerMatched && partyOk(buyerDraft, true));
  // by UPI into an account with no UPI ID: its UPI ID is a must (typed on its card, for the QR)
  const upisOk =
    into === "cash" ||
    [
      { id: bankId, mode: bankMode },
      ...moreParts.map((m) => ({ id: m.bankId, mode: m.mode })),
    ].every(({ id, mode }) => mode !== "upi" || !id || upiIdsOf(id).length > 0);
  // Bank, or Cash + Bank: a box each for cash (only when it's Cash + Bank) and every bank account, what came into it
  // typed. The first account with an amount is the bank's main part (bankId, firstAmount, bankMode), the others its
  // more parts, the cash box the cash part
  const usesGrid = into === "bank" || into === "both";
  const [gridTexts, setGridTexts] = useState<Record<string, string>>({});
  const [gridModes, setGridModes] = useState<Record<string, BankMode | null>>({});
  const gridIds = [...(into === "both" ? ["cash"] : []), ...(banks ?? []).map((b) => b.id)];
  const gridPlaces: GridPlace[] = gridIds.map((id) => {
    const b = banks?.find((x) => x.id === id);
    return {
      id,
      name: id === "cash" ? tc("cash") : b ? bankNameIn(b.bankName, locale) : "",
      sub: id === "cash" ? null : `••${b?.last4 ?? ""}`,
      held: id === "cash" ? cashHeld : bankHeld(id),
      text: gridTexts[id] ?? "",
      amount: Number(gridTexts[id]) || 0,
      mode: id === "cash" ? null : (gridModes[id] ?? null),
    };
  });
  const gridTotal = Math.round(gridPlaces.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const gridAccs = gridPlaces.filter((p) => p.id !== "cash" && p.amount > 0);
  // what the grid still needs: it adds up to the amount, every account taking something says how, and Cash + Bank
  // has something in each
  const gridOk =
    !usesGrid ||
    (gridTotal === value &&
      gridAccs.length > 0 &&
      gridAccs.every((p) => p.mode !== null) &&
      (into !== "both" || (gridPlaces[0]?.amount ?? 0) > 0));
  function setGridText(id: string, text: string) {
    setGridTexts((all) => ({ ...all, [id]: text }));
  }
  function setGridMode(id: string, mode: BankMode | null) {
    setGridModes((all) => ({ ...all, [id]: mode }));
  }
  // Received into changed by hand: the breakdown starts again, every card empty, nothing picked on it
  function resetGrid() {
    setGridTexts({});
    setGridModes({});
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
    if (into === "both" && cashPart !== cash) setCashPart(cash);
    if (bankId !== (first?.id ?? null)) setBankId(first?.id ?? null);
    if (firstAmount !== (first?.text ?? "")) setFirstAmount(first?.text ?? "");
    if (bankMode !== (first?.mode ?? null)) setBankMode(first?.mode ?? null);
    if (JSON.stringify(moreParts) !== JSON.stringify(more)) setMoreParts(more);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gridKey stands for the grid's accounts and cash
  }, [usesGrid, into, gridKey, cashPart, bankId, firstAmount, bankMode, moreParts]);

  const intoDone =
    upisOk &&
    (into === "cash"
      ? !bankLoan
      : (into === "bank" || (into === "both" && !bankLoan)) &&
        !!bank &&
        bankMode !== null &&
        partsOk &&
        (!multi || morePartsOk));
  const complete: Record<Step, boolean> = {
    kind: kind !== null,
    from: fromDone,
    buyer: buyerDone,
    terms: !Object.values(loanProblems(terms)).some(Boolean) && !(dueOn !== "" && dueOn < day),
    amount: value > 0 && !loanOver && !tdsBad && intoDone && gridOk && refAccounts.every(refOk),
    into: intoDone && gridOk,
    details: day !== "",
  };
  // the cards that apply now; one shows at a time, and Next moves on once it's filled in
  // capital has one ledger, Capital, so it asks for none
  const steps: Step[] = [
    "kind",
    ...(kind === "capital" ? [] : (["from"] as Step[])),
    // a scrap sale: who bought it, on a card of its own after the ledger
    ...(scrap ? (["buyer"] as Step[]) : []),
    ...(kind === "loanTaken" ? (["terms"] as Step[]) : []),
    "amount",
    "details",
  ];
  const [at, setAt] = useState<Step>("kind");
  // a card that no longer applies (loan terms, once it isn't a loan) gives way to the amount
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
  const reachable = (s: Step) => {
    const pos = steps.indexOf(s === "into" ? "amount" : s);
    return pos <= (ready ? steps.length - 1 : firstOpen);
  };
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

  // a card's name: the loan's card says so, and a ledger's
  const stepName = (s: Step) =>
    s === "buyer"
      ? t("buyer")
      : s === "from" && loanOf
      ? t("steps.loan")
      : s === "from" && kind !== null && !fromParty
        ? t("steps.ledger")
        : t(`steps.${s}`);
  // what a card still needs once Next or Save was tapped; the amount card names only what's missing
  const missingOf = (s: Step) =>
    s === "amount"
      ? t(
          value === 0
            ? "missing.amountEmpty"
            : into === null
              ? "missing.into"
              : "missing.amountDetails",
        )
      : t(`missing.${s}`);

  // someone new being filled in: Change, beside the card's name, goes back to searching
  const changeOf = (s: Step) =>
    s === "from" && from?.kind === "party"
      ? () => setFrom(null)
      : s === "buyer" && buyer?.kind === "party"
        ? () => setBuyer(null)
        : null;

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
  const accountName = (id: string | null) => {
    const b = banks?.find((x) => x.id === id);
    return b ? `${bankNameIn(b.bankName, locale)} ••${b.last4}` : null;
  };
  const summary: SummaryItem<Step>[] = [
    { key: "kind", step: "kind", heading: stepName("kind"), value: kind && tk(kind) },
    // capital: the Capital ledger it comes into, without a card of its own
    {
      key: "capital",
      step: "kind",
      heading: t("steps.ledger"),
      value: kind === "capital" ? nameOf({ key: "capital", name: "capital" }) : null,
    },
    { key: "from", step: "from", heading: stepName("from"), value: fromName },
    // a scrap sale's buyer, under its own heading
    {
      key: "buyer",
      step: "buyer",
      heading: t("buyer"),
      value: !scrap
        ? null
        : buyer?.kind === "ledger" && buyer.ledger.party
          ? titleCase(buyer.ledger.party.name)
          : buyer?.kind === "party"
            ? titleCase(buyerDraft.name) || tc("newParty")
            : null,
    },
    // what's still owed (a customer or the loan given back), under its own heading after Received from
    {
      key: "due",
      step: "from",
      heading: t("due"),
      value: fromName && dueShown !== null ? rupees(dueShown) : null,
    },
    {
      key: "terms",
      step: "terms",
      heading: stepName("terms"),
      value:
        kind === "loanTaken" && terms.rate !== ""
          ? [
              `${terms.rate}% ${tc("aYear")}`,
              terms.frequency ? tl(`frequencies.${terms.frequency}`) : "",
              dueOn ? tc("dueBy", { day: dayInWords(dueOn, locale) }) : "",
            ].filter((v) => v !== "")
          : null,
    },
    {
      key: "into",
      step: "into",
      heading: stepName("into"),
      // into both or several accounts: a line each with what came in (once the parts are typed); one account with how
      // it came in
      value:
        into === "cash"
          ? { name: tc("cash"), amount: rupees(value) }
          : !bank || (into === "both" && !bothBankSet)
            ? null
            : into === "both" || multi
              ? [
                  ...(into === "both" ? [{ name: tc("cash"), amount: rupees(cashValue) }] : []),
                  { name: accountName(bankId)!, amount: rupees(firstPart) },
                  ...moreParts.flatMap((m) => {
                    const name = accountName(m.bankId);
                    return name ? [{ name, amount: rupees(Number(m.amount) || 0) }] : [];
                  }),
                ]
              : [
                  { name: accountName(bankId)!, amount: rupees(value) },
                ],
    },
    {
      key: "details",
      step: "details",
      heading: stepName("details"),
      value: ((lines) => (lines.length > 0 ? lines : null))(
        [
          ...(into === "cash" || into === "both" ? [cashRef] : []),
          ...refAccounts.map(refOf),
          remarks.trim(),
        ].filter((v) => v !== ""),
      ),
    },
  ].filter((l) => l.step === "into" || steps.includes(l.step as Step)) as SummaryItem<Step>[];

  // a QR for each account by UPI with a UPI ID of ours, shown inside that account's card
  const qrItems: QrItem[] = !usesGrid
    ? []
    : gridAccs
        .filter((p) => p.mode === "upi" && upiIdsOf(p.id).length > 0)
        .map((p) => ({
          key: p.id,
          title: `${p.name} ${p.sub ?? ""}`.trim(),
          upiIds: upiIdsOf(p.id),
          payee: banks?.find((b) => b.id === p.id)?.accountHolderName ?? "",
          amount: p.amount,
          note: fromName ?? undefined,
        }));

  // leaving with something entered asks first (not after a save, which goes on to the receipt's page)
  const { dialog: leaveDialog } = useLeaveGuard(
    !saved && (value > 0 || kind !== null || remarks !== ""),
    onDiscard,
  );

  // a new card starts at the top of the page, with nothing in red yet
  function show(step: Step) {
    const to = step === "into" ? "amount" : step;
    // back to an earlier card slides in from the left
    moveCard(
      () => {
        setTried(false);
        setAt(to);
      },
      steps.indexOf(to) < index,
    );
    remember(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // an advance in it: asked once before going on ("Did you receive ₹X as advance?"); asked again if the advance changes
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
    // Cash + Bank whose cards add up to the amount but all of it on one side (every rupee into the banks, or all in
    // cash): it came into that one alone, then Next goes on as usual. Adding up to the amount is all it asks
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once the place has changed
  }, [into]);

  // someone or something picked from a list (who it came from, a loan): on to the next card once the pick has settled,
  // if that card is done (Back comes here to change it)
  const nextAfterPick = useRef(false);
  const movesOn = () => {
    nextAfterPick.current = true;
  };
  useEffect(() => {
    if (!nextAfterPick.current) return;
    nextAfterPick.current = false;
    if (complete[current]) show(steps[index + 1]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once a pick has settled
  }, [from, loan, buyer]);

  // what's wrong with an account's typed UPI ID: not name@bank, not a UPI app's handle, or another account's; null when
  // it's fine (or nothing's typed)
  // (a known handle but not the picked app's: "wrongApp"; no app picked: "app")
  function ourUpiProblem(accountId: string): "bad" | "handle" | "app" | "wrongApp" | "taken" | null {
    const u = (ourUpis[accountId] ?? "").trim();
    if (u === "") return null;
    if (!upiFormatOk(u)) return "bad";
    if (appOfUpi(u) === null) return "handle";
    const app = ourUpiApps[accountId] ?? null;
    if (app === null) return "app";
    if (upiProblem(u, app) !== null) return "wrongApp";
    if (banks?.some((b) => b.id !== accountId && b.upiIds.includes(u))) return "taken";
    return null;
  }
  // an account's UPI ID for its QR: the one saved on it, or one typed here that's fine
  function upiIdsOf(accountId: string | null): string[] {
    const acc = banks?.find((b) => b.id === accountId);
    if (!acc) return [];
    if (acc.upiIds.length > 0) return acc.upiIds;
    // only the admin adds one (staff are told to ask)
    if (!isAdmin) return [];
    const u = (ourUpis[acc.id] ?? "").trim();
    return u !== "" && ourUpiProblem(acc.id) === null ? [u] : [];
  }

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
    // saving from the first tap until the saved receipt opens (the checks, the save, then the page)
    setSaving(true);
    // a new party with the same name in the same town: asked first
    if (!loanOf && !bankLoan && from?.kind === "party" && !(await sameName.confirm(newParty)))
      return setSaving(false);
    // and a new scrap buyer
    if (scrap && buyer?.kind === "party" && !(await sameName.confirm(buyerDraft)))
      return setSaving(false);
    setSaveError(null);
    const viaLedger = !loanOf && !bankLoan;
    try {
      const r = await saveReceipt({
        saveKey,
        dateTime: momentOf(day),
        receivedFor: kind!,
        receivedFromLedgerId: viaLedger && from?.kind === "ledger" ? from.ledger.id : null,
        dueId: loanOf ? loan!.id : null,
        newLedger: viaLedger && from?.kind === "new" ? { name: from.name } : null,
        newParty: viaLedger && from?.kind === "party" ? partyInput(newParty) : null,
        loan:
          kind === "loanTaken"
            ? { ...loanInput(terms), lenderType: lender, dueOn: dueOn || null }
            : null,
        lender: bankLoan ? lenderInput(bankLender, bankLoan) : null,
        amount: value,
        settledIn: into === "both" ? "cashAndBank" : into!,
        cashAmount: into === "both" ? cashValue : null,
        bankDetailsId: into === "cash" ? null : bankId,
        bankMode: into === "cash" ? null : bankMode,
        referenceNumber:
          into !== "cash" && bankMode ? refOf({ key: bankId!, mode: bankMode }) || null : null,
        cashReferenceNumber: into === "cash" || into === "both" ? cashRef || null : null,
        moreBankParts:
          into === "cash" || !isAdmin
            ? []
            : moreParts.map((m) => ({
                bankDetailsId: m.bankId!,
                amount: Number(m.amount),
                mode: m.mode!,
                referenceNumber: refOf({ key: m.bankId!, mode: m.mode! }) || null,
              })),
        // a UPI ID typed for an account that had none, on an account this came into by UPI: added to it
        bankUpiIds:
          into === "cash"
            ? []
            : [
                { id: bankId, mode: bankMode },
                ...moreParts.map((m) => ({ id: m.bankId, mode: m.mode })),
              ].flatMap(({ id, mode }) => {
                const acc = banks?.find((b) => b.id === id);
                const u = (ourUpis[id ?? ""] ?? "").trim();
                return acc &&
                  mode === "upi" &&
                  acc.upiIds.length === 0 &&
                  u !== "" &&
                  ourUpiProblem(acc.id) === null
                  ? [{ bankDetailsId: acc.id, upiId: u, provider: ourUpiApps[acc.id]! }]
                  : [];
              }),
        tdsRate: tdsAmount > 0 ? tdsValue : null,
        buyerLedgerId: scrap && buyer?.kind === "ledger" ? buyer.ledger.id : null,
        newBuyer: scrap && buyer?.kind === "party" ? partyInput(buyerDraft) : null,
        remarks,
      });
      // on to the receipt's own page (the save put it in hand); replace, so going back doesn't land on the filled form
      router.replace(`/transaction/receipt/${r.transactionId}`);
    } catch (err) {
      setSaving(false);
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "CONFLICT" && (err as { message?: string }).message?.startsWith("Phone"))
        return setSaveError(tc("saveErrors.phone"));
      setSaveError(
        code === undefined
          ? tc("saveErrors.network")
          : code === "CONFLICT"
            ? tc("saveErrors.taken")
            : code === "TOO_MANY_REQUESTS"
              ? tc("saveErrors.busy")
              : code === "BAD_REQUEST" || code === "PRECONDITION_FAILED"
                ? tc("saveErrors.check")
                : tr("errors.failed"),
      );
    }
  }

  return {
    usesGrid,
    gridPlaces,
    setGridText,
    setGridMode,
    resetGrid,
    gridTotal,
    qrItems,
    isAdmin,
    t,
    tr,
    tk,
    tpf,
    tc,
    tl,
    locale,
    nameOf,
    sameName,
    tdsLabel,
    // the server's
    banks,
    loading,
    loadFailed,
    retryLoad,
    creating,
    loans,
    loansLoading,
    loansFailed,
    retryLoans,
    // the answers
    kind,
    setKind,
    from,
    setFrom,
    buyer,
    setBuyer,
    buyerDraft,
    setBuyerDraft,
    buyerMatched,
    newParty,
    setNewParty,
    lender,
    setLender,
    bankLender,
    setBankLender,
    loan,
    setLoan,
    terms,
    setTerms,
    dueOn,
    setDueOn,
    amount,
    setAmount,
    tdsOnIt,
    setTdsOnIt,
    into,
    setInto,
    bankId,
    setBankId,
    cashPart,
    setCashPart,
    partTyping,
    setPartTyping,
    bankTyped,
    setBankTyped,
    bankMode,
    setBankMode,
    moreParts,
    setMoreParts,
    firstAmount,
    setFirstAmount,
    askingAdvance,
    ourUpis,
    setOurUpis,
    ourUpiApps,
    setOurUpiApps,
    ourUpisLeft,
    setOurUpisLeft,
    ourUpiEditing,
    setOurUpiEditing,
    ourUpiProblem,
    upiIdsOf,
    accountsOpen,
    setAccountsOpen,
    foldedCards,
    setFoldedCards,
    setMorePart,
    day,
    setDay,
    refs,
    setRefs,
    refLeft,
    setRefLeft,
    cashRef,
    setCashRef,
    remarks,
    setRemarks,
    interestMonths,
    setInterestMonths,
    interestTyped,
    setInterestTyped,
    saveError,
    tried,
    setTried,
    editingFrom,
    setEditingFrom,
    loanSearch,
    setLoanSearch,
    addingOldLoan,
    setAddingOldLoan,
    setAddedLoanId,
    // worked out
    value,
    bank,
    cashHeld,
    bankHeld,
    banksHeld,
    loanOf,
    fromParty,
    bankLoan,
    matched,
    tdsCan,
    tdsValue,
    tdsAmount,
    total,
    scrap,
    scrapGst,
    interestCalc,
    interestWorked,
    interestDue,
    dueShown,
    filledFor,
    autoFilled,
    typeAmount,
    loanOver,
    owes,
    heldAdvance,
    advance,
    canBank,
    cashValue,
    bankValue,
    bankShare,
    multi,
    firstPart,
    firstShort,
    freeBanks,
    canAddAccount,
    addAccount,
    partsOk,
    bothBankSet,
    refAccounts,
    refOf,
    filled,
    fromName,
    // the cards
    complete,
    steps,
    current,
    index,
    reachable,
    summaryOpen,
    setSummaryOpen,
    stepName,
    missingOf,
    changeOf,
    summary,
    leaveDialog,
    show,
    next,
    movesOn,
    saving,
    save,
  };
}

export type ReceiptEntryState = ReturnType<typeof useReceiptEntryState>;

const ReceiptEntryContext = createContext<ReceiptEntryState | null>(null);
export const ReceiptEntryProvider = ReceiptEntryContext.Provider;

export function useReceiptEntry() {
  const value = useContext(ReceiptEntryContext);
  if (!value) throw new Error("useReceiptEntry is used outside ReceiptEntryProvider");
  return value;
}
