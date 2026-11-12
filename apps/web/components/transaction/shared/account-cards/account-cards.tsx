"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { cn } from "~/lib/utils";

import { Meter } from "../meter";
import { AutoSwitch } from "../split-grid";
import { AccountCard } from "./account-card";
import { type AccountCardsApi } from "./types";

// Bank, or Cash + Bank: a card per place (cash, a bank account), picked one by one (or filled by Auto, where the form
// has it), under a bar showing how much of the amount they take up. While they come to less than the amount, Another
// account beside the last card adds one (once that card has a place and an amount, and while a place is left)
export function AccountCards({ api }: { api: AccountCardsApi }) {
  const { value, places, setText, setMode, auto, labels } = api;
  // back on this card (Back from the next one): the cards come back from the amounts already in, folded; otherwise
  // one empty card
  const [picks, setPicks] = useState<(string | null)[]>(() => {
    const ids = places.filter((p) => p.amount > 0).map((p) => p.id);
    return ids.length > 0 ? ids : [null];
  });
  const [folds, setFolds] = useState<boolean[]>(() => picks.map((id) => id !== null));
  // Auto: a card for each place it filled (open), kept as they are once typing turns Auto off; Auto switched off by
  // hand empties everything, so it's back to one empty card
  const autoKey = auto?.on
    ? places
        .filter((p) => p.amount > 0)
        .map((p) => p.id)
        .join()
    : null;
  const anyAmount = places.some((p) => p.amount > 0);
  useEffect(() => {
    if (autoKey !== null) {
      const ids = autoKey === "" ? [null] : autoKey.split(",");
      setPicks(ids);
      setFolds(ids.map(() => false));
    } else if (!anyAmount) {
      setPicks([null]);
      setFolds([false]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when Auto's places change, or Auto goes off
  }, [autoKey]);

  const amountOf = (id: string | null) => places.find((p) => p.id === id)?.amount ?? 0;
  const given = Math.round(picks.reduce((sum, id) => sum + amountOf(id), 0) * 100) / 100;
  const last = picks.at(-1) ?? null;
  const canAdd =
    given < value && last !== null && amountOf(last) > 0 && picks.length < places.length;
  const left = Math.max(0, Math.round((value - given) * 100) / 100);
  const done = value > 0 && left === 0;
  // how much of the amount the cards take up, as a share (the meter's fill and its coin)
  const share = value > 0 ? Math.min(100, (given / value) * 100) : 0;
  return (
    <div className="flex flex-col gap-3">
      {/* Breakdown, headed like the card's own heading, with Auto (where there is one) at the right edge on a phone,
          right beside it wider */}
      <div className="flex items-center justify-between gap-3 sm:justify-start">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">
          {labels.breakdown}
        </h3>
        {auto && <AutoSwitch on={auto.on} set={auto.set} />}
      </div>
      {/* the meter above the cards: what's still left to place, filling as the cards take their parts, green with a
          tick once nothing is left. As wide as one card; it stays just under the header while the cards scroll, on the
          card's ivory, so it's always in view */}
      <Meter
        label={labels.barLeft}
        figure={left}
        share={share}
        done={done}
        doneLabel={labels.barDone}
        className="sticky top-16 z-10 bg-ivory py-2 sm:w-[calc(50%-0.375rem)]"
      />
      {/* wider screens: two to a row, a shorter card (cash) stretched to its neighbour's height */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
        {picks.map((id, i) => (
          <AccountCard
            key={i}
            api={api}
            index={i}
            pickedId={id}
            setPickedId={(next) => setPicks((all) => all.map((x, j) => (j === i ? next : x)))}
            folded={folds[i] ?? false}
            onFold={(f) => setFolds((all) => all.map((x, j) => (j === i ? f : x)))}
            onRemove={() => {
              // its amount and how it was paid go too, and its QR with them
              if (id) {
                setText(id, "");
                setMode(id, null);
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
            className={cn(ADD_ON_IVORY, "min-h-12 sm:self-start")}
          >
            <Plus className="size-4" aria-hidden />
            {labels.anotherAccount}
          </button>
        )}
      </div>
    </div>
  );
}
