"use client";

import { ChevronDown, IndianRupee, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ERROR_MS } from "~/components/ui/field-message";
import { Note } from "~/components/ui/note";
import { NumberInput } from "~/components/ui/number-input";
import { Reveal } from "~/components/ui/reveal";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { BankRefField, ModeAccordion, refOkFor } from "../bank-mode";
import { input } from "../form-basics";
import { type Place, PlacePicker } from "../place-picker";
import { type GridPlace } from "../split-grid";
import { UpiQr } from "../upi-qr";
import { type AccountCardsApi } from "./types";

// one place money goes out of or comes into (cash, a bank account): a card as wide as half the row that grows as it's
// filled. First the places as an accordion; once one is picked, its amount; once that's more than nothing, how it was
// paid, then (UPI) the UPI ID and the QR, and its reference. Folded, it's one line: the amount, the place and the arrow
export function AccountCard({
  api,
  index,
  pickedId,
  setPickedId,
  taken,
  room,
  folded,
  onFold,
  onRemove,
}: {
  api: AccountCardsApi;
  index: number;
  pickedId: string | null;
  setPickedId: (id: string) => void;
  // places picked on the other cards, left out of this one's list
  taken: string[];
  // what's left once the other cards' amounts are taken off: this card can't take more
  room: number;
  folded: boolean;
  onFold: (folded: boolean) => void;
  // takes this card away (the only card is emptied instead)
  onRemove: () => void;
}) {
  const { labels, tried, places: all, setText, setMode, capAtHeld, qrItems, qrId, upiPart } = api;
  const { refs, setRefs, refLeft, setRefLeft } = api;
  // the places to pick from: the bank accounts, and cash too for Cash + Bank; not ones on the other cards
  const choices = all.filter((p) => !taken.includes(p.id));
  const picked: GridPlace | null = choices.find((p) => p.id === pickedId) ?? null;

  // the places, each with what it holds (the admin only); money going out: one holding nothing is muted
  const places: Place<string>[] = choices.map((p) => ({
    id: p.id,
    name: p.name,
    sub: p.sub ?? undefined,
    hint: p.held === null ? undefined : rupees(p.held),
    disabled: capAtHeld && p.held !== null && p.held <= 0,
  }));
  // a pick puts the cursor straight in its amount
  useEffect(() => {
    if (pickedId) document.getElementById(`account-amount-${index}`)?.focus();
  }, [pickedId, index]);

  const short = capAtHeld && !!picked && picked.held !== null && picked.amount > picked.held;
  // it folds once it has a place and an amount
  const whole = !!picked && picked.amount > 0;
  // cash takes only an amount: no way it was paid, no UPI
  const isCash = picked?.id === "cash";
  const refText = picked && picked.mode && refs[picked.id]?.mode === picked.mode ? refs[picked.id]!.text : "";
  const refBad = !!picked && !isCash && !!picked.mode && !refOkFor(picked.mode, refText);
  // something wrong on it (how it was paid, past what it holds, a reference that doesn't fit) once Next was tapped: a
  // folded card opens to show it
  const faulty = tried && !!picked && ((!isCash && picked.mode === null) || short || refBad);
  useEffect(() => {
    if (folded && faulty) onFold(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it turns faulty or is folded
  }, [folded, faulty]);

  // why the amount was cut (past what's left, or past what it holds); it goes after a while like every problem's words
  const [capNote, setCapNote] = useState<string | null>(null);
  useEffect(() => {
    if (!capNote) return;
    const timer = setTimeout(() => setCapNote(null), ERROR_MS);
    return () => clearTimeout(timer);
  }, [capNote]);

  const card =
    "flex w-full min-w-0 flex-col justify-between gap-3 rounded-control bg-chestnut/8 p-3 shadow-[0_0_5px_0] shadow-chestnut/25";
  // its UTR or cheque number, once it says how: under how it was paid, or under the QR for UPI. No hint, (optional)
  const refField = picked && !isCash && picked.amount > 0 && picked.mode && (
    <BankRefField
      plain
      mode={picked.mode}
      text={refText}
      onText={(text) => {
        setRefLeft((l) => l.filter((k) => k !== picked.id));
        setRefs((r) => ({ ...r, [picked.id]: { mode: picked.mode!, text } }));
      }}
      left={refLeft.includes(picked.id)}
      onLeave={() => setRefLeft((l) => (l.includes(picked.id) ? l : [...l, picked.id]))}
      tried={tried}
    />
  );
  // this account's QR, by UPI
  const ownQr = (picked && qrItems.find((q) => q.key === picked.id)) ?? null;
  const qrIdOf = picked ? qrId(picked.id) : { hideId: false };

  // the arrow that folds the card or opens it again
  const arrow = (
    <button
      type="button"
      aria-expanded={!folded}
      aria-label={picked?.name ?? labels.account}
      onClick={() => onFold(!folded)}
      className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
    >
      <ChevronDown className={cn("size-4 transition-transform", !folded && "rotate-180")} aria-hidden />
    </button>
  );
  // the bin, once a place is picked: the card goes, and its amount and how it was paid with it
  const remove = picked && (
    <button
      type="button"
      aria-label={labels.removeAccount}
      onClick={onRemove}
      className="grid size-9 shrink-0 place-items-center rounded-control text-danger hover:bg-danger/10"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );

  // folded: one line, the amount on the left, the place (a long bank name cut short, its last digits in full) and the
  // arrow on the right; the open card's fill, red-edged while something's wrong on it. A tap anywhere opens it
  const foldedView =
    whole && picked ? (
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
        className={cn("cursor-pointer", card, "gap-1 py-1.5", faulty && "shadow-danger/80")}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="tabular shrink-0 font-heading text-xl font-bold">{rupees(picked.amount)}</span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate text-sm font-semibold">{picked.name}</span>
            {picked.sub && <span className="tabular ml-0.5 shrink-0 text-sm opacity-70">{picked.sub}</span>}
            {arrow}
          </span>
        </div>
      </div>
    ) : null;

  const openView = (
    // a tap on the card's plain parts (not a field, chip or button) folds it, once it can fold
    <div
      className={card}
      onClick={(e) =>
        whole &&
        !(e.target as HTMLElement).closest("button, input, label, a, [role=radio], [role=radiogroup]") &&
        onFold(true)
      }
    >
      {/* which place, what it holds muted beside it once picked */}
      <PlacePicker
        label={labels.account}
        hintPicked
        places={places}
        value={pickedId}
        invalid={tried && !picked}
        onPick={(id) => {
          // a pick starts afresh: no amount, no way it was paid, on the old place or the new one
          for (const one of [pickedId, id]) {
            if (!one) continue;
            setText(one, "");
            setMode(one, null);
          }
          setPickedId(id);
        }}
      />

      {/* its amount, chestnut once there's one, red past what it holds; never past what's left (nor what it holds,
          money going out): typing past it cuts it there and says why */}
      {picked && (
        <label className="flex min-w-0 flex-col gap-2.5 text-xs font-semibold">
          {labels.accountAmount}
          <span className={cn("relative block", picked.amount > 0 && !short && "text-ivory")}>
            <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2" aria-hidden />
            <NumberInput
              id={`account-amount-${index}`}
              value={picked.text}
              onChange={(v) => {
                setCapNote(null);
                setText(picked.id, v);
              }}
              onCapped={(most) => {
                const held = capAtHeld ? (picked.held ?? Infinity) : Infinity;
                setCapNote(most < held ? labels.capLeft(rupees(most)) : labels.capOnly(rupees(most)));
              }}
              decimals={2}
              maxDigits={13}
              max={Math.min(capAtHeld ? (picked.held ?? Infinity) : Infinity, room)}
              placeholder="0"
              aria-invalid={short || (tried && picked.amount === 0) || undefined}
              className={cn(
                input(short || (tried && picked.amount === 0)),
                "min-h-14 pl-10 font-heading text-2xl font-bold tabular",
                picked.amount > 0 && !short && "bg-chestnut text-ivory caret-ivory",
              )}
            />
          </span>
          {capNote && <Note className="text-amber-700">{capNote}</Note>}
        </label>
      )}

      {/* how it was paid, once there's an amount */}
      {picked && !isCash && picked.amount > 0 && (
        <div className="flex flex-col gap-2 text-xs font-semibold">
          <ModeAccordion
            label={labels.mode}
            missing={labels.modeMissing}
            mode={picked.mode}
            tried={tried}
            onPick={(m) => setMode(picked.id, m)}
          />
        </div>
      )}
      {/* its reference right under how it was paid (UPI: under the QR instead) */}
      {picked?.mode !== "upi" && refField}
      {/* by UPI: the UPI ID's box (or a note), then the QR with the ID above it and a pen to change it */}
      {picked && picked.amount > 0 && picked.mode === "upi" && upiPart(picked)}
      {ownQr && picked?.mode === "upi" && (
        <UpiQr
          key={`${ownQr.key}|${ownQr.upiIds.join()}`}
          upiIds={ownQr.upiIds}
          payee={ownQr.payee}
          amount={ownQr.amount}
          note={ownQr.note}
          hideId={qrIdOf.hideId}
          onEdit={qrIdOf.onEdit}
          row={api.qrRow}
          idLabel={api.qrIdLabel}
        />
      )}
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

  // folded and open swap with the same fold-and-rise as any part that comes and goes; half the row wide
  const showFolded = folded && whole;
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
