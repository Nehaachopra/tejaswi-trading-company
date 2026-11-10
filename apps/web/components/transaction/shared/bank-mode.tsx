"use client";

import { useTranslations } from "next-intl";

import { FieldMessage } from "~/components/ui/field-message";
import { RequiredMark } from "~/components/ui/required-mark";
import { cn } from "~/lib/utils";
import { BANK_MODE_REFERENCE, type BankMode } from "@repo/trpc/client";

import { chip, input } from "./form-basics";
import { PlacePicker } from "./place-picker";

// how money went out of or came into a bank, in the order they're offered
export const BANK_MODES: BankMode[] = ["upi", "imps", "neftRtgs", "cheque"];

// a reference's longest, and whether it's digits only: a UPI UTR or IMPS reference is 12 digits, a cheque 6, a NEFT or
// RTGS UTR 16 to 22 letters and digits
export const refMost = (mode: BankMode) => (mode === "neftRtgs" ? 22 : mode === "cheque" ? 6 : 12);
export const refOkFor = (mode: BankMode, text: string) =>
  text === "" || BANK_MODE_REFERENCE[mode].test(text);

// how it was paid or received: a grid of chips, two to a row; red once Next was tapped with none picked
export function ModeChips({
  label,
  missing,
  mode,
  tried,
  onPick,
}: {
  label: string;
  missing: string;
  mode: BankMode | null;
  tried: boolean;
  onPick: (m: BankMode) => void;
}) {
  const t = useTranslations("transactions.payment.form");
  return (
    <>
      <span>
        {label}
        <RequiredMark />
      </span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {BANK_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onPick(m)}
            className={cn(chip(mode === m), tried && mode === null && "border-danger")}
          >
            {t(`modes.${m}`)}
          </button>
        ))}
      </div>
      {tried && mode === null && <FieldMessage className="mt-0">{missing}</FieldMessage>}
    </>
  );
}

// how it was paid, as an accordion like Paid from's (a payment's, for now): all four open as rows until one is
// picked, then collapsed to the pick; a tap opens them again. Red-edged once Next was tapped with none picked
export function ModeAccordion({
  label,
  missing,
  mode,
  tried,
  onPick,
}: {
  label: string;
  missing: string;
  mode: BankMode | null;
  tried: boolean;
  onPick: (m: BankMode) => void;
}) {
  const t = useTranslations("transactions.payment.form");
  return (
    <>
      <span>
        {label}
        <RequiredMark />
      </span>
      <PlacePicker
        label={label}
        places={BANK_MODES.map((m) => ({ id: m, name: t(`modes.${m}`), disabled: false }))}
        value={mode}
        invalid={tried}
        onPick={onPick}
      />
      {tried && mode === null && <FieldMessage className="mt-0">{missing}</FieldMessage>}
    </>
  );
}

// a bank account's UTR or cheque number, shaped as its mode has it: digits only, or letters and digits for NEFT/RTGS.
// Which account it's for shows beside its name when there's more than one; what's wrong shows once it's left, Save is
// tapped, or it's typed to its longest
export function BankRefField({
  mode,
  text,
  onText,
  left,
  onLeave,
  tried,
  account,
}: {
  mode: BankMode;
  text: string;
  onText: (text: string) => void;
  left: boolean;
  onLeave: () => void;
  tried: boolean;
  account?: string;
}) {
  const t = useTranslations("transactions.payment.form");
  const digits = mode !== "neftRtgs";
  const most = refMost(mode);
  const bad = !refOkFor(mode, text) && (tried || left || text.length === most);
  return (
    <label className="flex flex-col gap-2.5 text-xs font-semibold">
      <span className="flex justify-between gap-3">
        <span>{t(`refLabel.${mode}`)}</span>
        {account && <span className="font-normal opacity-70">{account}</span>}
      </span>
      <input
        value={text}
        maxLength={most}
        inputMode={digits ? "numeric" : "text"}
        autoCapitalize="characters"
        placeholder={t(`refHint.${mode}`)}
        onChange={(e) => {
          const v = digits
            ? e.target.value.replace(/\D/g, "")
            : e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase();
          onText(v.slice(0, most));
        }}
        onBlur={onLeave}
        aria-invalid={bad || undefined}
        className={cn(input(bad), "tabular")}
      />
      {bad && <FieldMessage className="mt-0">{t(`refBad.${mode}`)}</FieldMessage>}
    </label>
  );
}

// the cash part's own reference, a bill or voucher number: letters, digits, - and /, in capitals
export function CashRefField({
  value,
  onChange,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  const t = useTranslations("transactions.payment.form");
  return (
    <label className="flex flex-col gap-2.5 text-xs font-semibold">
      {t("refCash")}
      <input
        value={value}
        maxLength={max}
        autoCapitalize="characters"
        placeholder={t("refCashHint")}
        onChange={(e) =>
          onChange(
            e.target.value
              .replace(/[^0-9a-z/-]/gi, "")
              .toUpperCase()
              .slice(0, max),
          )
        }
        className={cn(input(false), "tabular")}
      />
    </label>
  );
}

// something the server couldn't answer, even after the retries: what, in red, and Try again beside it
export function FailNote({ text, retry }: { text: string; retry: () => void }) {
  const t = useTranslations("transactions.payment.form");
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <FieldMessage className="mt-0">{text}</FieldMessage>
      <button
        type="button"
        onClick={retry}
        className="min-h-9 text-sm font-semibold underline underline-offset-2"
      >
        {t("tryAgain")}
      </button>
    </div>
  );
}
