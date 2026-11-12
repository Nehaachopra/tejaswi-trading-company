"use client";

import { ChevronDown, IndianRupee, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ERROR_MS, FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { Reveal } from "~/components/ui/reveal";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { BankRefField, ModeAccordion, ModeRows, refOkFor } from "../bank-mode";
import { fieldRow, input, pickRow, pickRowTwo } from "../form-basics";
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
  // "Source", the same word in a payment and a receipt
  const tr = useTranslations("transactions.receipt");
  const { refs, setRefs, refLeft, setRefLeft } = api;
  const ModePick = api.modeRows ? ModeRows : ModeAccordion;
  // a payment's: every field a row, its name on the left and its value or box on the right
  const rows = !!api.fieldRows;
  // the places to pick from: the bank accounts, and cash too for Cash + Bank; not ones on the other cards
  const choices = all.filter((p) => !taken.includes(p.id));
  const picked: GridPlace | null = choices.find((p) => p.id === pickedId) ?? null;

  // the places, each with what it holds (the admin only); money going out: one holding nothing is muted
  const places: Place<string>[] = choices.map((p) => ({
    id: p.id,
    name: p.name,
    sub: p.sub ?? undefined,
    hint: p.held === null || api.hideHeld ? undefined : rupees(p.held),
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
  const refText =
    picked && picked.mode && refs[picked.id]?.mode === picked.mode ? refs[picked.id]!.text : "";
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

  // the card's tint, the sidebar's hover colour; every input in it on ivory (a filled amount stays chestnut)
  const card =
    "flex w-full min-w-0 flex-col justify-between gap-3 rounded-control bg-chestnut/6 p-3 shadow-[0_0_5px_0] shadow-chestnut/25 [&_input:not(.bg-chestnut)]:bg-ivory";
  // its UTR or cheque number, once it says how: under how it was paid, or under the QR for UPI. No hint, (optional)
  const refField = picked && !isCash && picked.amount > 0 && picked.mode && (
    <BankRefField
      plain
      row={rows}
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
      <ChevronDown
        className={cn("size-4 transition-transform", !folded && "rotate-180")}
        aria-hidden
      />
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
        {api.placeFirst ? (
          // a payment's: the place on the left, its amount beside the arrow
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate text-sm font-semibold">{picked.name}</span>
              {picked.sub && (
                <span className="tabular ml-0.5 shrink-0 text-sm opacity-70">{picked.sub}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="tabular font-heading text-xl font-bold">
                {rupees(picked.amount)}
              </span>
              {arrow}
            </span>
          </div>
        ) : (
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="tabular shrink-0 font-heading text-xl font-bold">
              {rupees(picked.amount)}
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate text-sm font-semibold">{picked.name}</span>
              {picked.sub && (
                <span className="tabular ml-0.5 shrink-0 text-sm opacity-70">{picked.sub}</span>
              )}
              {arrow}
            </span>
          </div>
        )}
      </div>
    ) : null;

  const openView = (
    // a tap on the card's plain parts (not a field, chip or button) folds it, once it can fold
    <div
      className={cn(card, rows && "[&_input]:text-right")}
      onClick={(e) =>
        whole &&
        !(e.target as HTMLElement).closest(
          "button, input, label, a, [role=radio], [role=radiogroup]",
        ) &&
        onFold(true)
      }
    >
      {/* which place: a payment's, Source on the left and the places open on the right from the start, then only the
          pick, see-through; otherwise under Source, what it holds muted beside the pick (only the typed amount is
          filled in the card) */}
      <div className={rows ? (picked?.sub ? pickRowTwo : pickRow) : "flex flex-col gap-2.5"}>
        <span className={rows ? undefined : "text-xs font-semibold"}>{tr("source")}</span>
        <PlacePicker
          quiet
          bare={rows}
          label={tr("source")}
          hintPicked={!rows}
          alignEnd={rows}
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
      </div>

      {/* its amount, chestnut once there's one, red past what it holds; never past what's left (nor what it holds,
          money going out): typing past it cuts it there and says why */}
      {/* what it holds (the admin only), a row of its own */}
      {rows && picked && picked.held !== null && !api.hideHeld && (
        <div className={fieldRow}>
          <span>{labels.balance}</span>
          <span className="tabular flex min-h-11 items-center justify-end px-3 text-base font-semibold">
            {rupees(picked.held)}
          </span>
        </div>
      )}
      {picked && (
        <label className={rows ? fieldRow : "flex min-w-0 flex-col gap-2.5 text-xs font-semibold"}>
          <span>{labels.accountAmount}</span>
          <span className={cn("relative block", picked.amount > 0 && !short && "text-ivory")}>
            <IndianRupee
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
              aria-hidden
            />
            <NumberInput
              id={`account-amount-${index}`}
              value={picked.text}
              onChange={(v) => {
                setCapNote(null);
                setText(picked.id, v);
              }}
              onCapped={(most) => {
                const held = capAtHeld ? (picked.held ?? Infinity) : Infinity;
                setCapNote(
                  most < held ? labels.capLeft(rupees(most)) : labels.capOnly(rupees(most)),
                );
              }}
              decimals={2}
              maxDigits={13}
              max={Math.min(capAtHeld ? (picked.held ?? Infinity) : Infinity, room)}
              placeholder="0"
              aria-invalid={short || (tried && picked.amount === 0) || undefined}
              className={cn(
                input(short || (tried && picked.amount === 0)),
                rows
                  ? "min-h-11 pl-10 font-heading text-xl font-bold tabular"
                  : "min-h-14 pl-10 font-heading text-2xl font-bold tabular",
                picked.amount > 0 && !short && "bg-chestnut text-ivory caret-ivory shadow-none",
              )}
            />
          </span>
          {capNote && (
            <FieldMessage tone="warning" className="mt-0">
              {capNote}
            </FieldMessage>
          )}
        </label>
      )}

      {/* how it was paid, once there's an amount: an accordion, of rows (a payment's) or of chips */}
      {picked && !isCash && picked.amount > 0 && (
        <div className={rows ? pickRow : "flex flex-col gap-2 text-xs font-semibold"}>
          <ModePick
            label={labels.mode}
            missing={labels.modeMissing}
            mode={picked.mode}
            tried={tried}
            onPick={(m) => setMode(picked.id, m)}
            {...(rows ? { alignEnd: true } : {})}
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
          idAsRow={rows}
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
      {/* open, it fills the card's height (stretched beside a taller one), the bin and arrow at the bottom */}
      <Reveal
        show={!showFolded}
        gap="0px"
        className={cn(
          !showFolded &&
            "sm:flex-1 sm:[&>div>div>div]:h-full sm:[&>div>div]:h-full sm:[&>div]:h-full",
        )}
      >
        {openView}
      </Reveal>
    </div>
  );
}
