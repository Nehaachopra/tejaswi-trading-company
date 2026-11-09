"use client";

import { Plus, Search } from "lucide-react";

import { fieldClass } from "~/components/ui/card-form";
import { dayInWords } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicButton } from "~/components/ui/mic-button";
import {
  ADD_ON_IVORY,
  PICK_LIST,
  PICK_NEW,
  PICK_ROW,
  PICK_SEARCH,
  PICK_TWO_COLUMNS,
} from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { indiaDay } from "../../account/balance";
import {
  emptyDraft as emptyParty,
  PartyFields,
  type PartyDraft,
} from "../../account/party/party-fields";
import { PartyEdit } from "../../account/party/party-sheet";
import { emptyLender, LenderEdit, LenderFields } from "../loans/lender-fields";
import { OldLoanForm } from "../loans/old-loan-form";
import { HeadEdit, LedgerSearch, type Pickable } from "../pickers/ledger-picker";
import { PartyPick } from "../pickers/party-finder";
import { FailNote } from "../shared/bank-mode";
import { PartyEditor } from "../shared/party-editor";
import { PickedCard } from "../shared/picked-card";
import { chip, LEDGER_KINDS, LENDERS, type Loan } from "./shared";
import { useReceiptEntry } from "./state";

// the loan we gave: searched and picked, each open one with what's left on it (what comes back can't be more than
// that); one from before the app is added right here, and then picked
export function LoanCards() {
  const {
    isAdmin,
    t,
    tc,
    locale,
    loan,
    setLoan,
    loans,
    loansLoading,
    loansFailed,
    retryLoans,
    addingOldLoan,
    setAddingOldLoan,
    setAddedLoanId,
    editingFrom,
    setEditingFrom,
    loanSearch,
    setLoanSearch,
    loanOver,
    movesOn,
  } = useReceiptEntry();
  if (addingOldLoan) {
    return (
      <OldLoanForm
        given
        newPartyDetails={(draft, setDraft, match, pickMatch) => (
          <NewPartyDetails draft={draft} setDraft={setDraft} match={match} pickMatch={pickMatch} />
        )}
        onAdded={(id) => {
          setAddedLoanId(id);
          setAddingOldLoan(false);
        }}
        onCancel={() => setAddingOldLoan(false)}
      />
    );
  }
  // a loan's details, a line each
  const detailLines = (l: Loan) =>
    [
      dayInWords(indiaDay(new Date(l.dated)), locale),
      l.interestRate !== null && `${l.interestRate}% ${tc("aYear")}`,
      l.dueOn && tc("dueBy", { day: dayInWords(l.dueOn, locale) }),
    ]
      .filter((v): v is string => typeof v === "string" && v !== "")
      .map((d) => (
        <span key={d} className="block truncate text-xs opacity-75">
          {d}
        </span>
      ));
  if (loan) {
    return (
      <div className="flex flex-col gap-2">
        <PickedCard
          aside={
            <span className="tabular shrink-0 text-sm font-semibold">{rupees(loan.left)}</span>
          }
          onEdit={isAdmin ? () => setEditingFrom((on) => !on) : undefined}
          onChange={() => setLoan(null)}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{titleCase(loan.partyName)}</span>
            {detailLines(loan)}
          </span>
        </PickedCard>
        {/* who it's with, changed right here: a lender's details, or a party's */}
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
        {loanOver && (
          <FieldMessage className="mt-1">
            {tc("problems.loanLeft", { left: rupees(loan.left) })}
          </FieldMessage>
        )}
      </div>
    );
  }
  const needle = loanSearch.trim().toLowerCase();
  const shownLoans = (loans ?? []).filter(
    (l) =>
      needle === "" ||
      [l.partyName, l.partyPhone ?? ""].some((v) => v.toLowerCase().includes(needle)),
  );
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
        {loansLoading && !loansFailed && (
          <p className="col-span-full flex items-center gap-2 px-1 py-2 text-sm">
            <Spinner className="size-4" /> {tc("looking")}
          </p>
        )}
        {loansFailed && (
          <div className="col-span-full px-1 py-2">
            <FailNote text={t("loansFailed")} retry={retryLoans} />
          </div>
        )}
        {!loansLoading && !loansFailed && shownLoans.length === 0 && (
          <p className="col-span-full px-1 py-2 text-sm">{tc("noLoans")}</p>
        )}
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

// a loan we took: who gave it first; a bank or NBFC with the loan's account there, a person found or added
export function LoanTakenFrom() {
  const {
    tl,
    lender,
    setLender,
    bankLoan,
    bankLender,
    setBankLender,
    setFrom,
    setNewParty,
    tried,
  } = useReceiptEntry();
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
      {bankLoan && (
        <LenderFields
          key={bankLoan}
          type={bankLoan}
          draft={bankLender}
          onChange={(patch) => setBankLender((d) => ({ ...d, ...patch }))}
          tried={tried}
        />
      )}
      {lender === "individual" && <FromPicker />}
    </>
  );
}

// a party or ledger of this kind, searched right in the card; the admin adds a new party (its details right here) or
// a new ledger. One picked from the list moves on by itself
export function FromPicker() {
  const {
    isAdmin,
    tc,
    tpf,
    nameOf,
    kind,
    from,
    setFrom,
    newParty,
    setNewParty,
    fromParty,
    editingFrom,
    setEditingFrom,
    matched,
    movesOn,
    scrap,
  } = useReceiptEntry();
  const ownLedger = LEDGER_KINDS.includes(kind!);
  return (
    <>
      <LedgerSearch
        purpose="receipt"
        receiptKind={kind}
        value={from}
        onChange={(c) => {
          setFrom(c);
          if (c?.kind === "party") setNewParty(emptyParty());
          if (c?.kind === "ledger") movesOn();
        }}
        canAdd={isAdmin && (fromParty || ownLedger)}
        addParty={fromParty}
        onEdit={
          isAdmin &&
          from?.kind === "ledger" &&
          (from.ledger.party || (ownLedger && from.ledger.key === null))
            ? () => setEditingFrom((on) => !on)
            : undefined
        }
        placeholder={fromParty ? tc("hints.from") : tpf("searchLedger")}
      />

      {/* what's picked, changed right here: a party's details, or the name of a ledger of our own */}
      {editingFrom && from?.kind === "ledger" && from.ledger.party && (
        <PartyEditor
          ledger={from.ledger}
          setLedger={(ledger) => setFrom({ kind: "ledger", ledger })}
          close={() => setEditingFrom(false)}
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

      {/* a scrap sale: who bought it, once Scrap sale is picked */}
      {scrap && <BuyerPicker />}

      {from?.kind === "party" && (
        <NewPartyDetails
          draft={newParty}
          setDraft={setNewParty}
          match={matched}
          pickMatch={(m) => setFrom({ kind: "ledger", ledger: m })}
        />
      )}
    </>
  );
}

// a scrap sale's buyer, whose address goes on the invoice: a customer found, or (the admin) a new one added right
// here, made a customer with the receipt. Picking one moves on by itself
function BuyerPicker() {
  const { isAdmin, t, tc, buyer, setBuyer, buyerDraft, setBuyerDraft, buyerMatched, movesOn } =
    useReceiptEntry();
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold">{t("buyer")}</h3>
      <LedgerSearch
        purpose="receipt"
        receiptKind="customer"
        value={buyer}
        onChange={(c) => {
          setBuyer(c);
          if (c?.kind === "party") setBuyerDraft(emptyParty());
          if (c?.kind === "ledger") movesOn();
        }}
        canAdd={isAdmin}
        addParty
        placeholder={tc("hints.from")}
      />
      {buyer?.kind === "party" && (
        <NewPartyDetails
          draft={buyerDraft}
          setDraft={setBuyerDraft}
          match={buyerMatched}
          pickMatch={(m) => setBuyer({ kind: "ledger", ledger: m })}
        />
      )}
    </div>
  );
}

// someone new: their details, phone first. A phone someone already has shows them instead: use them, or change the
// phone
function NewPartyDetails({
  draft,
  setDraft,
  match,
  pickMatch,
}: {
  draft: PartyDraft;
  setDraft: React.Dispatch<React.SetStateAction<PartyDraft>>;
  match: Pickable | null;
  pickMatch: (m: Pickable) => void;
}) {
  const { tc, tpf, tried, setTried } = useReceiptEntry();
  return (
    <>
      <PartyFields
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        tried={tried}
        strict
        asksRemarks={false}
        onAddressesOpen={() => setTried(false)}
        onlyPhone={!!match}
      />
      {match?.party && (
        <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/4 p-3">
          <span className="text-xs font-semibold">{tc("q.phoneMatch")}</span>
          <PartyPick ledger={match} party={match.party} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pickMatch(match)} className={chip(true)}>
              {tpf("useThem")}
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
