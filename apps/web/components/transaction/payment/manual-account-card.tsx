"use client";

import { ChevronDown, IndianRupee, Plus, QrCode, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ADD_ON_IVORY } from "~/components/ui/page-styles";

import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { ModeChips } from "../shared/bank-mode";
import { input } from "../shared/form-basics";
import { AutoSwitch, type GridPlace, ShowQrButton } from "../shared/split-grid";
import { type Place, PlacePicker } from "../shared/place-picker";
import { usePaymentEntry } from "./state";
import { UpiField } from "./bank-cards";

// Bank with Auto off: one card, as wide as one of the grid's boxes, that grows as it's filled. First the bank accounts as an accordion; once one is
// picked, its amount under it; once that's more than nothing, how it was paid
export function ManualAccountCard({
  index,
  pickedId,
  setPickedId,
  taken,
  folded,
  onFold,
  onRemove,
}: {
  // takes this card away (the only card is emptied instead)
  onRemove: () => void;
  index: number;
  // shown folded: amount, Paid by and the arrow on top; the account and Show QR code under them
  folded: boolean;
  onFold: (folded: boolean) => void;
  pickedId: string | null;
  setPickedId: (id: string) => void;
  // accounts picked on the other cards, left out of this one's list
  taken: string[];
}) {
  const { t, tc, tried, gridPlaces, setGridText, setGridMode, qrItems, qrItem, setQrPick } =
    usePaymentEntry();
  // the places to pick from: the bank accounts, and cash too for Cash + Bank; not ones on the other cards
  const accounts = gridPlaces.filter((p) => !taken.includes(p.id));
  const picked: GridPlace | null = accounts.find((p) => p.id === pickedId) ?? null;

  // the accounts, each with what it holds (the admin only); one holding nothing is muted
  const places: Place<string>[] = accounts.map((p) => ({
    id: p.id,
    name: p.name,
    sub: p.sub ?? undefined,
    hint: p.held === null ? undefined : rupees(p.held),
    disabled: p.held !== null && p.held <= 0,
  }));
  // a pick puts the cursor straight in its amount
  useEffect(() => {
    if (pickedId) document.getElementById(`manual-account-amount-${index}`)?.focus();
  }, [pickedId, index]);
  const short = !!picked && picked.held !== null && picked.amount > picked.held;
  // it folds once it has an account and an amount (Another account folds it even before Paid by is picked)
  const whole = !!picked && picked.amount > 0;
  // cash takes only an amount: no Paid by, no UPI
  const isCash = picked?.id === "cash";
  const card =
    "flex min-w-0 flex-col justify-between gap-3 rounded-control p-3 shadow-[0_0_5px_0] shadow-chestnut/25 bg-chestnut/8 sm:w-[calc(50%-0.375rem)]";
  const qrButton = picked && picked.mode === "upi" && qrItems.some((q) => q.key === picked.id) && (
    <ShowQrButton shown={qrItem?.key === picked.id} onShow={() => setQrPick(picked.id)} />
  );
  // the arrow that folds the card or opens it again
  const arrow = (
    <button
      type="button"
      aria-expanded={!folded}
      aria-label={picked?.name ?? t("account")}
      onClick={() => onFold(!folded)}
      className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
    >
      <ChevronDown
        className={cn("size-4 transition-transform", !folded && "rotate-180")}
        aria-hidden
      />
    </button>
  );

  // the bin beside Show QR code, once an account is picked: the card goes, and its amount and Paid by with it
  const remove = picked && (
    <button
      type="button"
      aria-label={tc("removeAccount")}
      onClick={onRemove}
      className="grid size-9 shrink-0 place-items-center rounded-control text-danger hover:bg-danger/10"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );

  // folded: the amount and Paid by on top; the bank and its last digits under them, with the arrow; the QR icon (UPI) beside Paid by
  if (folded && whole && picked)
    return (
      // red-edged when Next was tapped with something still missing on it (Paid by, or past what it holds)
      // a tap anywhere on it (but its buttons) opens it; only as tall as what it shows
      <div
        role="button"
        tabIndex={0}
        aria-expanded={false}
        onClick={(e) => !(e.target as HTMLElement).closest("button") && onFold(false)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
            e.preventDefault();
            onFold(false);
          }
        }}
        className={cn(
          "cursor-pointer",
          card,
          // the two rows sit close
          "gap-1",
          tried && ((!isCash && picked.mode === null) || short) && "shadow-danger/80",
        )}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="tabular min-w-0 break-all font-heading text-xl font-bold">
            {rupees(picked.amount)}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {picked.mode && (
              <span className="inline-flex h-7 items-center rounded-control border border-chestnut bg-transparent px-2.5 text-xs font-semibold text-chestnut">
                {t(`modes.${picked.mode}`)}
              </span>
            )}
            {/* by UPI: a QR icon that puts its QR in the spot, filled while it's the one there */}
            {picked.mode === "upi" && qrItems.some((q) => q.key === picked.id) && (
              <button
                type="button"
                aria-pressed={qrItem?.key === picked.id}
                aria-label={tc(qrItem?.key === picked.id ? "qrShown" : "showQr")}
                onClick={() => setQrPick(picked.id)}
                className={cn(
                  "grid size-7 place-items-center rounded-control border border-chestnut transition-colors",
                  qrItem?.key === picked.id
                    ? "bg-chestnut text-ivory"
                    : "bg-transparent text-chestnut hover:bg-chestnut/[0.06]",
                )}
              >
                <QrCode className="size-4" aria-hidden />
              </button>
            )}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-semibold">
            {picked.name}
            {picked.sub && <span className="ml-1.5 font-normal opacity-70">{picked.sub}</span>}
          </span>
          {arrow}
        </div>
      </div>
    );

  return (
    // a tap on the card's plain parts (not a field, chip or button) folds it, once it can fold
    <div
      // open cards in a row match the tallest open one
      className={cn(card, "sm:self-stretch")}
      onClick={(e) =>
        whole &&
        !(e.target as HTMLElement).closest(
          "button, input, label, a, [role=radio], [role=radiogroup]",
        ) &&
        onFold(true)
      }
    >
      {/* which account */}
      <PlacePicker
        label={t("account")}
        places={places}
        value={pickedId}
        invalid={tried && !picked}
        onPick={(id) => {
          // a pick starts afresh: no amount, no Paid by, on the old account or the new one
          for (const one of [pickedId, id]) {
            if (!one) continue;
            setGridText(one, "");
            setGridMode(one, null);
          }
          setPickedId(id);
        }}
      />

      {/* its amount, chestnut once there's one, red past what it holds */}
      {picked && (
        <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
          {t("accountAmount")}
          <span className={cn("relative block", picked.amount > 0 && !short && "text-ivory")}>
            <IndianRupee
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
              aria-hidden
            />
            <NumberInput
              id={`manual-account-amount-${index}`}
              value={picked.text}
              onChange={(v) => setGridText(picked.id, v)}
              decimals={2}
              maxDigits={13}
              max={picked.held ?? undefined}
              placeholder="0"
              aria-invalid={short || (tried && picked.amount === 0) || undefined}
              className={cn(
                input(short || (tried && picked.amount === 0)),
                "min-h-14 pl-10 font-heading text-2xl font-bold tabular",
                picked.amount > 0 && !short && "bg-chestnut text-ivory caret-ivory",
              )}
            />
          </span>
        </label>
      )}

      {/* how it was paid, once there's an amount */}
      {picked && !isCash && picked.amount > 0 && (
        <div className="flex flex-col gap-2 text-xs font-semibold">
          <ModeChips
            label={t("paidBy")}
            missing={t("pickMode")}
            mode={picked.mode}
            tried={tried}
            onPick={(m) => setGridMode(picked.id, m)}
          />
        </div>
      )}
      {/* by UPI: the supplier's UPI ID (text with Edit once known), then Show QR code, or QR shown when it's the
          one in the QR spot */}
      {picked && picked.amount > 0 && picked.mode === "upi" && (
        <>
          <UpiField />
        </>
      )}
      {/* Show QR code (UPI only) with the arrow that folds it beside it, once it's whole */}
      {(qrButton || whole || remove) && (
        <div className="mt-auto flex items-center justify-end gap-2">
          {qrButton}
          {remove}
          {whole && arrow}
        </div>
      )}
    </div>
  );
}

// Bank, or Cash + Bank: a card per place (cash, a bank account; Auto fills them, or they're picked one by one). While the cards come to less than the amount, Another account beside the
// last card adds one (only once that card has an account and an amount, and while there's an account left)
export function ManualAccounts() {
  const { t, value, gridPlaces, setGridText, setGridMode, gridAuto, setGridAuto } =
    usePaymentEntry();
  const [picks, setPicks] = useState<(string | null)[]>([null]);
  const [folds, setFolds] = useState<boolean[]>([false]);
  const accounts = gridPlaces;
  // Auto: a card for each account it filled (folded), kept as they are once typing turns Auto off; Auto
  // switched off by hand empties everything, so it's back to one empty card
  const autoKey = gridAuto
    ? accounts
        .filter((p) => p.amount > 0)
        .map((p) => p.id)
        .join()
    : null;
  const anyAmount = accounts.some((p) => p.amount > 0);
  useEffect(() => {
    if (autoKey !== null) {
      const ids = autoKey === "" ? [null] : autoKey.split(",");
      setPicks(ids);
      // Auto's cards start folded
      setFolds(ids.map(() => true));
    } else if (!anyAmount) {
      setPicks([null]);
      setFolds([false]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when Auto's accounts change, or Auto goes off
  }, [autoKey]);
  const amountOf = (id: string | null) => accounts.find((p) => p.id === id)?.amount ?? 0;
  const given = Math.round(picks.reduce((sum, id) => sum + amountOf(id), 0) * 100) / 100;
  const last = picks.at(-1) ?? null;
  const canAdd =
    given < value && last !== null && amountOf(last) > 0 && picks.length < accounts.length;
  const left = Math.max(0, Math.round((value - given) * 100) / 100);
  const done = value > 0 && left === 0;
  return (
    <div className="flex flex-col gap-3">
      {/* Breakdown, headed like the card's own heading, with Auto right beside it */}
      <div className="flex items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
          {t("breakdown")}
        </h3>
        <AutoSwitch on={gridAuto} set={setGridAuto} />
      </div>
      {/* a bar that fills as the cards take up the amount: given on the left, what's left on the right */}
      <div className="flex flex-col gap-1.5">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={value}
          aria-valuenow={given}
          className="h-3 overflow-hidden rounded-full bg-chestnut/10 shadow-[inset_0_0_0_1px] shadow-chestnut/15"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              done ? "bg-success" : "bg-chestnut",
            )}
            style={{ width: `${value > 0 ? Math.min(100, (given / value) * 100) : 0}%` }}
          />
        </div>
        <div className="tabular flex justify-between gap-3 text-xs font-semibold">
          <span>{t("barPaid", { amount: rupees(given) })}</span>
          <span className={cn(done && "text-success")}>
            {done ? t("barDone") : t("barLeft", { amount: rupees(left) })}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        {picks.map((id, i) => (
          <ManualAccountCard
            key={i}
            index={i}
            pickedId={id}
            setPickedId={(next) => setPicks((all) => all.map((x, j) => (j === i ? next : x)))}
            folded={folds[i] ?? false}
            onFold={(f) => setFolds((all) => all.map((x, j) => (j === i ? f : x)))}
            onRemove={() => {
              // its amount and Paid by go too, so the QR spot moves to another account by UPI, or back to empty
              if (id) {
                setGridText(id, "");
                setGridMode(id, null);
              }
              // the only card starts again empty; otherwise it goes
              if (picks.length === 1) {
                setPicks([null]);
                setFolds([false]);
                return;
              }
              setPicks((all) => all.filter((_, j) => j !== i));
              setFolds((all) => all.filter((_, j) => j !== i));
            }}
            taken={picks.filter((x, j) => j !== i && x !== null) as string[]}
          />
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={() => {
              // every card so far folds, the new one opens
              setPicks((all) => [...all, null]);
              setFolds((all) => [...all.map(() => true), false]);
            }}
            className={ADD_ON_IVORY}
          >
            <Plus className="size-4" aria-hidden />
            {t("anotherAccount")}
          </button>
        )}
      </div>
    </div>
  );
}
