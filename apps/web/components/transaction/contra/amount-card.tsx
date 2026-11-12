"use client";

import { IndianRupee } from "lucide-react";

import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { input, saidAmount } from "../shared/form-basics";
import { PlacePicker } from "../shared/place-picker";
import { useContraEntry } from "./state";

// the Amount card, laid out as a payment's, top to bottom, every value a row (its name on the left, its value or box on
// the right): a deposit's cash in hand, the amount (never more than what it comes out of holds, cut there with a
// warning), then the account it goes into or comes out of (a transfer: the one it leaves, then the
// one it goes into). As wide as a payment's left side
export function AmountCard() {
  const {
    kind,
    t,
    tc,
    amount,
    setAmount,
    setCapped,
    capText,
    value,
    cashHeld: held,
    most,
    tried,
    transfer,
    bank,
    toBank,
  } = useContraEntry();
  // the cash in hand: a deposit's alone (no account's balance is shown: it would only mislead)
  const cashHeld = kind === "deposit" ? held : null;
  return (
    <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
      {/* the cash there is today (the admin only); room under it */}
      {cashHeld !== null && <Plain label={t("cashHeld")} figure={cashHeld} room />}

      {/* the amount: the box on the right, what's typed at its right end */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <label htmlFor="amount-field" className="min-w-0 text-sm">
          {tc("q.amount")}
          <RequiredMark />
        </label>
        {/* chestnut once filled: the money that moves, as a payment's To pay */}
        <div
          className={cn(
            "w-[60%] shrink-0 [&_input]:text-right",
            value > 0 && "[&_button]:text-ivory",
          )}
        >
          <MicField onText={(said) => saidAmount(said, setAmount)}>
            <IndianRupee
              className={cn(
                "pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2",
                value > 0 && "text-ivory",
              )}
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
                value > 0 && "bg-chestnut text-ivory caret-ivory shadow-none",
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

      {/* the account it goes into or comes out of, then (once picked, a transfer's) what it holds; a transfer's To
          account after */}
      <div className="mt-2 flex flex-col gap-2.5 border-t border-chestnut/15 pt-4">
        <PickRow label={t("into")} twoLines={!!bank}>
          <IntoAccount />
        </PickRow>
        {transfer && bank && (
          <>
            <PickRow label={t("toAccount" as "into")} twoLines={!!toBank}>
              <ToAccount />
            </PickRow>
          </>
        )}
      </div>
    </div>
  );
}

// a value that's shown, not typed: its name on the left, the figure on the right; `room` leaves space under it
function Plain({ label, figure, room = false }: { label: string; figure: number; room?: boolean }) {
  return (
    <div
      className={cn(
        "tabular flex min-h-11 items-center justify-between gap-3 text-sm",
        room && "mb-2",
      )}
    >
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 whitespace-nowrap text-base font-semibold">{rupees(figure)}</span>
    </div>
  );
}

// an accordion as a row: its name on the left (level with the first row, or the pick's two lines), the accordion on the
// right, as wide as the amount's box
function PickRow({
  label,
  twoLines,
  children,
}: {
  label: string;
  twoLines: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className={cn("flex min-w-0 items-center text-sm", twoLines ? "min-h-14" : "min-h-12")}>
        {label}
        <RequiredMark />
      </span>
      <div className="w-[60%] shrink-0">{children}</div>
    </div>
  );
}

// the bank account it goes into or comes out of: the payment's accordion, each by name only (no balance: it would only
// mislead), then only the pick, see-through with ▾ at the right edge
function IntoAccount() {
  const { tpf, locale, banks, bankId, setBankId, setAccountsOpen, tried, bank } = useContraEntry();
  return (
    <PlacePicker
      quiet
      bare
      alignEnd
      label={tpf("account")}
      places={(banks ?? []).map((b) => {
        return {
          id: b.id,
          name: bankNameIn(b.bankName, locale),
          sub: `••${b.last4}`,
          disabled: false,
        };
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

// a transfer: the account it goes into, any but the one it leaves, as the one above
function ToAccount() {
  const { tpf, locale, banks, bankId, toBankId, setToBankId, tried, toBank } = useContraEntry();
  return (
    <PlacePicker
      quiet
      bare
      alignEnd
      label={tpf("account")}
      places={(banks ?? [])
        .filter((b) => b.id !== bankId)
        .map((b) => {
          return {
            id: b.id,
            name: bankNameIn(b.bankName, locale),
            sub: `••${b.last4}`,
            disabled: false,
          };
        })}
      value={toBankId}
      onPick={setToBankId}
      invalid={tried && !toBank}
    />
  );
}
