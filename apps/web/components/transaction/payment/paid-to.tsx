"use client";

import { Plus, Search } from "lucide-react";
import {
  ADD_ON_IVORY,
  PICK_LIST,
  PICK_NEW,
  PICK_ROW,
  PICK_SEARCH,
  PICK_TWO_COLUMNS,
} from "~/components/ui/page-styles";
import { fieldClass } from "~/components/ui/card-form";
import { dayInWords } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicButton } from "~/components/ui/mic-button";
import { Spinner } from "~/components/ui/spinner";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { indiaDay } from "../../account/balance";
import { PartyEdit } from "../../account/party/party-sheet";
import { LandlordSearch } from "../../entities/landlord-search";
import {
  emptyDraft as emptyParty,
  PartyFields,
  type PartyDraft,
} from "../../account/party/party-fields";
import { HeadEdit, LedgerSearch, type Pickable } from "../pickers/ledger-picker";
import { LenderEdit } from "../loans/lender-fields";
import { PartyEditor } from "../shared/party-editor";
import { PickedCard } from "../shared/picked-card";
import { OldLoanForm } from "../loans/old-loan-form";
import { PartyPick } from "../pickers/party-finder";
import { TdsTypePicker } from "../pickers/tds-type-picker";
import { Loan, chip } from "./shared";
import { usePaymentEntry } from "./state";
import { FailNote } from "./notes";

// the loan: searched and picked like everyone else paid, each open one we took with what's left on it (a repayment can't
// be more than that); one from before the app is added right here, and then picked
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
    editingLoan,
    setEditingLoan,
    loanSearch,
    setLoanSearch,
    setAddedLoanId,
    setTotalGoal,
    loanOver,
    movesOn,
  } = usePaymentEntry();
  if (addingOldLoan) {
    return (
      <OldLoanForm
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
  const shownLoans = (loans ?? []).filter(
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
              asksTypes={false}
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
        {loansLoading && (
          <p className="col-span-full flex items-center gap-2 px-1 py-2 text-sm">
            <Spinner className="size-4" /> {tc("looking")}
          </p>
        )}
        {loansFailed && (
          <div className="col-span-full px-1 py-2">
            {<FailNote text={t("loansFailed")} retry={retryLoans} />}
          </div>
        )}
        {!loansLoading && !loansFailed && shownLoans.length === 0 && (
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
export function ToPicker() {
  const {
    isAdmin,
    t,
    tc,
    nameOf,
    kind,
    to,
    setTo,
    newParty,
    setNewParty,
    newHeadTds,
    setNewHeadTds,
    setNewPayee,
    setPayeeSkipped,
    setGstMode,
    toParty,
    editingTo,
    setEditingTo,
    matched,
    movesOn,
  } = usePaymentEntry();
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
      {editingTo && to?.kind === "ledger" && to.ledger.party && (
        <PartyEditor
          ledger={to.ledger}
          setLedger={(ledger) => setTo({ kind: "ledger", ledger })}
          close={() => setEditingTo(false)}
        />
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

      {to?.kind === "party" && (
        <NewPartyDetails
          draft={newParty}
          setDraft={setNewParty}
          match={matched}
          pickMatch={(m) => setTo({ kind: "ledger", ledger: m })}
        />
      )}
    </>
  );
}

// who an expense with TDS was paid to: a party found, or one added here (the admin)
export function PayeePicker() {
  const {
    isAdmin,
    t,
    tc,
    payee,
    setPayee,
    newPayee,
    setNewPayee,
    setPayeeSkipped,
    landlordId,
    setLandlordId,
    editingPayee,
    setEditingPayee,
    headTds,
    rent,
    landlords,
    landlordsFailed,
    retryLandlords,
    headKey,
    payeePhoneOptional,
    canSkipPayee,
    skipped,
    payeeMatched,
    movesOn,
  } = usePaymentEntry();
  if (rent)
    return (
      <>
        {landlordsFailed && <FailNote text={t("landlordsFailed")} retry={retryLandlords} />}
        <LandlordSearch
          twoColumns
          asksPan={false}
          canEdit={isAdmin}
          landlords={landlords ?? []}
          loading={landlords === undefined && !landlordsFailed}
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
              // Skip goes straight on to the next card; tapped again (off) it stays to name someone
              onClick={() => {
                setPayeeSkipped(!skipped);
                if (!skipped) movesOn();
              }}
              className={cn(chip(skipped), "min-h-11 px-5 text-sm font-semibold")}
            >
              {tc("skip")}
            </button>
          )
        }
      />
      {editingPayee && payee?.kind === "ledger" && payee.ledger.party && (
        <PartyEditor
          ledger={payee.ledger}
          setLedger={(ledger) => setPayee({ kind: "ledger", ledger })}
          close={() => setEditingPayee(false)}
        />
      )}
      {payee?.kind === "party" && (
        <NewPartyDetails
          draft={newPayee}
          setDraft={setNewPayee}
          match={payeeMatched}
          pickMatch={(m) => setPayee({ kind: "ledger", ledger: m })}
          transporter={headTds === "contract" && headKey !== "labour"}
          phoneOptional={payeePhoneOptional}
        />
      )}
    </>
  );
}

// someone new: their details, phone first. A phone someone already has shows them instead: use them, or change the
// phone
export function NewPartyDetails({
  draft,
  setDraft,
  match,
  pickMatch,
  transporter = false,
  phoneOptional = false,
}: {
  draft: PartyDraft;
  setDraft: React.Dispatch<React.SetStateAction<PartyDraft>>;
  match: Pickable | null;
  pickMatch: (m: Pickable) => void;
  transporter?: boolean;
  phoneOptional?: boolean;
}) {
  const { t, tc, kind, newPayee, tried, setTried } = usePaymentEntry();
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
