"use client";

import { IndianRupee } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { trpc } from "~/trpc/client";
import { cn } from "~/lib/utils";

import { indiaDay } from "../account/balance";
import { draftInput as partyInput, draftOk as partyOk, emptyDraft as emptyParty, type PartyDraft } from "../account/party/party-fields";
import { type LedgerChoice, LedgerSearch, type Pickable } from "./ledger-picker";
import { type BankLender, emptyLender, lenderInput, type LenderDraft, LenderFields, lenderOk } from "./lender-fields";
import { emptyLoan, type LoanDraft, loanInput, loanProblems, LoanTerms } from "./loan-terms";
import { usePhoneMatches } from "./party-finder";

const LENDERS = ["bank", "nbfc", "individual"] as const;
type Lender = (typeof LENDERS)[number];

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;
const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-control border px-3.5 text-sm font-semibold transition-colors",
    on ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50 hover:bg-chestnut/[0.06]",
  );

// a loan from before the app, added right in the payment or receipt that settles it. One we took: first the kind of
// lender, then who (a party for an individual, a lender with its loan account for a bank or NBFC); one we gave (`given`)
// is always to a party. Then how much, when, and its terms. `newPartyDetails` is the form's own way of taking someone
// new, so it works the same here. Added, it goes back with the loan's id
export function OldLoanForm({
  given = false,
  newPartyDetails,
  onAdded,
  onCancel,
}: {
  given?: boolean;
  newPartyDetails: (draft: PartyDraft, setDraft: React.Dispatch<React.SetStateAction<PartyDraft>>, match: Pickable | null, pickMatch: (m: Pickable) => void) => React.ReactNode;
  onAdded: (dueId: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("transactions.chat");
  const tl = useTranslations("transactions.loan");
  const utils = trpc.useUtils();
  const add = trpc.transactions.due.addOld.useMutation();

  const [who, setWho] = useState<LedgerChoice>(null);
  const [newParty, setNewParty] = useState<PartyDraft>(() => emptyParty());
  const [amount, setAmount] = useState("");
  const [dated, setDated] = useState(() => indiaDay(new Date()));
  // a loan we gave is always to a person
  const [lender, setLender] = useState<Lender | null>(given ? "individual" : null);
  const [bankLender, setBankLender] = useState<LenderDraft>(emptyLender);
  const [terms, setTerms] = useState<LoanDraft>(emptyLoan);
  const [dueOn, setDueOn] = useState("");
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const phoneMatches = usePhoneMatches(newParty.phone, "customer");
  const matched = who?.kind === "party" && phoneMatches.length > 0 ? phoneMatches[0]! : null;
  const bank: BankLender | null = lender === "bank" || lender === "nbfc" ? lender : null;
  const whoDone = bank ? lenderOk(bankLender) : who !== null && (who.kind !== "party" || (!matched && partyOk(newParty, true)));

  // what's still needed, for the red marks once Add was tried
  const value = Number(amount.replace(/,/g, ""));
  const dueBad = dueOn !== "" && dueOn < dated;
  const ready = whoDone && value > 0 && dated !== "" && lender !== null && !Object.values(loanProblems(terms)).some(Boolean) && !dueBad;

  const save = async () => {
    setTried(true);
    setFailed(null);
    if (!ready) return;
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
      void utils.accounts.invalidate();
      await utils.transactions.due.invalidate();
      onAdded(due.id);
    } catch (e) {
      setFailed((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* first, for a loan we took, the kind of lender: it decides the TDS, and the rest of the form follows it */}
      {!given && (
      <div role="radiogroup" aria-label={tl("lender")} className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold">
          {tl("lender")}
          <RequiredMark />
        </span>
        <div className="flex flex-wrap gap-2">
          {LENDERS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lender === l}
              onClick={() => {
                setLender(l);
                // a bank's interest is usually monthly; it can still be changed
                if (l !== "individual") setTerms((d) => ({ ...d, frequency: d.frequency ?? "monthly" }));
              }}
              className={chip(lender === l)}
            >
              {tl(`lenders.${l}`)}
            </button>
          ))}
        </div>
      </div>
      )}
      {tried && lender === null && <FieldMessage className="mt-0">{t("oldLoanLender")}</FieldMessage>}

      {/* a bank or NBFC: its lender and loan account */}
      {bank && <LenderFields key={bank} type={bank} draft={bankLender} onChange={(patch) => setBankLender((d) => ({ ...d, ...patch }))} tried={tried} />}

      {/* an individual: an existing party or someone new */}
      {lender === "individual" && (
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold">
            {t(given ? "oldLoanTo" : "oldLoanFrom")}
            <RequiredMark />
          </span>
          <LedgerSearch
            purpose="receipt"
            receiptKind="customer"
            value={who}
            onChange={(c) => {
              setWho(c);
              if (c?.kind === "party") setNewParty(emptyParty());
            }}
            canAdd
            addParty
            placeholder={t("hints.from")}
          />
          {who?.kind === "party" && newPartyDetails(newParty, setNewParty, matched, (m) => setWho({ kind: "ledger", ledger: m }))}
        </div>
      )}

      {/* once it's known who: the loan itself */}
      {lender !== null && whoDone && (
        <>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2.5 text-xs font-semibold">
              <span>
                {t(bank ? "oldLoanOutstanding" : "q.amount")}
                <RequiredMark />
              </span>
              <span className={cn("relative block", value > 0 && "text-ivory")}>
                <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
                <NumberInput
                  value={amount}
                  onChange={setAmount}
                  decimals={2}
                  maxDigits={13}
                  placeholder="0"
                  aria-invalid={(tried && value === 0) || undefined}
                  className={cn(input(tried && value === 0), "pl-9 font-semibold", value > 0 && "bg-chestnut text-ivory caret-ivory")}
                />
              </span>
            </label>
            <label className="flex flex-col gap-2.5 text-xs font-semibold">
              <span>
                {t(given ? "oldLoanGiven" : "oldLoanTaken")}
                <RequiredMark />
              </span>
              <DateInput value={dated} max={indiaDay(new Date())} onChange={setDated} calendarLabel={t(given ? "oldLoanGiven" : "oldLoanTaken")} className={cn(input(tried && dated === ""), "text-sm font-medium")} />
            </label>
          </div>

          <LoanTerms draft={terms} onChange={(patch) => setTerms((d) => ({ ...d, ...patch }))} tried={tried} />

          <label className="flex flex-col gap-2.5 text-xs font-semibold sm:w-72">
            {t(bank ? "oldLoanLastEmi" : "q.dueOn")}
            <DateInput value={dueOn} min={dated} onChange={setDueOn} calendarLabel={t(bank ? "oldLoanLastEmi" : "q.dueOn")} aria-invalid={dueBad || undefined} placeholder="—" className={cn(input(dueBad), "text-sm font-medium")} />
          </label>
        </>
      )}

      {/* add it, or leave it */}
      {tried && !ready && <FieldMessage className="mt-0">{t("oldLoanFill")}</FieldMessage>}
      {failed && <FieldMessage className="mt-0">{failed}</FieldMessage>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-control border border-chestnut/50 px-5 text-sm font-semibold hover:border-chestnut">
          {t("oldLoanCancel")}
        </button>
        {lender !== null && whoDone && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={add.isPending}
            aria-busy={add.isPending}
            className="flex min-h-11 items-center justify-center gap-2 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory disabled:opacity-60"
          >
            {add.isPending && <Spinner className="size-4" />} {t("oldLoanAdd")}
          </button>
        )}
      </div>
    </div>
  );
}
