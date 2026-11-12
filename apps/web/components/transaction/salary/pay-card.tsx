"use client";

import { IndianRupee } from "lucide-react";

import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { LedgerSearch } from "../pickers/ledger-picker";
import { chip, input, saidAmount } from "../shared/form-basics";
import { PartyEditor } from "../shared/party-editor";
import { SalaryCards } from "./salary-cards";
import { SalaryTable } from "./salary-table";
import { useSalaryEntry } from "./state";

// the Paid for card: Salary or Advance, chips only; a tap moves on to who's paid (the same one again keeps what's there)
export function ForCard() {
  const { t, kind, setKind, tried, show } = useSalaryEntry();
  return (
    <div role="radiogroup" aria-label={t("for")} className="flex flex-wrap gap-2">
      {(["salary", "advance"] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={kind === k}
          onClick={() => {
            setKind(k);
            show("pay");
          }}
          className={cn(chip(kind === k), tried && kind === null && "border-danger")}
        >
          {t(`kinds.${k}`)}
        </button>
      ))}
    </div>
  );
}

// the Employees card, on its own after Paid for. A salary: the table of every employee owed. An advance: the
// employee, found and picked as a payment's supplier is (Edit and Change on the pick)
export function PayCard() {
  const { tc, kind, choice, setChoice, editing, setEditing } = useSalaryEntry();
  return (
    <div className="flex flex-col gap-4">
      {kind === "salary" && <SalaryTable />}

      {kind === "advance" && (
        <div className="flex flex-col gap-2.5">
          <LedgerSearch
            purpose="payment"
            receiptKind={null}
            payee="employee"
            value={choice}
            onChange={setChoice}
            canAdd={false}
            onEdit={
              choice?.kind === "ledger" && choice.ledger.party
                ? () => setEditing((on) => !on)
                : undefined
            }
            placeholder={tc("hints.from")}
          />
          {editing && choice?.kind === "ledger" && choice.ledger.party && (
            <PartyEditor
              asksTypes
              ledger={choice.ledger}
              setLedger={(ledger) => setChoice({ kind: "ledger", ledger })}
              close={() => setEditing(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// the Amount card, as a payment's. A salary: where it's paid from (a bank card per place, as a payment's), the meter
// over them saying what's left to pay, so no total above them. An advance: what they still owe, then the amount on the
// left and where it's paid from on the right
export function AmountCard() {
  const { t, kind, employee } = useSalaryEntry();
  if (kind === "salary") return <SalaryCards />;
  return (
    <div className="flex flex-col gap-4">
      {/* what they still owe, then the amount: rows as a payment's, as wide as its left side */}
      <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
        {(employee?.advanceLeft ?? 0) > 0 && (
          <div className="tabular mb-2 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">{t("advanceLeft")}</span>
            <span className="shrink-0 whitespace-nowrap text-base font-semibold">
              {rupees(employee!.advanceLeft)}
            </span>
          </div>
        )}
        <AdvanceAmount />
      </div>
      {/* where it's paid from: one card, as a payment's, the meter over it; a faint line above */}
      <div className="border-t border-chestnut/15 pt-4">
        <SalaryCards />
      </div>
    </div>
  );
}

// an advance's amount, never more than the place it's paid from holds
function AdvanceAmount() {
  const { tc, amount, setAmount, value, most, setCapped, capText, tried } = useSalaryEntry();
  return (
    <>
      {/* the amount as a payment's: its name on the left, its box on the right with what's typed at its right end */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <label htmlFor="amount-field" className="min-w-0 text-sm">
          {tc("q.amount")}
          <RequiredMark />
        </label>
        <div className="w-[60%] shrink-0 [&_input]:text-right">
          <MicField onText={(said) => saidAmount(said, setAmount)}>
            <IndianRupee
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2"
              aria-hidden
            />
            <NumberInput
              id="amount-field"
              value={amount}
              onChange={(v) => {
                setCapped(null);
                setAmount(v);
              }}
              onCapped={setCapped}
              decimals={2}
              maxDigits={13}
              max={most ?? undefined}
              placeholder="0"
              aria-invalid={(tried && value === 0) || undefined}
              className={cn(
                input(tried && value === 0),
                "min-h-12 pl-11 pr-12 font-heading text-xl font-bold tabular",
              )}
            />
          </MicField>
        </div>
      </div>
      {capText && (
        <FieldMessage tone="warning" className="ml-auto mt-0 w-[60%]">
          {capText}
        </FieldMessage>
      )}
    </>
  );
}
