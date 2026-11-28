"use client";

import { IndianRupee } from "lucide-react";

import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { input } from "../shared/form-basics";
import { PlacePicker } from "../shared/place-picker";
import { useDrawingEntry } from "./state";

// the Amount card, as a withdrawal's: the amount (never more than where it's taken from holds, cut there with a
// warning), then Taken from: cash or one of the bank accounts, each with what it holds, all open until one is picked.
// As wide as a payment's left side
export function AmountCard() {
  const { t, tc, amount, setAmount, setCapped, capText, value, most, tried } = useDrawingEntry();
  return (
    <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
      {/* the amount: the box on the right, what's typed at its right end */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <label htmlFor="amount-field" className="min-w-0 text-sm">
          {tc("q.amount")}
          <RequiredMark />
        </label>
        {/* always chestnut: the money that moves, filled or not */}
        <div className="w-[60%] shrink-0 [&_button]:text-ivory [&_input]:text-right">
          <div className="relative">
            <IndianRupee
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2 text-ivory"
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
                "min-h-12 pl-11 pr-3.5 font-heading text-xl font-bold tabular",
                "bg-chestnut text-ivory caret-ivory shadow-none placeholder:text-ivory/60",
              )}
            />
          </div>
        </div>
      </div>
      {capText && (
        <FieldMessage tone="warning" className="ml-auto mt-0 w-[60%]">
          {capText}
        </FieldMessage>
      )}

      {/* where it's taken from: its name on the left, the accordion on the right */}
      <div className="mt-2 flex min-w-0 items-start justify-between gap-3 border-t border-chestnut/15 pt-4">
        <span className="flex min-h-12 min-w-0 items-center text-sm">
          {t("takenFrom")}
          <RequiredMark />
        </span>
        <div className="w-[60%] shrink-0">
          <TakenFrom />
        </div>
      </div>
    </div>
  );
}

// cash, then each bank account, each with what it holds; one holding nothing can't be picked
function TakenFrom() {
  const { tc, tpf, locale, banks, from, setFrom, heldIn, tried } = useDrawingEntry();
  const cashHeld = heldIn("cash");
  return (
    <PlacePicker
      quiet
      bare
      alignEnd
      label={tpf("account")}
      places={[
        { id: "cash", name: tc("cash"), hint: cashHeld === null ? undefined : rupees(cashHeld), disabled: cashHeld !== null && cashHeld <= 0 },
        ...(banks ?? []).map((b) => {
          const held = heldIn(b.id);
          return {
            id: b.id,
            name: bankNameIn(b.bankName, locale),
            sub: `••${b.last4}`,
            hint: held === null ? undefined : rupees(held),
            disabled: held !== null && held <= 0,
          };
        }),
      ]}
      value={from}
      onPick={setFrom}
      invalid={tried && from === null}
    />
  );
}
