"use client";

import { ChevronDown, IndianRupee, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ADD_ON_IVORY } from "~/components/ui/page-styles";

import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { BankRefField, ModeAccordion, refOkFor } from "../shared/bank-mode";
import { input } from "../shared/form-basics";
import { AutoSwitch, type GridPlace } from "../shared/split-grid";
import { type Place, PlacePicker } from "../shared/place-picker";
import { UpiQr } from "../shared/upi-qr";
import { Note } from "~/components/ui/note";
import { Reveal } from "~/components/ui/reveal";
import { usePaymentEntry } from "./state";
import { UpiField } from "./bank-cards";

// Bank with Auto off: one card, as wide as one of the grid's boxes, that grows as it's filled. First the bank accounts as an accordion; once one is
// picked, its amount under it; once that's more than nothing, how it was paid
export function ManualAccountCard({
  index,
  pickedId,
  setPickedId,
  taken,
  room,
  folded,
  onFold,
  onRemove,
}: {
  // takes this card away (the only card is emptied instead)
  onRemove: () => void;
  index: number;
  // shown folded: amount and Paid by on top; the account and the arrow under them
  folded: boolean;
  onFold: (folded: boolean) => void;
  pickedId: string | null;
  setPickedId: (id: string) => void;
  // accounts picked on the other cards, left out of this one's list
  taken: string[];
  // what's left to pay once the other cards' amounts are taken off: this card can't take more
  room: number;
}) {
  const {
    t,
    tc,
    tried,
    gridPlaces,
    setGridText,
    setGridMode,
    qrItems,
    capNote,
    setCapNote,
    upiEditing,
    setUpiEditing,
    refs,
    setRefs,
    refLeft,
    setRefLeft,
  } = usePaymentEntry();
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
  // which card's amount was cut, for its warning
  const capKey = `account-${index}`;
  // it folds once it has an account and an amount (Another account folds it even before Paid by is picked)
  const whole = !!picked && picked.amount > 0;
  // cash takes only an amount: no Paid by, no UPI
  const isCash = picked?.id === "cash";
  // something missing on it (Paid by, past what it holds, or a reference that doesn't fit) once Next was tapped: a folded card opens to show it
  const refBad =
    !!picked &&
    !isCash &&
    !!picked.mode &&
    !refOkFor(picked.mode, refs[picked.id]?.mode === picked.mode ? refs[picked.id]!.text : "");
  const faulty = tried && !!picked && ((!isCash && picked.mode === null) || short || refBad);
  useEffect(() => {
    if (folded && faulty) onFold(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it turns faulty or is folded
  }, [folded, faulty]);
  const card =
    "flex min-w-0 flex-col justify-between gap-3 rounded-control p-3 shadow-[0_0_5px_0] shadow-chestnut/25 bg-chestnut/8 w-full";
  // a bank account's UTR or cheque number, once it says how it was paid: under Paid by, or under the QR for UPI
  const refField = picked && !isCash && picked.amount > 0 && picked.mode && (
    <BankRefField
      plain
      mode={picked.mode}
      text={refs[picked.id]?.mode === picked.mode ? refs[picked.id]!.text : ""}
      onText={(text) => {
        setRefLeft((l) => l.filter((k) => k !== picked.id));
        setRefs((r) => ({ ...r, [picked.id]: { mode: picked.mode!, text } }));
      }}
      left={refLeft.includes(picked.id)}
      onLeave={() => setRefLeft((l) => (l.includes(picked.id) ? l : [...l, picked.id]))}
      tried={tried}
    />
  );
  // this account's QR, when it pays by UPI
  const ownQr = (picked && qrItems.find((q) => q.key === picked.id)) ?? null;
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

  // the bin, once an account is picked: the card goes, and its amount and Paid by with it
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

  // folded: one line, the amount on the left, cash or the bank and its last digits with the arrow on the right (no balance)
  const foldedView =
    whole && picked ? (
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
          // the open card's own fill and soft edge, no border (red-edged while something's missing on it)
          "gap-1 py-1.5",
          faulty && "shadow-danger/80",
        )}
      >
        {/* one line: the amount on the left; cash or the bank account, and the arrow, on the right */}
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="tabular shrink-0 font-heading text-xl font-bold">
            {rupees(picked.amount)}
          </span>
          <span className="flex min-w-0 items-center gap-1">
            {/* a long bank name is cut short; its last digits always show in full */}
            <span className="min-w-0 truncate text-sm font-semibold">{picked.name}</span>
            {picked.sub && (
              <span className="tabular ml-0.5 shrink-0 text-sm opacity-70">{picked.sub}</span>
            )}
            {arrow}
          </span>
        </div>
      </div>
    ) : null;

  const openView = (
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
        hintPicked
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
              onChange={(v) => {
                setCapNote(null);
                setGridText(picked.id, v);
              }}
              // never past what's left to pay, nor what it holds; typing past either cuts it there and says why
              onCapped={(most) =>
                setCapNote({
                  key: capKey,
                  text: t(most < (picked.held ?? Infinity) ? "capLeft" : "capOnly", {
                    amount: rupees(most),
                  }),
                })
              }
              decimals={2}
              maxDigits={13}
              max={Math.min(picked.held ?? Infinity, room)}
              placeholder="0"
              aria-invalid={short || (tried && picked.amount === 0) || undefined}
              className={cn(
                input(short || (tried && picked.amount === 0)),
                "min-h-14 pl-10 font-heading text-2xl font-bold tabular",
                picked.amount > 0 && !short && "bg-chestnut text-ivory caret-ivory",
              )}
            />
          </span>
          {capNote?.key === capKey && <Note className="text-amber-700">{capNote.text}</Note>}
        </label>
      )}

      {/* how it was paid, once there's an amount */}
      {picked && !isCash && picked.amount > 0 && (
        <div className="flex flex-col gap-2 text-xs font-semibold">
          <ModeAccordion
            label={t("paidBy")}
            missing={t("pickMode")}
            mode={picked.mode}
            tried={tried}
            onPick={(m) => setGridMode(picked.id, m)}
          />
        </div>
      )}
      {/* its UTR or cheque number right under Paid by (UPI: under the QR instead) */}
      {picked?.mode !== "upi" && refField}
      {/* by UPI: the box for who's paid's UPI ID (under Paid by, above the QR), while there's none yet or the pen was tapped */}
      {picked && picked.amount > 0 && picked.mode === "upi" && (
        <>
          <UpiField />
        </>
      )}
      {/* this account's own QR, under Paid by and the UPI ID box (which shows the ID, so the QR doesn't) */}
      {ownQr && picked?.mode === "upi" && (
        <div>
          <UpiQr
            key={`${ownQr.key}|${ownQr.upiIds.join()}`}
            upiIds={ownQr.upiIds}
            payee={ownQr.payee}
            amount={ownQr.amount}
            note={ownQr.note}
            // the ID above the code with a pen to change it; not while it's being changed in the box
            hideId={upiEditing}
            onEdit={() => setUpiEditing(true)}
          />
        </div>
      )}
      {/* by UPI: its UTR under the QR and its amount */}
      {picked?.mode === "upi" && refField}
      {/* the bin, and the arrow that folds it once it's whole */}
      {(whole || remove) && (
        <div className="mt-auto flex items-center justify-end gap-2">
          {remove}
          {whole && arrow}
        </div>
      )}
    </div>
  );

  // folded and open swap with the same fold-and-rise as any part that comes and goes; the card as wide as a grid box
  const showFolded = folded && whole && !!picked;
  return (
    <div className="flex min-w-0 flex-col sm:w-[calc(50%-0.375rem)]">
      <Reveal show={showFolded} gap="0px">
        {foldedView}
      </Reveal>
      <Reveal show={!showFolded} gap="0px">
        {openView}
      </Reveal>
    </div>
  );
}

// Bank, or Cash + Bank: a card per place (cash, a bank account; Auto fills them, or they're picked one by one). While the cards come to less than the amount, Another account beside the
// last card adds one (only once that card has an account and an amount, and while there's an account left)
export function ManualAccounts() {
  const { t, value, gridPlaces, setGridText, setGridMode, gridAuto, setGridAuto } =
    usePaymentEntry();
  // back on this card (Back from the next one): the cards come back from the amounts already in, folded; otherwise
  // one empty card
  const [picks, setPicks] = useState<(string | null)[]>(() => {
    const ids = gridPlaces.filter((p) => p.amount > 0).map((p) => p.id);
    return ids.length > 0 ? ids : [null];
  });
  const [folds, setFolds] = useState<boolean[]>(() => picks.map((id) => id !== null));
  const accounts = gridPlaces;
  // Auto: a card for each account it filled (open), kept as they are once typing turns Auto off; Auto
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
      // Auto's cards start open, each with its details (and its QR on a phone)
      setFolds(ids.map(() => false));
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
      {/* Breakdown, headed like the card's own heading; Auto at the right edge on a phone, right beside it wider */}
      <div className="flex items-center justify-between gap-3 sm:justify-start">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
          {t("breakdown")}
        </h3>
        <AutoSwitch on={gridAuto} set={setGridAuto} />
      </div>
      {/* a bar that fills as the cards take up the amount: given on the left, what's left on the right. It stays
          just under the header while the cards scroll, for reference, on the card's ivory edge to edge, with room
          below it */}
      <div className="sticky top-16 z-10 -mx-4 mb-2 flex flex-col gap-1.5 bg-ivory px-4 pb-3 pt-2 sm:-mx-5 sm:px-5">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={value}
          aria-valuenow={given}
          className="h-3 overflow-hidden rounded-full bg-transparent shadow-[inset_0_0_0_1px] shadow-success/25"
        >
          <div
            className={cn(
              // green whether full or not
              "h-full rounded-full bg-success transition-[width] duration-300",
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
              // its amount and Paid by go too, and its QR with them
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
            room={Math.max(0, Math.round((value - (given - amountOf(id))) * 100) / 100)}
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
            // as tall as a folded card (its 36px arrow and 6px above and below)
            className={cn(ADD_ON_IVORY, "min-h-12")}
          >
            <Plus className="size-4" aria-hidden />
            {t("anotherAccount")}
          </button>
        )}
      </div>
    </div>
  );
}
