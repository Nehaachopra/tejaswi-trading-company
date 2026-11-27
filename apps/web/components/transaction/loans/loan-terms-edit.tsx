"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import type { RouterOutputs } from "@repo/trpc/client";
import { fieldClass } from "~/components/ui/card-form";
import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";
import { useUpdateLoanTerms } from "~/providers/dues";

import { fieldRow } from "../shared/form-basics";
import { type LoanDraft, loanProblems, LoanTerms } from "./loan-terms";

type Loan = RouterOutputs["transactions"]["due"]["openLoans"][number];

const ACCOUNT_RE = /^[A-Z0-9/-]+$/;
const input = (bad: boolean) =>
  `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// the day a loan was taken, in India
const dayOf = (d: Date | string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(d));

// an open loan's terms changed right where it's picked, from now on (what was paid before keeps what it was): the rate
// a year with how often the interest is paid beside it, when it's due back (a bank's last EMI), and a lender's loan its
// account number with the EMI under it. Laid out as the Loan terms stage; Save hands back the loan as it now is
export function LoanTermsEdit({
  loan,
  onSaved,
  onCancel,
}: {
  loan: Loan;
  onSaved: (loan: Loan) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("transactions.chat");
  const tl = useTranslations("transactions.loan");
  const tn = useTranslations("transactions.lender");
  const tf = useTranslations("accounts.party.form");
  const { save, saving, refresh } = useUpdateLoanTerms();
  const lender = loan.lenderId !== null;

  // what's typed, starting from the loan as it is
  const [terms, setTerms] = useState<LoanDraft>({
    rate: loan.interestRate === null ? "" : String(loan.interestRate),
    frequency: loan.frequency,
  });
  const [dueOn, setDueOn] = useState(loan.dueOn ?? "");
  const [account, setAccount] = useState(loan.loanAccountNumber ?? "");
  const [emi, setEmi] = useState(loan.emiAmount === null ? "" : String(loan.emiAmount));
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState(false);

  // never due back before the day it was taken; a lender's loan needs its account number
  const taken = dayOf(loan.dated);
  const dueBad = dueOn !== "" && dueOn < taken;
  const accountBad = lender && !ACCOUNT_RE.test(account);
  const ok = !Object.values(loanProblems(terms)).some(Boolean) && !dueBad && !accountBad;

  async function submit() {
    setTried(true);
    setFailed(false);
    if (!ok || saving) return;
    try {
      const saved = await save({
        dueId: loan.id,
        interestRate: Number(terms.rate),
        frequency: terms.frequency!,
        dueOn: dueOn || null,
        loanAccountNumber: lender ? account : null,
        emiAmount: lender && Number(emi) > 0 ? Number(emi) : null,
      });
      refresh();
      onSaved(saved);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* the rate, how often it's paid beside it */}
      <LoanTerms draft={terms} onChange={(patch) => setTerms((d) => ({ ...d, ...patch }))} tried={tried} />

      {/* when it's due back; a lender's loan: its account number, the EMI under it */}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 sm:*:col-start-1">
        <label className={fieldRow}>
          <span>{t(lender ? "oldLoanLastEmi" : "q.dueOn")}</span>
          <DateInput
            value={dueOn}
            min={taken}
            onChange={setDueOn}
            calendarLabel={t(lender ? "oldLoanLastEmi" : "q.dueOn")}
            aria-invalid={dueBad || undefined}
            placeholder="—"
            className={cn(input(dueBad), "text-sm font-medium")}
          />
        </label>
        {lender && (
          <>
            <label className={fieldRow}>
              <span>
                {tn("account")}
                <RequiredMark />
              </span>
              <input
                value={account}
                maxLength={30}
                autoCapitalize="characters"
                onChange={(e) => setAccount(e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, ""))}
                aria-invalid={(tried && accountBad) || undefined}
                className={cn(input(tried && accountBad), "tabular uppercase")}
              />
            </label>
            <label className={fieldRow}>
              <span>{tn("emi")}</span>
              <NumberInput
                value={emi}
                onChange={setEmi}
                decimals={2}
                maxDigits={13}
                placeholder="0"
                className={cn(input(false), "tabular")}
              />
            </label>
          </>
        )}
      </div>

      {failed && <FieldMessage className="mt-0">{tl("termsFailed")}</FieldMessage>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 w-full rounded-control border border-chestnut/50 px-5 text-sm font-semibold hover:border-chestnut sm:w-auto"
        >
          {t("oldLoanCancel")}
        </button>
        <button
          type="button"
          data-recheck
          onClick={() => void submit()}
          aria-busy={saving}
          className="min-h-11 w-full rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory sm:w-auto"
        >
          {tf("saveDetails")}
        </button>
      </div>
    </div>
  );
}
