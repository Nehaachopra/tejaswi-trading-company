"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { titleCase } from "~/lib/format";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "@repo/trpc/client";

import { PickMenu } from "../../stock/pick-menu";

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
};

export const emptyDraft = (): BankDraft => ({
  ifscCode: "",
  bankName: "",
  branchName: "",
  accountNumber: "",
  accountHolderName: "",
  accountType: null,
  upiId: "",
});

export const draftFrom = (b: BankAccount): BankDraft => ({
  ifscCode: b.ifscCode,
  bankName: b.bankName,
  branchName: b.branchName,
  accountNumber: b.accountNumber,
  accountHolderName: b.accountHolderName,
  accountType: b.accountType,
  upiId: b.upiId ?? "",
});

// what's missing or wrong, field by field
export function draftProblems(d: BankDraft) {
  return {
    ifscCode: !IFSC.test(d.ifscCode),
    bankName: d.bankName.trim() === "",
    branchName: d.branchName.trim() === "",
    accountNumber: !/^[0-9A-Z]{6,30}$/.test(d.accountNumber),
    accountHolderName: d.accountHolderName.trim() === "",
    accountType: d.accountType === null,
    upiId: !/^$|^[\w.-]+@[\w.-]+$/.test(d.upiId.trim()),
  };
}

export const draftOk = (d: BankDraft) => Object.values(draftProblems(d)).every((bad) => !bad);

// the draft as the API takes it
export function draftInput(d: BankDraft) {
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
  };
}

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// the bank and branch behind an IFSC, from Razorpay's free IFSC directory (no key); null when it isn't listed
type Lookup = { state: "idle" | "looking" | "missing" } | { state: "found"; bank: string; branch: string };

// the fields: IFSC first (it fills in the bank and branch), then the account itself; its opening balance is set
// on the Opening balances page
export function BankFields({
  draft,
  onChange,
  tried,
}: {
  draft: BankDraft;
  onChange: (patch: Partial<BankDraft>) => void;
  tried: boolean;
}) {
  const t = useTranslations("accounts.bank.form");
  const bad = draftProblems(draft);
  const show = (field: keyof typeof bad) => tried && bad[field];
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  // what the lookup last filled in, so it only fills empty fields or replaces its own suggestion, never what was
  // typed or saved
  const filled = useRef({ bank: "", branch: "" });
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
          onPick={(accountType) => onChange({ accountType })}
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

    </div>
  );
}
