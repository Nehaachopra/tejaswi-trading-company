"use client";

import { useState } from "react";

import { PlacePicker } from "../shared/place-picker";
import { ChevronDown, IndianRupee, Plus, Trash2 } from "lucide-react";
import { Reveal } from "~/components/ui/reveal";
import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { type BankMode } from "@repo/trpc/client";
import { UpiLine } from "../shared/upi-line";
import { UpiQr } from "../shared/upi-qr";
import { ModeChips } from "../shared/bank-mode";
import { input, money } from "./shared";
import { usePaymentEntry } from "./state";
import { CapWarning } from "./notes";

// one account pays it all: the account dropdown with its balance, then how it was paid once it's picked, then the
// party's UPI QR. An account holding less than its share turns this into the cards (accountRows)
export function OneAccount() {
  const {
    t,
    locale,
    bankId,
    setBankId,
    bankMode,
    setBankMode,
    setAccountsOpen,
    tried,
    bank,
    bankHeld,
    coveringBanks,
    bankShare,
    qrParty,
    payeeUpis,
    upiAmount,
    qrShown,
  } = usePaymentEntry();
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2 text-xs font-semibold">
        <span>
          {t("account")}
          <RequiredMark />
        </span>
        <PlacePicker
          label={t("account")}
          places={coveringBanks.map((b) => {
            const h = bankHeld(b.id);
            return { id: b.id, name: bankNameIn(b.bankName, locale), sub: `••${b.last4}`, hint: h === null ? undefined : rupees(h), disabled: false };
          })}
          value={bankId ?? null}
          onPick={(id) => {
            setAccountsOpen(0);
            setBankId(id);
            // it holds less than the amount: the cards come up, and the cursor goes to card 1's amount
            const h = bankHeld(id);
            if (h !== null && h < bankShare)
              setTimeout(() => document.getElementById("card-amount-first")?.focus(), 50);
          }}
          invalid={tried && !bank}
        />
      </div>
      <Reveal follow show={!!bank} gap="0px">
        <div className="flex flex-col gap-2 text-xs font-semibold">
          <PaidByChips mode={bankMode} onPick={(m) => m !== bankMode && setBankMode(m)} />
        </div>
      </Reveal>
      {<UpiField />}
      <Reveal follow show={qrShown} gap="0px">
        <UpiQr
          key={payeeUpis.join()}
          upiIds={payeeUpis}
          payee={qrParty?.name ?? ""}
          amount={upiAmount}
        />
      </Reveal>
    </div>
  );
}

export function AccountRows() {
  const {
    t,
    locale,
    banks,
    bankId,
    setBankId,
    setCapNote,
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
    coveringBanks,
    bankShare,
    firstPart,
    firstShort,
    canAddAccount,
    addAccount,
    qrParty,
    payeeUpis,
  } = usePaymentEntry();
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
  // how much of the bank's share the cards pay so far
  const paid = Math.round((bankShare - firstShort) * 100) / 100;
  const done = bankShare > 0 && firstShort === 0;
  return (
    <div className="flex flex-col gap-2.5 p-3">
      {/* a bar on top that fills as the cards pay the bank's share: paid on the left, what's left on the right */}
      <div className="flex flex-col gap-1.5 pb-1">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={bankShare}
          aria-valuenow={paid}
          className="h-3 overflow-hidden rounded-full bg-chestnut/10 shadow-[inset_0_0_0_1px] shadow-chestnut/15"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              done ? "bg-success" : "bg-chestnut",
            )}
            style={{ width: `${bankShare > 0 ? Math.min(100, (paid / bankShare) * 100) : 0}%` }}
          />
        </div>
        <div className="tabular flex justify-between gap-3 text-xs font-semibold">
          <span>{t("barPaid", { amount: rupees(paid) })}</span>
          <span className={cn(done && "text-success")}>
            {done ? t("barDone") : t("barLeft", { amount: rupees(firstShort) })}
          </span>
        </div>
      </div>
      {rows.map((r, i) => {
        const acc = banks?.find((b) => b.id === r.id);
        const has = r.id ? bankHeld(r.id) : null;
        // its own account, or one no other card uses
        const options = coveringBanks.filter(
          (b) => b.id === r.id || (b.id !== bankId && !moreParts.some((m) => m.bankId === b.id)),
        );
        const amountBad = (tried && !(r.amount > 0)) || (has !== null && r.amount > has);
        const incomplete = !r.id || !(r.amount > 0) || r.mode === null;
        // a card with something wrong after Next stays open
        const open = !foldedCards.includes(r.key) || (tried && incomplete) || amountBad;
        const toggle = () =>
          setFoldedCards((all) =>
            all.includes(r.key) ? all.filter((k) => k !== r.key) : [...all, r.key],
          );
        const setMode = (mode: BankMode) => {
          if (r.first) {
            if (mode === bankMode) return;
            setBankMode(mode);
          } else if (mode !== r.mode) setMorePart(r.key, { mode });
        };
        return (
          <div
            key={r.key}
            className="overflow-hidden rounded-control shadow-[0_0_5px_0] shadow-chestnut/30"
          >
            {/* the card's top: (folded) the bank on one line and under it the amount with how it was paid
                beside it, the bin then the arrow on the right. Tapping anywhere on it opens or folds it */}
            {(() => {
              const summary = !open && !!acc;
              const bin = !r.first && (
                <button
                  type="button"
                  aria-label={t("removeAccount")}
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
                  aria-label={t("accountN", { n: i + 1 })}
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
                  onClick={toggle}
                  className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 pl-3 pr-1.5"
                >
                  {summary ? (
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate font-semibold">
                        {bankNameIn(acc.bankName, locale)}
                      </span>
                      <span className="tabular shrink-0 text-xs opacity-70">{`••${acc.last4}`}</span>
                    </span>
                  ) : (
                    <span className="min-w-0 text-xs font-semibold uppercase tracking-[0.08em] opacity-70">
                      {t("accountN", { n: i + 1 })}
                    </span>
                  )}
                  {summary ? (
                    <span className="min-h-11" />
                  ) : (
                    // open: the bin beside the arrow (there's no amount line)
                    <span className="flex items-center justify-self-end">
                      {bin}
                      {arrow}
                    </span>
                  )}
                  {summary && (
                    <>
                      {/* the amount and, beside it at the same height, how it was paid; on the right the bin, then the arrow */}
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
                            {t(`modes.${r.mode}`)}
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
              );
            })()}

            <Reveal show={open} gap="0px">
              <div className="flex flex-col gap-3 border-t border-chestnut/15 px-3 pb-3 pt-3">
                {/* the account, with what it holds */}
                <div className="flex flex-col gap-2 text-xs font-semibold">
                  <span>
                    {t("account")}
                    <RequiredMark />
                  </span>
                  <PlacePicker
          label={t("account")}
          places={options.map((b) => {
            const h = bankHeld(b.id);
            return { id: b.id, name: bankNameIn(b.bankName, locale), sub: `••${b.last4}`, hint: h === null ? undefined : rupees(h), disabled: false };
          })}
          value={r.id ?? null}
          onPick={(id) => {
                      // the account picked: its amount is next, so the cursor goes there
                      setTimeout(() => document.getElementById(`card-amount-${r.key}`)?.focus(), 0);
                      if (r.first) return setBankId(id);
                      // another account: its amount and how it was paid start again
                      if (id !== r.id) setMorePart(r.key, { bankId: id, amount: "", mode: null });
                    }}
          invalid={tried && !r.id}
        />
                </div>

                {/* what it pays, up to what it holds and what's still to pay */}
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
                      onChange={(v) => {
                        setCapNote(null);
                        if (r.first) setFirstAmount(v);
                        else setMorePart(r.key, { amount: v });
                      }}
                      onCapped={(most) =>
                        setCapNote({
                          key: `card-${r.key}`,
                          text: t("capOnly", { amount: rupees(most) }),
                        })
                      }
                      decimals={2}
                      maxDigits={13}
                      max={(() => {
                        const room = Math.round((r.amount + firstShort) * 100) / 100;
                        return has === null ? room : Math.min(has, room);
                      })()}
                      placeholder="0"
                      aria-invalid={amountBad || undefined}
                      className={cn(
                        input(amountBad),
                        "min-h-12 pl-8 font-heading text-lg font-bold",
                        // filled in: chestnut, as the amount on the Amount card
                        r.amount > 0 && !amountBad && "bg-chestnut text-ivory caret-ivory",
                      )}
                    />
                  </span>
                  {<CapWarning at={`card-${r.key}`} />}
                </label>

                {/* how it was paid, as chips, once it pays something */}
                <Reveal follow show={r.amount > 0} gap="0px">
                  <div className="flex flex-col gap-2 text-xs font-semibold">
                    <PaidByChips mode={r.mode} onPick={setMode} />
                  </div>
                </Reveal>

                {/* the first account by UPI to someone with a UPI ID: its QR */}
                {/* their UPI ID, asked once: in the first card paid by UPI; every card by UPI then shows its QR */}
                {r.mode === "upi" && i === rows.findIndex((x) => x.mode === "upi") && <UpiField />}
                <Reveal
                  follow
                  show={r.mode === "upi" && payeeUpis.length > 0 && r.amount > 0}
                  gap="0px"
                >
                  <UpiQr
                    key={payeeUpis.join()}
                    upiIds={payeeUpis}
                    payee={qrParty?.name ?? ""}
                    amount={r.amount}
                  />
                </Reveal>
              </div>
            </Reveal>
          </div>
        );
      })}
      {canAddAccount && (
        <button
          type="button"
          onClick={addAccount}
          className={cn(ADD_ON_IVORY, "mt-3 w-full sm:w-auto sm:self-start")}
        >
          <Plus className="size-4" aria-hidden /> {t("anotherAccount")}
        </button>
      )}
    </div>
  );
}

// how the bank's part was paid, with the payment's words
function PaidByChips({ mode, onPick }: { mode: BankMode | null; onPick: (m: BankMode) => void }) {
  const { t, tried } = usePaymentEntry();
  return (
    <ModeChips
      label={t("paidBy")}
      missing={t("pickMode")}
      mode={mode}
      tried={tried}
      onPick={onPick}
    />
  );
}

// paid by UPI: their UPI ID for the QR. One already there (saved on them, or typed and fine) shows as text with Edit;
// the box only while there's none, or once Edit is tapped (a new one is saved on them with the payment)
export function UpiField() {
  const {
    t,
    tried,
    typedUpi,
    setTypedUpi,
    typedUpiShapeOk,
    typedUpiOk,
    upiLeft,
    setUpiLeft,
    asksUpi,
    savedUpis,
  } = usePaymentEntry();
  const bad = (upiLeft || tried) && typedUpi.trim() !== "" && !typedUpiOk;
  const [editing, setEditing] = useState(false);
  return (
    <Reveal follow show={asksUpi} gap="0px">
      {/* text once it's saved on them, or typed and the box left */}
      {!editing && typedUpiOk && (upiLeft || savedUpis.includes(typedUpi.trim().toLowerCase())) ? (
        <UpiLine label={t("payeeUpi")} value={typedUpi.trim()} onEdit={() => setEditing(true)} />
      ) : (
      <label className="flex flex-col gap-2 text-xs font-semibold">
        <span>{t("payeeUpi")}</span>
        <input
          autoFocus={editing}
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={typedUpi}
          maxLength={255}
          onChange={(e) => {
            setUpiLeft(false);
            setTypedUpi(e.target.value.toLowerCase().replace(/[^a-z0-9.@_-]/g, ""));
          }}
          onBlur={() => {
            setUpiLeft(true);
            setEditing(false);
          }}
          placeholder="name@bank"
          aria-invalid={bad || undefined}
          className={input(bad)}
        />
        {bad && (
          <FieldMessage className="mt-0">
            {typedUpiShapeOk
              ? t("payeeUpiHandle", { handle: `@${typedUpi.trim().split("@")[1]}` })
              : t("payeeUpiBad")}
          </FieldMessage>
        )}
      </label>
      )}
    </Reveal>
  );
}
