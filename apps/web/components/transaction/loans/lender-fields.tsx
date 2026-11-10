"use client";

import { Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { MicButton } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import {
  ADD_ON_IVORY,
  PICK_LIST,
  PICK_NEW,
  PICK_ROW,
  PICK_SEARCH,
  PICK_TWO_COLUMNS,
} from "~/components/ui/page-styles";
import { PickedCard } from "../shared/picked-card";
import { RequiredMark } from "~/components/ui/required-mark";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { BANKS } from "../../account/bank/bank-list";
import { PickMenu } from "../../stock/pick-menu";

type Lender = RouterOutputs["accounts"]["lender"]["list"][number];
export type BankLender = "bank" | "nbfc";

const NAME_MAX = 150;
const BRANCH_MAX = 100;
const ACCOUNT_MAX = 30;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const ACCOUNT_RE = /^[A-Z0-9/-]+$/;

// a bank or NBFC's loan as typed: the lender, one picked or a new one, and the loan's account there
export type LenderDraft = {
  picked: Lender | null;
  adding: boolean;
  name: string;
  branch: string;
  pan: string;
  account: string;
  emi: string;
};

export const emptyLender = (): LenderDraft => ({
  picked: null,
  adding: false,
  name: "",
  branch: "",
  pan: "",
  account: "",
  emi: "",
});

export const lenderLabel = (l: { name: string; branch: string | null }) =>
  [l.name, l.branch].filter(Boolean).join(" · ");

const panBad = (d: LenderDraft) => d.pan !== "" && !PAN_RE.test(d.pan);

// someone is named, and nothing typed for them is wrong
export const lenderChosen = (d: LenderDraft) =>
  d.picked !== null || (d.adding && d.name.trim() !== "" && !panBad(d));

export const lenderOk = (d: LenderDraft) => lenderChosen(d) && ACCOUNT_RE.test(d.account);

// as the API takes it
export const lenderInput = (d: LenderDraft, type: BankLender) => ({
  lenderId: d.picked?.id ?? null,
  newLender: d.picked ? null : { name: d.name.trim(), branch: d.branch.trim(), type, pan: d.pan },
  loanAccountNumber: d.account,
  emiAmount: Number(d.emi) > 0 ? Number(d.emi) : null,
});

const input = (bad: boolean) =>
  `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// a bank's name, from the same list as our bank accounts; one the list doesn't have can be typed into its search
export function BankNamePick({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (name: string) => void;
  invalid: boolean;
}) {
  const t = useTranslations("transactions.lender");
  const tf = useTranslations("accounts.party.form");
  const directory = trpc.accounts.bank.banks.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
  const names: readonly string[] =
    directory.data && directory.data.length > 0 ? directory.data : BANKS;
  return (
    <PickMenu
      label={t("name")}
      current={value || t("pickBank")}
      options={names.map((n) => ({ id: n, name: titleCase(n.toLowerCase()) }))}
      picked={names.find((n) => n.toLowerCase() === value.toLowerCase()) ?? ""}
      onPick={(n) => onChange(titleCase(n.toLowerCase()))}
      invalid={invalid}
      matchWidth
      searchable
      searchLabel={t("searchBank")}
      onTyped={(typed) => onChange(typed.slice(0, NAME_MAX))}
      typedLabel={(text) => tf("useTyped", { text })}
    />
  );
}

// a lender's details changed right where its loan is picked: only what a bank or NBFC has, and never its type
export function LenderEdit({
  lenderId,
  onSaved,
  onCancel,
}: {
  lenderId: string;
  onSaved: (lender: { name: string; branch: string | null }) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("transactions.lender");
  const tc = useTranslations("transactions.chat");
  const tf = useTranslations("accounts.party.form");
  const utils = trpc.useUtils();
  const update = trpc.accounts.lender.update.useMutation();
  const lenders = trpc.accounts.lender.list.useQuery({ includeInactive: true });
  const lender = lenders.data?.find((l) => l.id === lenderId);
  const [edits, setEdits] = useState<{ name?: string; branch?: string; pan?: string }>({});
  const [failed, setFailed] = useState(false);
  if (!lender) return null;
  const name = edits.name ?? lender.name;
  const branch = edits.branch ?? lender.branch ?? "";
  const pan = edits.pan ?? lender.pan ?? "";
  const panWrong = pan !== "" && !PAN_RE.test(pan);

  async function save() {
    if (name.trim() === "" || panWrong) return;
    setFailed(false);
    try {
      const saved = await update.mutateAsync({
        id: lenderId,
        name: name.trim(),
        branch: branch.trim(),
        pan,
      });
      void utils.accounts.lender.invalidate();
      void utils.transactions.due.invalidate();
      onSaved(saved);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2.5 text-xs font-semibold">
          <span>
            {t("name")}
            <RequiredMark />
          </span>
          {lender.type === "bank" ? (
            <BankNamePick
              value={name}
              onChange={(v) => setEdits((e) => ({ ...e, name: v }))}
              invalid={name.trim() === ""}
            />
          ) : (
            <input
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setEdits((all) => ({ ...all, name: e.target.value }))}
              aria-invalid={name.trim() === "" || undefined}
              className={input(name.trim() === "")}
            />
          )}
        </label>
        <label className="flex flex-col gap-2.5 text-xs font-semibold">
          {t("branch")}
          <input
            value={branch}
            maxLength={BRANCH_MAX}
            onChange={(e) => setEdits((all) => ({ ...all, branch: e.target.value }))}
            className={input(false)}
          />
        </label>
      </div>
      {lender.type === "nbfc" && (
        <label className="flex flex-col gap-2.5 text-xs font-semibold sm:w-56">
          {t("pan")}
          <input
            value={pan}
            maxLength={10}
            placeholder="ABCDE1234F"
            onChange={(e) =>
              setEdits((all) => ({
                ...all,
                pan: e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase(),
              }))
            }
            aria-invalid={panWrong || undefined}
            className={cn(input(panWrong && pan.length === 10), "tabular uppercase")}
          />
        </label>
      )}
      {failed && <FieldMessage className="mt-0">{t("saveFailed")}</FieldMessage>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-control border border-chestnut/50 px-5 text-sm font-semibold hover:border-chestnut"
        >
          {tc("oldLoanCancel")}
        </button>
        <button
          type="button"
          data-recheck

          onClick={() => void save()}
          disabled={update.isPending}
          className="min-h-11 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory disabled:opacity-60"
        >
          {tf("saveDetails")}
        </button>
      </div>
    </div>
  );
}

// the lender of a bank or NBFC loan, searched and picked like anyone else on a form, or added with only its name and
// branch (and an NBFC's PAN): no phone, email, short name or address. Then the loan's account there
export function LenderFields({
  type,
  draft,
  onChange,
  tried,
}: {
  type: BankLender;
  draft: LenderDraft;
  onChange: (patch: Partial<LenderDraft>) => void;
  tried: boolean;
}) {
  const t = useTranslations("transactions.lender");
  const tp = useTranslations("transactions.picker");
  const lenders = trpc.accounts.lender.list.useQuery({ includeInactive: false });
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const shown = (lenders.data ?? []).filter(
    (l) => l.type === type && (needle === "" || lenderLabel(l).toLowerCase().includes(needle)),
  );
  const noName = tried && draft.adding && draft.name.trim() === "";
  const noAccount = tried && !ACCOUNT_RE.test(draft.account);

  return (
    <div className="flex flex-col gap-4">
      {/* who: picked, being added, or being searched for */}
      {draft.picked ? (
        <PickedCard oneLine onChange={() => onChange({ picked: null })}>
          <span className="min-w-0 flex-1 truncate font-semibold">{lenderLabel(draft.picked)}</span>
        </PickedCard>
      ) : draft.adding ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2.5 text-xs font-semibold">
              <span>
                {t("name")}
                <RequiredMark />
              </span>
              {type === "bank" ? (
                <BankNamePick
                  value={draft.name}
                  onChange={(name) => onChange({ name })}
                  invalid={noName}
                />
              ) : (
                <input
                  autoFocus
                  value={draft.name}
                  maxLength={NAME_MAX}
                  onChange={(e) => onChange({ name: e.target.value })}
                  placeholder={t("namePlaceholder")}
                  aria-invalid={noName || undefined}
                  className={input(noName)}
                />
              )}
            </label>
            <label className="flex flex-col gap-2.5 text-xs font-semibold">
              {t("branch")}
              <input
                value={draft.branch}
                maxLength={BRANCH_MAX}
                onChange={(e) => onChange({ branch: e.target.value })}
                className={input(false)}
              />
            </label>
          </div>
          {type === "nbfc" && (
            <label className="flex flex-col gap-2.5 text-xs font-semibold sm:w-56">
              {t("pan")}
              <input
                value={draft.pan}
                maxLength={10}
                placeholder="ABCDE1234F"
                onChange={(e) =>
                  onChange({ pan: e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase() })
                }
                aria-invalid={panBad(draft) || undefined}
                className={cn(
                  input(panBad(draft) && (tried || draft.pan.length === 10)),
                  "tabular uppercase",
                )}
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => onChange({ adding: false, name: "", branch: "", pan: "" })}
            className="self-start text-sm font-semibold underline underline-offset-2"
          >
            {tp("change")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className={cn(PICK_SEARCH, fieldClass(tried))}>
            <Search className="size-4 shrink-0" aria-hidden />
            <input
              type="search"
              value={search}
              maxLength={60}
              aria-label={t("search")}
              placeholder={t("search")}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-chestnut/60"
            />
            <MicButton onText={setSearch} />
          </label>
          <div className={cn(PICK_LIST, PICK_TWO_COLUMNS)}>
            {shown.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onChange({ picked: l })}
                className={PICK_ROW}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{lenderLabel(l)}</span>
              </button>
            ))}
            {shown.length === 0 && !lenders.isPending && (
              <p className="col-span-full px-1 py-2 text-sm">{t("none")}</p>
            )}
            <div className={PICK_NEW}>
              <button
                type="button"
                onClick={() => onChange({ adding: true, name: search.trim() })}
                className={ADD_ON_IVORY}
              >
                <Plus className="size-4" aria-hidden /> {t("new")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* the loan's account there, once it's known who */}
      {(draft.picked || draft.adding) && (
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2.5 text-xs font-semibold">
            <span>
              {t("account")}
              <RequiredMark />
            </span>
            <input
              value={draft.account}
              maxLength={ACCOUNT_MAX}
              autoCapitalize="characters"
              onChange={(e) =>
                onChange({ account: e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, "") })
              }
              aria-invalid={noAccount || undefined}
              className={cn(input(noAccount), "tabular uppercase")}
            />
          </label>
          <label className="flex flex-col gap-2.5 text-xs font-semibold">
            {t("emi")}
            <NumberInput
              value={draft.emi}
              onChange={(emi) => onChange({ emi })}
              decimals={2}
              maxDigits={13}
              placeholder="0"
              className={cn(input(false), "tabular")}
            />
          </label>
        </div>
      )}
    </div>
  );
}
