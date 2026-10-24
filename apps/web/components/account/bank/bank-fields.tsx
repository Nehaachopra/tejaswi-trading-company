"use client";

import { Lock, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "@repo/trpc/client";

import { PickMenu } from "../../stock/pick-menu";
import { BANKS } from "./bank-list";

export type BankAccount = RouterOutputs["accounts"]["bank"]["get"];

const TYPES = ["savings", "current", "cash_credit", "overdraft"] as const;
type AccountType = (typeof TYPES)[number];

const PROVIDERS = ["phonepe", "gpay", "paytm", "bhim", "amazon_pay", "other"] as const;
type Provider = (typeof PROVIDERS)[number];

// lengths follow bank_details: holder 255, bank and branch 100, account number 9 to 18 digits, IFSC 11, UPI 255;
// at most 10 UPI IDs
const HOLDER_MAX = 255;
const NAME_MAX = 100;
const UPI_MAX = 255;
const UPI_COUNT = 10;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^\d{9,18}$/;
const UPI = /^[\w.-]+@[\w.-]+$/;
// the bank picked as "Other", typed by hand
const OTHER = "__other";

type UpiDraft = { key: string; upiId: string; provider: Provider | null };

// a bank account as typed. With an IFSC the directory names the bank and branch (and they're locked); without
// one the bank is picked from the list (or typed, as Other) and the branch typed. The account number is typed
// twice when it's new or changed
export type BankDraft = {
  ifscCode: string;
  bankName: string;
  bankOther: boolean;
  branchName: string;
  accountNumber: string;
  accountNumberAgain: string;
  savedAccountNumber: string | null;
  accountHolderName: string;
  accountType: AccountType | null;
  upiIds: UpiDraft[];
};

let keys = 0;
const newKey = () => `upi-${++keys}`;

export const emptyDraft = (): BankDraft => ({
  ifscCode: "",
  bankName: "",
  bankOther: false,
  branchName: "",
  accountNumber: "",
  accountNumberAgain: "",
  savedAccountNumber: null,
  accountHolderName: "",
  accountType: null,
  upiIds: [],
});

// the saved account as a draft; names are stored in lowercase and read with capitals
export const draftFrom = (b: BankAccount): BankDraft => {
  const bankName = titleCase(b.bankName);
  return {
    ifscCode: b.ifscCode ?? "",
    bankName,
    bankOther: !b.ifscCode && !BANKS.some((n) => n.toLowerCase() === b.bankName),
    branchName: titleCase(b.branchName),
    accountNumber: b.accountNumber,
    accountNumberAgain: "",
    savedAccountNumber: b.accountNumber,
    accountHolderName: titleCase(b.accountHolderName),
    accountType: b.accountType,
    upiIds: b.upiIds.map((u) => ({ key: newKey(), upiId: u.upiId, provider: u.provider })),
  };
};

// the account number has to be typed twice when it's new or has changed
const needsAgain = (d: BankDraft) => d.accountNumber !== d.savedAccountNumber;

// what's missing or wrong, field by field (blank UPI rows are left out)
export function draftProblems(d: BankDraft) {
  const upis = d.upiIds.filter((u) => u.upiId.trim() !== "");
  const ids = upis.map((u) => u.upiId.trim().toLowerCase());
  return {
    ifscCode: d.ifscCode !== "" && !IFSC.test(d.ifscCode),
    bankName: d.bankName.trim() === "",
    branchName: d.branchName.trim() === "",
    accountNumber: !ACCOUNT.test(d.accountNumber),
    accountNumberAgain: needsAgain(d) && d.accountNumberAgain !== d.accountNumber,
    accountHolderName: d.accountHolderName.trim() === "",
    accountType: d.accountType === null,
    upiIds: upis.some((u) => !UPI.test(u.upiId.trim()) || u.provider === null) || new Set(ids).size !== ids.length,
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
      upiIds: d.upiIds.filter((u) => u.upiId.trim() !== "").map((u) => ({ upiId: u.upiId.trim(), provider: u.provider! })),
    },
  };
}

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// a locked value, filled in from the IFSC
const locked = "flex min-h-11 w-full min-w-0 items-center gap-2 rounded-control border border-chestnut/30 px-3 text-base";

// the bank and branch behind an IFSC, from Razorpay's free IFSC directory (no key)
type Lookup = { state: "idle" | "looking" | "missing" } | { state: "found"; bank: string; branch: string };

// the fields: IFSC (optional) first, which fills in and locks the bank and branch; without it, the bank from the
// list and the branch typed. Then the account number (twice when new or changed), holder, type and UPI IDs with
// their apps; its opening balance is set on the Opening balances page
export function BankFields({ draft, onChange, tried }: { draft: BankDraft; onChange: (patch: Partial<BankDraft>) => void; tried: boolean }) {
  const t = useTranslations("accounts.bank.form");
  const bad = draftProblems(draft);
  const show = (field: keyof typeof bad) => tried && bad[field];
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const fromIfsc = lookup.state === "found";

  // look the IFSC up once it's complete; what it finds is the bank and branch
  useEffect(() => {
    if (!IFSC.test(draft.ifscCode)) return setLookup({ state: "idle" });
    const controller = new AbortController();
    setLookup({ state: "looking" });
    fetch(`https://ifsc.razorpay.com/${draft.ifscCode}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ BANK?: string; BRANCH?: string }>) : null))
      .then((found) => {
        if (!found?.BANK) return setLookup({ state: "missing" });
        // the directory writes branches in capitals ("BANGALORE"): read as "Bangalore"
        const bank = titleCase(found.BANK.toLowerCase()).slice(0, NAME_MAX);
        const branch = titleCase((found.BRANCH ?? "").toLowerCase()).slice(0, NAME_MAX);
        setLookup({ state: "found", bank, branch });
        onChangeRef.current({ bankName: bank, branchName: branch, bankOther: false });
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setLookup({ state: "missing" });
      });
    return () => controller.abort();
  }, [draft.ifscCode]);

  const setUpi = (key: string, patch: Partial<UpiDraft>) => onChange({ upiIds: draft.upiIds.map((u) => (u.key === key ? { ...u, ...patch } : u)) });
  const listed = BANKS.find((n) => n.toLowerCase() === draft.bankName.trim().toLowerCase());

  return (
    <div className="flex flex-col gap-5">
      {/* IFSC (optional), with what it found */}
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
          <span className="flex items-center gap-2 text-xs">
            <Spinner className="size-3.5" /> {t("lookingUp")}
          </span>
        )}
        {lookup.state === "missing" && <span className="text-xs">{t("notFound")}</span>}
        {lookup.state === "idle" && draft.ifscCode === "" && <span className="text-xs">{t("ifscHint")}</span>}
      </label>

      {/* bank and branch: locked to the IFSC when it found them, otherwise picked and typed */}
      {fromIfsc ? (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">{t("bankName")}</span>
            <p className={locked}>
              <Lock className="size-4 shrink-0" aria-hidden /> <span className="truncate">{draft.bankName}</span>
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">{t("branch")}</span>
            <p className={locked}>
              <Lock className="size-4 shrink-0" aria-hidden /> <span className="truncate">{draft.branchName}</span>
            </p>
          </div>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">{t("bankName")}</span>
            <PickMenu
              label={t("bankName")}
              current={draft.bankOther ? t("otherBank") : (listed ?? t("pickBank"))}
              options={[...BANKS.map((n) => ({ id: n as string, name: n })), { id: OTHER, name: t("otherBank") }]}
              picked={draft.bankOther ? OTHER : (listed ?? "")}
              onPick={(id) => onChange(id === OTHER ? { bankOther: true, bankName: "" } : { bankOther: false, bankName: id })}
              invalid={show("bankName") && !draft.bankOther}
            />
          </label>
          {draft.bankOther && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm">{t("otherBankName")}</span>
              <input value={draft.bankName} maxLength={NAME_MAX} onChange={(e) => onChange({ bankName: e.target.value })} aria-invalid={show("bankName") || undefined} className={input(show("bankName"))} />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">{t("branch")}</span>
            <input value={draft.branchName} maxLength={NAME_MAX} onChange={(e) => onChange({ branchName: e.target.value })} aria-invalid={show("branchName") || undefined} className={input(show("branchName"))} />
          </label>
        </>
      )}

      {/* the account number, typed twice when it's new or changed */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("accountNumber")}</span>
        <input
          value={draft.accountNumber}
          maxLength={18}
          inputMode="numeric"
          autoComplete="off"
          onChange={(e) => onChange({ accountNumber: e.target.value.replace(/\D/g, "") })}
          aria-invalid={show("accountNumber") || undefined}
          className={cn(input(show("accountNumber")), "tabular")}
        />
        {show("accountNumber") && <span className="text-xs text-danger">{t("accountNumberHint")}</span>}
      </label>
      {needsAgain(draft) && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm">{t("accountNumberAgain")}</span>
          <input
            value={draft.accountNumberAgain}
            maxLength={18}
            inputMode="numeric"
            autoComplete="off"
            onPaste={(e) => e.preventDefault()}
            onChange={(e) => onChange({ accountNumberAgain: e.target.value.replace(/\D/g, "") })}
            aria-invalid={show("accountNumberAgain") || undefined}
            className={cn(input(show("accountNumberAgain")), "tabular")}
          />
          {show("accountNumberAgain") && <span className="text-xs text-danger">{t("accountNumberMismatch")}</span>}
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("holder")}</span>
        <input
          value={draft.accountHolderName}
          maxLength={HOLDER_MAX}
          autoCapitalize="words"
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

      {/* the UPI IDs linked to it, each with the app it's in */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm">{t("upiIds")}</h3>
        {draft.upiIds.map((u) => {
          const wrong = tried && u.upiId.trim() !== "" && (!UPI.test(u.upiId.trim()) || u.provider === null);
          return (
            <div key={u.key} className="flex items-center gap-2">
              <div className="w-32 shrink-0">
                <PickMenu
                  label={t("provider")}
                  current={u.provider ? t(`providers.${u.provider}`) : t("pickApp")}
                  options={PROVIDERS.map((p) => ({ id: p, name: t(`providers.${p}`) }))}
                  picked={u.provider ?? "phonepe"}
                  onPick={(provider) => setUpi(u.key, { provider })}
                  invalid={tried && u.upiId.trim() !== "" && u.provider === null}
                />
              </div>
              <input
                value={u.upiId}
                maxLength={UPI_MAX}
                autoCapitalize="none"
                aria-label={t("upi")}
                onChange={(e) => setUpi(u.key, { upiId: e.target.value.replace(/\s/g, "").toLowerCase() })}
                placeholder="tejaswi@sbi"
                aria-invalid={wrong || undefined}
                className={input(wrong)}
              />
              <button
                type="button"
                onClick={() => onChange({ upiIds: draft.upiIds.filter((x) => x.key !== u.key) })}
                aria-label={t("removeUpi")}
                className="grid size-11 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
        {show("upiIds") && <span className="text-xs text-danger">{t("upiHint")}</span>}
        {draft.upiIds.length < UPI_COUNT && (
          <button
            type="button"
            onClick={() => onChange({ upiIds: [...draft.upiIds, { key: newKey(), upiId: "", provider: null }] })}
            className="flex min-h-11 items-center justify-center gap-2 rounded-control border border-dashed border-chestnut/50 text-sm hover:border-chestnut"
          >
            <Plus className="size-4" aria-hidden /> {t("addUpi")}
          </button>
        )}
      </section>
    </div>
  );
}
