"use client";

import { useState } from "react";

import { PlacePicker } from "../shared/place-picker";
import { ChevronDown, IndianRupee, Plus, Trash2 } from "lucide-react";

import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { RequiredMark } from "~/components/ui/required-mark";
import { Reveal } from "~/components/ui/reveal";
import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { type BankMode } from "@repo/trpc/client";

import { ModeChips } from "../shared/bank-mode";
import { UpiLine } from "../shared/upi-line";
import { UpiQr } from "../shared/upi-qr";
import { input, money } from "./shared";
import { useReceiptEntry } from "./state";

// one account takes it all: the account dropdown with its balance, then how it came in once it's picked, then our QR
// for a UPI payment; another account below, for money that came into more than one
export function OneAccount() {
  const {
    tpf,
    locale,
    banks,
    bankId,
    setBankId,
    bankMode,
    setBankMode,
    setAccountsOpen,
    tried,
    bank,
    bankHeld,
    firstPart,
  } = useReceiptEntry();
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2 text-xs font-semibold">
        <span>
          {tpf("account")}
          <RequiredMark />
        </span>
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
          value={bankId ?? null}
          onPick={(id) => {
            setAccountsOpen(0);
            setBankId(id);
          }}
          invalid={tried && !bank}
        />
      </div>
      <Reveal follow show={!!bank} gap="0px">
        <div className="flex flex-col gap-2 text-xs font-semibold">
          <ReceivedByChips mode={bankMode} onPick={(m) => m !== bankMode && setBankMode(m)} />
        </div>
      </Reveal>
      <OurQr bankId={bankId} mode={bankMode} amount={firstPart} />
      <AnotherAccount />
    </div>
  );
}

// the accounts it came into: a numbered card each (card 1 always, more added below it), folding to a summary (account,
// amount, how it came in). Open, it has the account dropdown with its balance, the amount into it, how it came in and
// our QR for UPI. A bar on top fills as the cards take the bank's share
export function AccountRows() {
  const {
    t,
    tpf,
    locale,
    banks,
    bankId,
    setBankId,
    bankMode,
    setBankMode,
    moreParts,
    setMoreParts,
    firstAmount,
    setFirstAmount,
    foldedCards,
    setFoldedCards,
    setMorePart,
    tried,
    bankHeld,
    bankShare,
    firstPart,
    firstShort,
  } = useReceiptEntry();
  const rows = [
    {
      key: "first",
      first: true,
      id: bankId,
      mode: bankMode,
      amountText: firstAmount,
      amount: firstPart,
    },
    ...moreParts.map((m) => ({
      key: m.key,
      first: false,
      id: m.bankId,
      mode: m.mode,
      amountText: m.amount,
      amount: Number(m.amount) || 0,
    })),
  ];
  // how much of the bank's share the cards take so far
  const placed = Math.round((bankShare - firstShort) * 100) / 100;
  const done = bankShare > 0 && firstShort === 0;
  return (
    <div className="flex flex-col gap-2.5 p-3">
      {/* placed on the left, what's left on the right */}
      <div className="flex flex-col gap-1.5 pb-1">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={bankShare}
          aria-valuenow={placed}
          className="h-3 overflow-hidden rounded-full bg-chestnut/10 shadow-[inset_0_0_0_1px] shadow-chestnut/15"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              done ? "bg-success" : "bg-chestnut",
            )}
            style={{ width: `${bankShare > 0 ? Math.min(100, (placed / bankShare) * 100) : 0}%` }}
          />
        </div>
        <div className="tabular flex justify-between gap-3 text-xs font-semibold">
          <span>{t("barIn", { amount: rupees(placed) })}</span>
          <span className={cn(done && "text-success")}>
            {done ? t("barDone") : tpf("barLeft", { amount: rupees(firstShort) })}
          </span>
        </div>
      </div>
      {rows.map((r, i) => {
        const acc = banks?.find((b) => b.id === r.id);
        // its own account, or one no other card uses
        const options = (banks ?? []).filter(
          (b) => b.id === r.id || (b.id !== bankId && !moreParts.some((m) => m.bankId === b.id)),
        );
        const amountBad = tried && !(r.amount > 0);
        const incomplete = !r.id || !(r.amount > 0) || r.mode === null;
        // a card with something wrong after Next stays open
        const open = !foldedCards.includes(r.key) || (tried && incomplete);
        const toggle = () =>
          setFoldedCards((all) =>
            all.includes(r.key) ? all.filter((k) => k !== r.key) : [...all, r.key],
          );
        const setMode = (mode: BankMode) => {
          if (r.first) {
            if (mode !== bankMode) setBankMode(mode);
          } else if (mode !== r.mode) setMorePart(r.key, { mode });
        };
        const summary = !open && !!acc;
        const bin = !r.first && (
          <button
            type="button"
            aria-label={tpf("removeAccount")}
            onClick={(e) => {
              e.stopPropagation();
              setMoreParts((all) => all.filter((m) => m.key !== r.key));
              setFoldedCards((all) => all.filter((k) => k !== r.key));
            }}
            className="grid size-11 place-items-center rounded-control hover:bg-chestnut/[0.08]"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        );
        const arrow = (
          <button
            type="button"
            aria-expanded={open}
            aria-label={tpf("accountN", { n: i + 1 })}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            className="grid size-11 place-items-center rounded-control hover:bg-chestnut/[0.08]"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
        );
        return (
          <div
            key={r.key}
            className="overflow-hidden rounded-control shadow-[0_0_5px_0] shadow-chestnut/30"
          >
            {/* the card's top: folded, the bank on one line and under it the amount with how it came in; the bin then
                the arrow on the right. Tapping anywhere on it opens or folds it */}
            <div
              onClick={toggle}
              className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 pl-3 pr-1.5"
            >
              {summary ? (
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate font-semibold">{bankNameIn(acc.bankName, locale)}</span>
                  <span className="tabular shrink-0 text-xs opacity-70">{`••${acc.last4}`}</span>
                </span>
              ) : (
                <span className="min-w-0 text-xs font-semibold uppercase tracking-[0.08em] opacity-70">
                  {tpf("accountN", { n: i + 1 })}
                </span>
              )}
              {summary ? (
                <span className="min-h-11" />
              ) : (
                <span className="flex items-center justify-self-end">
                  {bin}
                  {arrow}
                </span>
              )}
              {summary && (
                <>
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        money,
                        "flex h-9 items-center rounded-control bg-chestnut px-2.5 text-lg text-ivory",
                      )}
                    >
                      {rupees(r.amount)}
                    </span>
                    {r.mode && (
                      <span className="flex h-9 items-center rounded-control border border-chestnut/50 px-3 text-xs font-semibold">
                        {tpf(`modes.${r.mode}`)}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center justify-self-end">
                    {bin}
                    {arrow}
                  </span>
                </>
              )}
            </div>

            <Reveal show={open} gap="0px">
              <div className="flex flex-col gap-3 border-t border-chestnut/15 px-3 pb-3 pt-3">
                {/* the account, with what it holds */}
                <div className="flex flex-col gap-2 text-xs font-semibold">
                  <span>
                    {tpf("account")}
                    <RequiredMark />
                  </span>
                  <PlacePicker
                    label={tpf("account")}
                    places={options.map((b) => {
                      const h = bankHeld(b.id);
                      return {
                        id: b.id,
                        name: bankNameIn(b.bankName, locale),
                        sub: `••${b.last4}`,
                        hint: h === null ? undefined : rupees(h),
                        disabled: false,
                      };
                    })}
                    value={r.id ?? null}
                    onPick={(id) => {
                      // the account picked: its amount is next, so the cursor goes there
                      setTimeout(() => document.getElementById(`card-amount-${r.key}`)?.focus(), 0);
                      if (r.first) return setBankId(id);
                      // another account: its amount and how it came in start again
                      if (id !== r.id) setMorePart(r.key, { bankId: id, amount: "", mode: null });
                    }}
                    invalid={tried && !r.id}
                  />
                </div>

                {/* what came into it, up to what's still to place */}
                <label className="flex flex-col gap-2 text-xs font-semibold">
                  <span>
                    {t("accountAmount")}
                    <RequiredMark />
                  </span>
                  <span className="relative block">
                    <IndianRupee
                      className={cn(
                        "pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2",
                        r.amount > 0 && !amountBad && "text-ivory",
                      )}
                      aria-hidden
                    />
                    <NumberInput
                      id={`card-amount-${r.key}`}
                      value={r.amountText}
                      onChange={(v) =>
                        r.first ? setFirstAmount(v) : setMorePart(r.key, { amount: v })
                      }
                      decimals={2}
                      maxDigits={13}
                      max={Math.round((r.amount + firstShort) * 100) / 100}
                      placeholder="0"
                      aria-invalid={amountBad || undefined}
                      className={cn(
                        input(amountBad),
                        "min-h-12 pl-8 font-heading text-lg font-bold",
                        r.amount > 0 && !amountBad && "bg-chestnut text-ivory caret-ivory",
                      )}
                    />
                  </span>
                </label>

                {/* how it came in, as chips, once something came into it */}
                <Reveal follow show={r.amount > 0} gap="0px">
                  <div className="flex flex-col gap-2 text-xs font-semibold">
                    <ReceivedByChips mode={r.mode} onPick={setMode} />
                  </div>
                </Reveal>
                <OurQr bankId={r.id} mode={r.mode} amount={r.amount} />
              </div>
            </Reveal>
          </div>
        );
      })}
      <AnotherAccount />
    </div>
  );
}

// how the bank's part came in, with the receipt's words
function ReceivedByChips({
  mode,
  onPick,
}: {
  mode: BankMode | null;
  onPick: (m: BankMode) => void;
}) {
  const { t, tried } = useReceiptEntry();
  return (
    <ModeChips
      label={t("receivedBy")}
      missing={t("pickMode")}
      mode={mode}
      tried={tried}
      onPick={onPick}
    />
  );
}

// by UPI into an account: its QR for this amount, for the payer to scan, from the UPI ID saved on it; with none, the
// admin must type one here (it's added to the account with the receipt), and staff are told to ask the admin or pick
// another way (they can't go on with UPI into it)
// by UPI into an account with no UPI ID of ours: the admin types one (added to it with the receipt); staff are told
export function OurUpiNeeded({ bankId, mode }: { bankId: string; mode: BankMode | null }) {
  const { t, isAdmin, banks } = useReceiptEntry();
  const acc = banks?.find((b) => b.id === bankId);
  const none = mode === "upi" && !!acc && acc.upiIds.length === 0;
  if (!none) return null;
  return isAdmin ? (
    <OurUpiField accountId={acc.id} />
  ) : (
    <FieldMessage className="mt-0">{t("noUpiStaff")}</FieldMessage>
  );
}

function OurQr({
  bankId,
  mode,
  amount,
}: {
  bankId: string | null;
  mode: BankMode | null;
  amount: number;
}) {
  const { t, isAdmin, banks, fromName, upiIdsOf } = useReceiptEntry();
  const acc = banks?.find((b) => b.id === bankId);
  const upi = mode === "upi" && !!acc;
  const upiIds = upiIdsOf(bankId);
  const none = upi && acc.upiIds.length === 0;
  return (
    <>
      {/* none saved: the admin's box to type one; staff's note */}
      <Reveal follow show={none && isAdmin} gap="0px">
        {acc && <OurUpiField accountId={acc.id} />}
      </Reveal>
      <Reveal follow show={none && !isAdmin} gap="0px">
        <FieldMessage className="mt-0">{t("noUpiStaff")}</FieldMessage>
      </Reveal>
      <Reveal follow show={upi && upiIds.length > 0 && amount > 0} gap="0px">
        {acc && upiIds.length > 0 && (
          <UpiQr
            key={`${acc.id}|${upiIds.join()}`}
            upiIds={upiIds}
            payee={acc.accountHolderName}
            amount={amount}
            note={fromName ?? undefined}
          />
        )}
      </Reveal>
    </>
  );
}

// the box for an account's UPI ID, where it has none: its mistakes show once it's left (or Save is pressed)
function OurUpiField({ accountId }: { accountId: string }) {
  const { t, tried, ourUpis, setOurUpis, ourUpisLeft, setOurUpisLeft, ourUpiProblem } =
    useReceiptEntry();
  const value = ourUpis[accountId] ?? "";
  const problem = ourUpiProblem(accountId);
  const bad =
    (tried && value.trim() === "") ||
    ((tried || ourUpisLeft.includes(accountId)) && problem !== null);
  // typed and fine: shown as text with Edit, the box back once Edit is tapped
  const [editing, setEditing] = useState(false);
  if (!editing && value.trim() !== "" && problem === null && ourUpisLeft.includes(accountId))
    return <UpiLine label={t("ourUpi")} value={value.trim()} onEdit={() => setEditing(true)} />;
  return (
    <label className="flex flex-col gap-2 text-xs font-semibold">
      <span>
        {t("ourUpi")}
        <RequiredMark />
      </span>
      <input
        type="text"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        maxLength={255}
        onChange={(e) => {
          setOurUpisLeft((l) => l.filter((id) => id !== accountId));
          setOurUpis((u) => ({
            ...u,
            [accountId]: e.target.value.toLowerCase().replace(/[^a-z0-9.@_-]/g, ""),
          }));
        }}
        autoFocus={editing}
        onBlur={() => {
          setEditing(false);
          setOurUpisLeft((l) => (l.includes(accountId) ? l : [...l, accountId]));
        }}
        placeholder="name@bank"
        aria-invalid={bad || undefined}
        className={input(bad)}
      />
      {bad && (
        <FieldMessage className="mt-0">
          {problem === "handle"
            ? t("ourUpiHandle", { handle: `@${value.trim().split("@")[1]}` })
            : problem === "taken"
              ? t("ourUpiTaken")
              : t("ourUpiBad")}
        </FieldMessage>
      )}
    </label>
  );
}

// another account card, while an account is left to add and something is still to place
function AnotherAccount() {
  const { tpf, canAddAccount, addAccount } = useReceiptEntry();
  if (!canAddAccount) return null;
  return (
    <button
      type="button"
      onClick={addAccount}
      className={cn(ADD_ON_IVORY, "mt-3 w-full sm:w-auto sm:self-start")}
    >
      <Plus className="size-4" aria-hidden /> {tpf("anotherAccount")}
    </button>
  );
}
