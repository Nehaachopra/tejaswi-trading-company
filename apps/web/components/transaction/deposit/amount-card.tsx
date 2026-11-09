"use client";

import { PlacePicker } from "../shared/place-picker";
import { Banknote, IndianRupee } from "lucide-react";

import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { AmountBox } from "../shared/amount-box";
import { input, saidAmount } from "../shared/form-basics";
import { useDepositEntry } from "./state";

// the Amount card, laid out like a receipt's: on a phone one column; on a wider screen the cash in hand and the amount
// (never more than the cash, cut there with a warning) on the left, and the account it goes into on the right
export function AmountCard() {
  const { t, tc, amount, setAmount, setCapped, capText, value, cashHeld, tried } = useDepositEntry();
  const filled = value > 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-6">
      {/* the due (or cash in hand) in a row of its own on top; under it the amount on the left and where the money goes
          on the right, both starting level. One column on a phone */}
      {/* the cash there is today (the admin only), in a box: label left, amount right */}
      {cashHeld !== null && (
        <div className="min-w-0 sm:col-start-1">
          <AmountBox icon={Banknote} label={t("cashHeld")} amount={cashHeld} />
        </div>
      )}
      <div className={cn("flex min-w-0 flex-col gap-2.5", cashHeld !== null && "sm:col-start-1 sm:row-start-2")}>
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
                onChange={(v) => {
                  setCapped(null);
                  setAmount(v);
                }}
                onCapped={setCapped}
                decimals={2}
                maxDigits={13}
                max={cashHeld ?? undefined}
                placeholder="0"
                aria-invalid={(tried && value === 0) || undefined}
                className={cn(input(tried && value === 0), "min-h-14 pl-10 pr-11 font-heading text-2xl font-bold", filled && "bg-chestnut text-ivory caret-ivory")}
              />
            </MicField>
          </div>
        </label>
        {capText && <FieldMessage className="mt-0">{capText}</FieldMessage>}
      </div>

      {/* the account it goes into, in this same card */}
      <div className={cn("flex min-w-0 flex-col gap-2.5", cashHeld !== null && "sm:col-start-2 sm:row-start-2")}>
        <h3 className="text-xs font-semibold">
          {t("into")}
          <RequiredMark />
        </h3>
        <IntoAccount />
      </div>
    </div>
  );
}

// the bank account it goes into: each active one with what it holds (the admin only), as on a receipt
function IntoAccount() {
  const { tpf, locale, banks, bankId, setBankId, setAccountsOpen, tried, bank, bankHeld } = useDepositEntry();
  return (
    <PlacePicker
          label={tpf("account")}
          places={(banks ?? []).map((b) => {
            const h = bankHeld(b.id);
            return { id: b.id, name: bankNameIn(b.bankName, locale), sub: `••${b.last4}`, hint: h === null ? undefined : rupees(h), disabled: false };
          })}
          value={bankId ?? null}
          onPick={(id) => {
        setAccountsOpen(0);
        setBankId(id);
      }}
          invalid={tried && !bank}
        />
  );
}
