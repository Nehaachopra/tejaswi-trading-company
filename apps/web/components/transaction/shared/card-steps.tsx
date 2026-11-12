"use client";

import { cn } from "~/lib/utils";
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

// a transaction form's cards in the browser's history: each card moved to is a step back can return to, so the phone's
// (or browser's) Back goes to the card before instead of leaving the form. Returns `remember(card)` to call on each move
export function useCardHistory<T extends string>(first: T, onBack: (card: T) => void) {
  // the latest handler, so the listener added once always calls it
  const handler = useRef(onBack);
  handler.current = onBack;

  useEffect(() => {
    // the first card marks where the form starts (the router's own state is kept alongside)
    window.history.replaceState({ ...window.history.state, card: first }, "");
    const onPop = (e: PopStateEvent) => {
      const card = (e.state as { card?: T } | null)?.card;
      if (card) handler.current(card);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the form opens
  }, []);

  return (card: T) => window.history.pushState({ ...window.history.state, card }, "");
}

// how far along the form is: a thin bar that fills as cards are done, read out as "2 of 5"
export function StepProgress({
  done,
  all,
  label,
  className,
}: {
  done: number;
  all: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={all}
      aria-valuenow={done}
      aria-valuetext={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-chestnut/15", className)}
    >
      <div
        className="h-full rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${all === 0 ? 0 : (done / all) * 100}%` }}
      />
    </div>
  );
}

// moves to another card: where the browser can, the card morphs to the new one's height while its content slides
// (forwards from the right, `back` from the left); elsewhere, or with reduced motion, it just changes and rises in
export function moveCard(update: () => void, back = false) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof document.startViewTransition !== "function") return update();
  const html = document.documentElement;
  html.dataset.cardDir = back ? "back" : "next";
  // the card's own rise stays off from now on: the move already brings it in (taking it back would replay the rise)
  html.dataset.cardMorphs = "";
  const move = document.startViewTransition(() => flushSync(update));
  void move.finished.finally(() => delete html.dataset.cardDir);
}
