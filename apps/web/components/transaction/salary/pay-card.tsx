"use client";

import { HandCoins, IndianRupee } from "lucide-react";

import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { LedgerSearch } from "../pickers/ledger-picker";
import { AmountBox } from "../shared/amount-box";
import { chip, input, saidAmount } from "../shared/form-basics";
import { PartyEditor } from "../shared/party-editor";
import { PlacePicker } from "../shared/place-picker";
import { BankPaidBy } from "./bank-paid-by";
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
    <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-6">
      <div className="min-w-0 sm:col-start-1">
        <AmountBox icon={HandCoins} label={t("advanceLeft")} amount={employee?.advanceLeft ?? 0} />
      </div>
      <div className="flex min-w-0 flex-col gap-2.5 sm:col-start-1 sm:row-start-2">
        <AdvanceAmount />
      </div>
      <div className="flex min-w-0 flex-col gap-2.5 sm:col-start-2 sm:row-start-2">
        <PaidFrom />
      </div>
    </div>
  );
}

// an advance's amount, never more than the place it's paid from holds
function AdvanceAmount() {
  const { tc, amount, setAmount, value, most, setCapped, capText, tried } = useSalaryEntry();
  const filled = value > 0;
  return (
    <>
      <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
        <span>
          {tc("q.amount")}
          <RequiredMark />
        </span>
        {/* a chestnut fill once there's an amount */}
        <div className={filled ? "text-ivory [&_button]:text-ivory" : undefined}>
          <MicField onText={(said) => saidAmount(said, setAmount)}>
            <IndianRupee
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
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
                "min-h-14 pl-10 pr-11 font-heading text-2xl font-bold",
                filled && "bg-chestnut text-ivory caret-ivory",
              )}
            />
          </MicField>
        </div>
      </label>
      {capText && <FieldMessage className="mt-0">{capText}</FieldMessage>}
    </>
  );
}

// where it's paid from: Cash or Bank, each with what it holds (the admin only), then the bank account, both accordions
function PaidFrom() {
  const {
    t,
    tc,
    tpf,
    locale,
    banks,
    from,
    setFrom,
    bankId,
    setBankId,
    bank,
    cashHeld,
    bankHeld,
    tried,
  } = useSalaryEntry();
  const held = (banks ?? []).map((b) => bankHeld(b.id));
  const banksHeld =
    held.length > 0 && held.every((h) => h !== null)
      ? held.reduce<number>((s, h) => s + (h ?? 0), 0)
      : null;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <h3 className="text-xs font-semibold">
        {t("from")}
        <RequiredMark />
      </h3>
      <PlacePicker
        label={t("from")}
        places={[
          {
            id: "cash" as const,
            name: tc("cash"),
            hint: cashHeld === null ? undefined : rupees(cashHeld),
            disabled: false,
          },
          {
            id: "bank" as const,
            name: tpf("bankPlace"),
            hint: banksHeld === null ? undefined : rupees(banksHeld),
            disabled: (banks ?? []).length === 0,
          },
        ]}
        value={from}
        onPick={setFrom}
        invalid={tried && from === null}
      />
      {from === "bank" && (
        <PlacePicker
          label={tpf("account")}
          places={(banks ?? []).map((b) => {
            const h = bankHeld(b.id);
            return {
              id: b.id,
              name: bankNameIn(b.bankName, locale),
              sub: `••${b.last4}`,
              hint: h === null ? undefined : rupees(h),
              disabled: false,
            };
          })}
          value={bankId}
          onPick={setBankId}
          invalid={tried && !bank}
        />
      )}
      {from === "bank" && bankId && <BankPaidBy bankId={bankId} />}
    </div>
  );
}
