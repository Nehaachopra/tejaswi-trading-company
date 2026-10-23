"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { NumberInput } from "~/components/ui/number-input";
import { titleCase } from "~/lib/format";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "@repo/trpc/client";

import { PickMenu } from "../../stock/pick-menu";
import { indiaDay, startOfIndiaDay } from "../balance";

export type BankAccount = RouterOutputs["accounts"]["bank"]["get"];

const TYPES = ["savings", "current", "cash_credit", "overdraft"] as const;
type AccountType = (typeof TYPES)[number];

// lengths follow bank_details: holder 255, bank and branch 100, account number 30, IFSC 11, UPI 255
const HOLDER_MAX = 255;
const NAME_MAX = 100;
const NUMBER_MAX = 30;
const UPI_MAX = 255;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// a bank account as typed
export type BankDraft = {
  ifscCode: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  accountHolderName: string;
  accountType: AccountType | null;
  upiId: string;
  // the opening balance: blank for none; "we owe the bank" only for cash credit and overdraft
  opening: string;
  openingDate: string;
  owed: boolean;
};

export const emptyDraft = (): BankDraft => ({
  ifscCode: "",
  bankName: "",
  branchName: "",
  accountNumber: "",
  accountHolderName: "",
  accountType: null,
  upiId: "",
  opening: "",
  openingDate: "",
  owed: false,
});

export const draftFrom = (b: BankAccount): BankDraft => ({
  ifscCode: b.ifscCode,
  bankName: b.bankName,
  branchName: b.branchName,
  accountNumber: b.accountNumber,
  accountHolderName: b.accountHolderName,
  accountType: b.accountType,
  upiId: b.upiId ?? "",
  opening: b.openingBalance ? String(b.openingBalance.amount) : "",
  openingDate: b.openingBalance ? indiaDay(b.openingBalance.date) : "",
  owed: b.openingBalance?.side === "credit",
});

// cash credit and overdraft accounts can start owing the bank
const canOwe = (type: AccountType | null) => type === "cash_credit" || type === "overdraft";

// what's missing or wrong, field by field
export function draftProblems(d: BankDraft) {
  const hasOpening = d.opening.trim() !== "" && Number(d.opening) > 0;
  return {
    ifscCode: !IFSC.test(d.ifscCode),
    bankName: d.bankName.trim() === "",
    branchName: d.branchName.trim() === "",
    accountNumber: !/^[0-9A-Z]{6,30}$/.test(d.accountNumber),
    accountHolderName: d.accountHolderName.trim() === "",
    accountType: d.accountType === null,
    upiId: !/^$|^[\w.-]+@[\w.-]+$/.test(d.upiId.trim()),
    openingDate: hasOpening && d.openingDate === "",
  };
}

export const draftOk = (d: BankDraft) => Object.values(draftProblems(d)).every((bad) => !bad);

// the draft as the API takes it
export function draftInput(d: BankDraft) {
  const amount = Number(d.opening);
  return {
    details: {
      bankName: d.bankName.trim(),
      accountHolderName: d.accountHolderName.trim(),
      branchName: d.branchName.trim(),
      accountNumber: d.accountNumber,
      ifscCode: d.ifscCode,
      accountType: d.accountType!,
      upiId: d.upiId.trim(),
    },
    openingBalance:
      d.opening.trim() !== "" && amount > 0
        ? { amount, side: canOwe(d.accountType) && d.owed ? ("credit" as const) : ("debit" as const), date: startOfIndiaDay(d.openingDate) }
        : null,
  };
}

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// the bank and branch behind an IFSC, from Razorpay's free IFSC directory (no key); null when it isn't listed
type Lookup = { state: "idle" | "looking" | "missing" } | { state: "found"; bank: string; branch: string };

// the fields: IFSC first (it fills in the bank and branch), the account itself, then the opening balance
// (fixed once anything else has been posted to the account)
export function BankFields({
  draft,
  onChange,
  tried,
  openingFixed,
}: {
  draft: BankDraft;
  onChange: (patch: Partial<BankDraft>) => void;
  tried: boolean;
  openingFixed: boolean;
}) {
  const t = useTranslations("accounts.bank.form");
  const bad = draftProblems(draft);
  const show = (field: keyof typeof bad) => tried && bad[field];
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  // what the lookup last filled in, so it only replaces its own suggestion, never what was typed
  const filled = useRef({ bank: draft.bankName, branch: draft.branchName });
  const latest = useRef(draft);
  latest.current = draft;

  // look the IFSC up once it's complete
  useEffect(() => {
    if (!IFSC.test(draft.ifscCode)) return setLookup({ state: "idle" });
    const controller = new AbortController();
    setLookup({ state: "looking" });
    fetch(`https://ifsc.razorpay.com/${draft.ifscCode}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ BANK?: string; BRANCH?: string }>) : null))
      .then((found) => {
        if (!found?.BANK) return setLookup({ state: "missing" });
        // the directory writes branches in capitals ("BANGALORE"): shown as "Bangalore"
        const bank = found.BANK.slice(0, NAME_MAX);
        const branch = titleCase((found.BRANCH ?? "").toLowerCase()).slice(0, NAME_MAX);
        setLookup({ state: "found", bank, branch });
        const d = latest.current;
        const patch: Partial<BankDraft> = {};
        if (d.bankName === "" || d.bankName === filled.current.bank) patch.bankName = bank;
        if (d.branchName === "" || d.branchName === filled.current.branch) patch.branchName = branch;
        filled.current = { bank, branch };
        onChange(patch);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setLookup({ state: "missing" });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the IFSC changes
  }, [draft.ifscCode]);

  const chip = (on: boolean) =>
    cn("min-h-11 flex-1 rounded-control border text-sm transition-colors", on ? "border-chestnut bg-chestnut font-medium text-ivory" : "border-chestnut/60 hover:border-chestnut");

  return (
    <div className="flex flex-col gap-5">
      {/* IFSC, with what it found */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("ifsc")}</span>
        <input
          autoFocus
          value={draft.ifscCode}
          maxLength={11}
          autoCapitalize="characters"
          onChange={(e) => onChange({ ifscCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
          placeholder="SBIN0001234"
          aria-invalid={show("ifscCode") || undefined}
          className={cn(input(show("ifscCode")), "tabular uppercase")}
        />
        {lookup.state === "looking" && (
          <span className="flex items-center gap-2 text-xs text-chestnut/70">
            <Spinner className="size-3.5" /> {t("lookingUp")}
          </span>
        )}
        {lookup.state === "found" && <span className="truncate text-xs text-chestnut/70">{t("found", { bank: lookup.bank, branch: lookup.branch })}</span>}
        {lookup.state === "missing" && <span className="text-xs text-chestnut/70">{t("notFound")}</span>}
      </label>

      {/* bank and branch (filled in from the IFSC, still editable) */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("bankName")}</span>
        <input value={draft.bankName} maxLength={NAME_MAX} onChange={(e) => onChange({ bankName: e.target.value })} aria-invalid={show("bankName") || undefined} className={input(show("bankName"))} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("branch")}</span>
        <input value={draft.branchName} maxLength={NAME_MAX} onChange={(e) => onChange({ branchName: e.target.value })} aria-invalid={show("branchName") || undefined} className={input(show("branchName"))} />
      </label>

      {/* the account */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("accountNumber")}</span>
        <input
          value={draft.accountNumber}
          maxLength={NUMBER_MAX}
          inputMode="numeric"
          onChange={(e) => onChange({ accountNumber: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "") })}
          aria-invalid={show("accountNumber") || undefined}
          className={cn(input(show("accountNumber")), "tabular")}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("holder")}</span>
        <input
          value={draft.accountHolderName}
          maxLength={HOLDER_MAX}
          onChange={(e) => onChange({ accountHolderName: e.target.value })}
          aria-invalid={show("accountHolderName") || undefined}
          className={input(show("accountHolderName"))}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("type")}</span>
        <PickMenu
          label={t("type")}
          current={draft.accountType ? t(`types.${draft.accountType}`) : t("pick")}
          options={TYPES.map((type) => ({ id: type, name: t(`types.${type}`) }))}
          picked={draft.accountType ?? "savings"}
          onPick={(accountType) => onChange({ accountType, owed: canOwe(accountType) && draft.owed })}
          invalid={show("accountType")}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("upi")}</span>
        <input
          value={draft.upiId}
          maxLength={UPI_MAX}
          autoCapitalize="none"
          onChange={(e) => onChange({ upiId: e.target.value.replace(/\s/g, "") })}
          placeholder="tejaswi@sbi"
          aria-invalid={show("upiId") || undefined}
          className={input(show("upiId"))}
        />
      </label>

      {/* the opening balance and its date; fixed once money has moved */}
      <fieldset className="flex flex-col gap-3 rounded-control border border-chestnut/20 p-3" disabled={openingFixed}>
        <legend className="px-1 text-sm">{t("opening")}</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-chestnut/70">{t("amount")}</span>
            <NumberInput value={draft.opening} decimals={2} maxDigits={13} onChange={(v) => onChange({ opening: v })} placeholder="0" className={cn(input(false), "tabular disabled:opacity-60")} />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-chestnut/70">{t("asOn")}</span>
            <input
              type="date"
              value={draft.openingDate}
              onChange={(e) => onChange({ openingDate: e.target.value })}
              aria-invalid={show("openingDate") || undefined}
              className={cn(input(show("openingDate")), "disabled:opacity-60")}
            />
          </label>
        </div>
        {canOwe(draft.accountType) && (
          <div className="flex gap-2">
            {([false, true] as const).map((owed) => (
              <button key={String(owed)} type="button" aria-pressed={draft.owed === owed} onClick={() => onChange({ owed })} className={cn(chip(draft.owed === owed), "disabled:opacity-60")}>
                {t(owed ? "weOwe" : "inBank")}
              </button>
            ))}
          </div>
        )}
        {openingFixed && (
          <p className="flex items-start gap-2 text-xs text-chestnut/70">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("openingFixed")}
          </p>
        )}
      </fieldset>
    </div>
  );
}
