"use client";

import { IndianRupee } from "lucide-react";
import { useTranslations } from "next-intl";

import { PickMenu } from "~/components/stock/pick-menu";
import { MicField } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";

import { signed } from "../../account/balance";
import { chip, input, saidAmount } from "../shared/form-basics";
import { type NewLedger, useOtherEntry } from "./state";

// the Entry card, laid out like a receipt's Amount card: on a phone one column; on a wider screen the amount on the
// left, and the ledger debited and the one credited on the right, one under the other
export function EntryCard() {
  const { t, tc, amount, setAmount, value, tried, debitId, setDebitId, creditId, setCreditId, debit, credit, debitDone, newDebit, setNewDebit, newCredit, setNewCredit } =
    useOtherEntry();
  const filled = value > 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-6">
      <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
        <span>
          {tc("q.amount")}
          <RequiredMark />
        </span>
        {/* a chestnut fill once there's an amount */}
        <div className={filled ? "text-ivory [&_button]:text-ivory" : undefined}>
          <MicField onText={(said) => saidAmount(said, setAmount)}>
            <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2" aria-hidden />
            <NumberInput
              id="amount-field"
              value={amount}
              onChange={setAmount}
              decimals={2}
              maxDigits={13}
              placeholder="0"
              aria-invalid={(tried && value === 0) || undefined}
              className={cn(input(tried && value === 0), "min-h-14 pl-10 pr-11 font-heading text-2xl font-bold", filled && "bg-chestnut text-ivory caret-ivory")}
            />
          </MicField>
        </div>
      </label>

      {/* the ledger debited, then (once it's picked, or a new one has its name and head) the one credited, any but the
          debited one */}
      <div className="flex min-w-0 flex-col gap-4">
        <LedgerPick label={t("debit")} value={debitId} onPick={setDebitId} made={newDebit} onMade={setNewDebit} invalid={tried && !debit} />
        {debitDone && (
        <LedgerPick
          label={t("credit")}
          value={creditId}
          onPick={setCreditId}
          made={newCredit}
          onMade={setNewCredit}
          invalid={tried && !credit}
          except={debitId}
        />
        )}
      </div>
    </div>
  );
}

// the six heads a new ledger can sit under (one under Profit or Loss counts in the worked-out result)
const HEADS = ["asset", "liability", "income", "expense", "profit", "loss"] as const;

// a new ledger's name: letters, digits, spaces and & . - ( ) / only, up to 150 (ledgers.name)
const ledgerName = (raw: string) => raw.replace(/[^\p{L}\p{N} &.\-()/]/gu, "").replace(/\s{2,}/g, " ").slice(0, 150);

// a ledger an entry can use: found by searching (its name, its head under it, its balance on the right), or, as a
// payment adds someone new, + New ledger as the list's last row: the dropdown stays (saying New ledger), with the name
// and the head it sits under below it; picking an existing one from the dropdown drops the new one
function LedgerPick({
  label,
  value,
  onPick,
  made,
  onMade,
  invalid,
  except = null,
}: {
  label: string;
  value: string | null;
  onPick: (id: string | null) => void;
  made: NewLedger | null;
  onMade: (made: NewLedger | null) => void;
  invalid: boolean;
  except?: string | null;
}) {
  const { t, nameOf, ledgers, tried } = useOtherEntry();
  const th = useTranslations("accounts.overview.heads");
  const picked = ledgers?.find((l) => l.id === value);

  const nameBad = tried && !!made && made.name.trim() === "";
  return (
    <div className="flex flex-col gap-2.5 text-xs font-semibold">
      <span>
        {label}
        <RequiredMark />
      </span>
      <PickMenu<string>
        searchable
        moneyHints
        label={label}
        searchLabel={t("searchLedger")}
        noMatch={t("noLedger")}
        current={picked && !made ? nameOf(picked) : made ? t("addLedger") : t("pickLedger")}
        currentSub={picked && !made ? th(picked.head) : undefined}
        options={(ledgers ?? [])
          .filter((l) => l.id !== except)
          .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
          .map((l) => ({ id: l.id, name: nameOf(l), sub: th(l.head), hint: signed(l.balance.today, l.head).text }))}
        picked={value ?? ""}
        // an existing one picked: any new one being made is dropped
        onPick={(id) => {
          onMade(null);
          onPick(id);
        }}
        // something new, as a payment's list has it: + New ledger, the list's last row
        addLabel={t("addLedger")}
        onAdd={() => {
          onPick(null);
          onMade({ name: "", head: null });
        }}
        invalid={invalid}
        matchWidth
        inFlow
        className={cn("min-h-14 text-base font-semibold", picked || made ? "bg-chestnut text-ivory" : "bg-ivory text-chestnut")}
      />
      {/* a new ledger: its name, then the head it sits under, under the dropdown */}
      {made && (
        <>
          <input
            autoFocus
            value={made.name}
            maxLength={150}
            placeholder={t("ledgerName")}
            onChange={(e) => onMade({ ...made, name: ledgerName(e.target.value) })}
            aria-invalid={nameBad || undefined}
            className={input(nameBad)}
          />
          <div role="radiogroup" aria-label={t("head")} className="flex flex-wrap gap-2">
            {HEADS.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={made.head === h}
                onClick={() => onMade({ ...made, head: h })}
                className={cn(chip(made.head === h), tried && !made.head && "border-danger")}
              >
                {th(h)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
