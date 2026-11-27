"use client";

import { IndianRupee } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";


import { fieldClass } from "~/components/ui/card-form";
import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { useAddOldDue } from "~/providers/dues";
import { cn } from "~/lib/utils";

import { indiaDay } from "../../account/balance";
import {
  draftInput as partyInput,
  draftOk as partyOk,
  emptyDraft as emptyParty,
  type PartyDraft,
  SECTION_TITLE,
} from "../../account/party/party-fields";
import { type LedgerChoice, type Pickable } from "../pickers/ledger-picker";
import {
  type BankLender,
  emptyLender,
  lenderInput,
  type LenderDraft,
  LenderFields,
  lenderOk,
} from "./lender-fields";
import { emptyLoan, type LoanDraft, loanInput, loanProblems, LoanTerms } from "./loan-terms";
import { usePhoneMatches } from "../pickers/party-finder";
import { PartySearchView } from "../shared/customer-stage";
import { fieldRow, pickRow } from "../shared/form-basics";
import { PickedCard } from "../shared/picked-card";
import { PlacePicker } from "../shared/place-picker";

const LENDERS = ["bank", "nbfc", "individual"] as const;
type Lender = (typeof LENDERS)[number];

const input = (bad: boolean) =>
  `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// a loan from before the app, added in the payment or receipt that settles it, over two stages. One we took: on Paid
// to, the kind of lender, then who (a party for an individual, a lender with its loan account for a bank or NBFC); one
// we gave (`given`) is always to a party. Then on Loan terms: how much, when, and its terms; that stage's Next adds it.
// The form's state lives with the payment or receipt, so it stays while the stages change
export function useOldLoan(given: boolean) {
  const { add, refreshAfterOld } = useAddOldDue();
  const [who, setWho] = useState<LedgerChoice>(null);
  const [newParty, setNewParty] = useState<PartyDraft>(() => emptyParty());
  const [amount, setAmount] = useState("");
  const [dated, setDated] = useState(() => indiaDay(new Date()));
  // a loan we gave is always to a person
  const [lender, setLender] = useState<Lender | null>(given ? "individual" : null);
  const [bankLender, setBankLender] = useState<LenderDraft>(emptyLender);
  const [terms, setTerms] = useState<LoanDraft>(emptyLoan);
  const [dueOn, setDueOn] = useState("");
  const [failed, setFailed] = useState<string | null>(null);

  const phoneMatches = usePhoneMatches(newParty.phone, "customer");
  const matched = who?.kind === "party" && phoneMatches.length > 0 ? phoneMatches[0]! : null;
  const bank: BankLender | null = lender === "bank" || lender === "nbfc" ? lender : null;
  // Paid to's part: the lender, and who
  const whoDone =
    lender !== null &&
    (bank
      ? lenderOk(bankLender)
      : who !== null && (who.kind !== "party" || (!matched && partyOk(newParty, true))));
  // Loan terms' part: how much, when, the rate and how often, a due date not before it was given
  const value = Number(amount.replace(/,/g, ""));
  const dueBad = dueOn !== "" && dueOn < dated;
  const termsDone =
    value > 0 && dated !== "" && !Object.values(loanProblems(terms)).some(Boolean) && !dueBad;

  // what comes under the source (who, a lender, the amount and terms): cleared when the source changes
  const resetBelow = () => {
    setWho(null);
    setNewParty(emptyParty());
    setBankLender(emptyLender());
    setAmount("");
    setDated(indiaDay(new Date()));
    setTerms(emptyLoan());
    setDueOn("");
    setFailed(null);
  };
  // a fresh form, each time + Old loan is tapped
  const reset = () => {
    setWho(null);
    setNewParty(emptyParty());
    setAmount("");
    setDated(indiaDay(new Date()));
    setLender(given ? "individual" : null);
    setBankLender(emptyLender());
    setTerms(emptyLoan());
    setDueOn("");
    setFailed(null);
  };

  // adds it: the new loan's id, or null when it couldn't be added (the reason shows on Loan terms)
  const save = async (): Promise<string | null> => {
    setFailed(null);
    if (!whoDone || !termsDone || add.isPending) return null;
    try {
      const due = await add.mutateAsync({
        kind: given ? "loanGiven" : "loanTaken",
        partyLedgerId: !bank && who?.kind === "ledger" ? who.ledger.id : null,
        newParty: !bank && who?.kind === "party" ? partyInput(newParty) : null,
        lender: bank ? lenderInput(bankLender, bank) : null,
        amount: value,
        dated,
        dueOn: dueOn || null,
        ...loanInput(terms),
        lenderType: given ? null : lender,
        remarks: "",
      });
      await refreshAfterOld();
      return due.id;
    } catch (e) {
      setFailed((e as Error).message);
      return null;
    }
  };

  return {
    given,
    who,
    setWho,
    newParty,
    setNewParty,
    matched,
    amount,
    setAmount,
    value,
    dated,
    setDated,
    lender,
    setLender,
    bank,
    bankLender,
    setBankLender,
    terms,
    setTerms,
    dueOn,
    setDueOn,
    dueBad,
    whoDone,
    termsDone,
    failed,
    saving: add.isPending,
    reset,
    resetBelow,
    save,
  };
}
export type OldLoan = ReturnType<typeof useOldLoan>;

// Paid to's part: "Old loan" with Change (back to the open loans) on top, the source (an accordion), then who
export function OldLoanWho({
  loan,
  tried,
  newPartyDetails,
  onChange,
}: {
  loan: OldLoan;
  tried: boolean;
  // the form's own way of taking someone new, so it works the same here
  newPartyDetails: (
    draft: PartyDraft,
    setDraft: React.Dispatch<React.SetStateAction<PartyDraft>>,
    match: Pickable | null,
    pickMatch: (m: Pickable) => void,
  ) => React.ReactNode;
  // Change on "Old loan": back to the open loans
  onChange: () => void;
}) {
  const t = useTranslations("transactions.chat");
  const tl = useTranslations("transactions.loan");
  const {
    given,
    lender,
    setLender,
    resetBelow,
    setTerms,
    bank,
    bankLender,
    setBankLender,
    who,
    setWho,
    setNewParty,
    newParty,
    matched,
  } = loan;
  return (
    <div className="flex flex-col gap-4">
      {/* as a new party: "Old loan" on top, Change goes back to the open loans */}
      <PickedCard oneLine onChange={onChange}>
        <span className="min-w-0 flex-1 truncate font-semibold">{t("oldLoan")}</span>
      </PickedCard>
      {/* first, for a loan we took, the kind of lender: it decides the TDS, and the rest of the form follows it */}
      {!given && (
        // as an accordion: all three open until one is picked, then closed to the pick
        <div className="grid gap-x-6 sm:grid-cols-2">
          <div className={pickRow}>
            <span>
              {tl("source")}
              <RequiredMark />
            </span>
            <PlacePicker
              label={tl("source")}
              places={LENDERS.map((l) => ({ id: l, name: tl(`lenders.${l}`), disabled: false }))}
              value={lender}
              onPick={(l) => {
                // another source: everything under it starts again (no leftovers from the one before)
                if (l !== lender) resetBelow();
                setLender(l);
                // a bank's interest is usually monthly; it can still be changed
                if (l !== "individual")
                  setTerms((d) => ({ ...d, frequency: d.frequency ?? "monthly" }));
              }}
              invalid={tried && lender === null}
            />
          </div>
        </div>
      )}
      {tried && lender === null && (
        <FieldMessage className="mt-0">{t("oldLoanLender")}</FieldMessage>
      )}

      {/* the lender (or who it was given to) as a heading, then its search, list and new lender under it */}
      {lender !== null && <h3 className={SECTION_TITLE}>{given ? t("oldLoanTo") : tl("lenderPart")}</h3>}

      {/* a bank or NBFC: its lender and loan account */}
      {bank && (
        <LenderFields
          key={bank}
          type={bank}
          draft={bankLender}
          onChange={(patch) => setBankLender((d) => ({ ...d, ...patch }))}
          tried={tried}
        />
      )}

      {/* an individual: an existing party or someone new */}
      {lender === "individual" && (
        // as a new supplier's Paid to: the search, then "New party" with Change over their details
        <PartySearchView
          search={{
            purpose: "receipt",
            receiptKind: "customer",
            value: who,
            onChange: (c) => {
              setWho(c);
              if (c?.kind === "party") setNewParty(emptyParty());
            },
            canAdd: true,
            placeholder: t("hints.from"),
          }}
          newPartyCard={who?.kind === "party"}
          form={
            who?.kind === "party" &&
            newPartyDetails(newParty, setNewParty, matched, (m) =>
              setWho({ kind: "ledger", ledger: m }),
            )
          }
        />
      )}

    </div>
  );
}

// Loan terms' part: how much and when, the rate and how often, the due date (a bank's last EMI); its Next adds it
export function OldLoanTerms({ loan, tried }: { loan: OldLoan; tried: boolean }) {
  const t = useTranslations("transactions.chat");
  const {
    given,
    bank,
    amount,
    setAmount,
    value,
    dated,
    setDated,
    terms,
    setTerms,
    dueOn,
    setDueOn,
    dueBad,
    failed,
  } = loan;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <label className={fieldRow}>
          <span>
            {t("q.amount")}
            <RequiredMark />
          </span>
          <span className={cn("relative block", value > 0 && "text-ivory")}>
            <IndianRupee
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
              aria-hidden
            />
            <NumberInput
              value={amount}
              onChange={setAmount}
              decimals={2}
              maxDigits={13}
              placeholder="0"
              aria-invalid={(tried && value === 0) || undefined}
              className={cn(
                input(tried && value === 0),
                "pl-9 font-semibold",
                value > 0 && "bg-chestnut text-ivory caret-ivory",
              )}
            />
          </span>
        </label>
      </div>

      <LoanTerms
        draft={terms}
        onChange={(patch) => setTerms((d) => ({ ...d, ...patch }))}
        tried={tried}
      />

      {/* when it was taken (or given), and when it's due back, side by side */}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <label className={fieldRow}>
          <span>
            {t(given ? "oldLoanGiven" : "oldLoanTaken")}
            <RequiredMark />
          </span>
          <DateInput
            value={dated}
            max={indiaDay(new Date())}
            onChange={setDated}
            calendarLabel={t(given ? "oldLoanGiven" : "oldLoanTaken")}
            className={cn(input(tried && dated === ""), "text-sm font-medium")}
          />
        </label>
        <label className={fieldRow}>
          <span>{t(bank ? "oldLoanLastEmi" : "q.dueOn")}</span>
          <DateInput
            value={dueOn}
            min={dated}
            onChange={setDueOn}
            calendarLabel={t(bank ? "oldLoanLastEmi" : "q.dueOn")}
            aria-invalid={dueBad || undefined}
            placeholder="—"
            className={cn(input(dueBad), "text-sm font-medium")}
          />
        </label>
      </div>
      {failed && <FieldMessage className="mt-0">{failed}</FieldMessage>}
    </div>
  );
}
