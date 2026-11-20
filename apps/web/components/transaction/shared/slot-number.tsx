"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

// how long a roll takes (the slot-in / slot-out animations in globals.css), and the pause before it starts
const ROLL_MS = 900;
const PAUSE_MS = 250;

// a number that rolls slowly like a slot machine's reel when it changes: the new one comes in as the old one goes
// out, up when it grows, down when it shrinks. `hold`: while something covers it (a line card), it keeps the old
// number and rolls only once that's gone, after a short pause. Anyone who asks for less motion just sees it change
export function SlotNumber({ value, hold = false, className }: { value: number; hold?: boolean; className?: string }) {
  // the number on screen, and the one before it while it rolls out; `turn` restarts each roll
  const [shown, setShown] = useState(value);
  const [old, setOld] = useState<{ n: number; up: boolean; turn: number } | null>(null);
  const turns = useRef(0);
  useEffect(() => {
    if (hold || value === shown) return;
    const start = setTimeout(() => {
      const turn = ++turns.current;
      setOld({ n: shown, up: value > shown, turn });
      setShown(value);
      // the old number goes once its roll is over, whether or not the animation ran
      setTimeout(() => setOld((o) => (o?.turn === turn ? null : o)), ROLL_MS);
    }, PAUSE_MS);
    return () => clearTimeout(start);
  }, [value, shown, hold]);

  return (
    <span className={cn("relative inline-block overflow-hidden align-bottom", className)}>
      {/* the number on screen, rolling in */}
      <span
        key={old?.turn ?? "still"}
        className={cn("block", old && (old.up ? "animate-slot-in-up" : "animate-slot-in-down"), "motion-reduce:animate-none")}
      >
        {shown.toLocaleString("en-IN")}
      </span>
      {/* the old one, rolling out over the same spot */}
      {old && (
        <span
          aria-hidden
          className={cn("absolute inset-0 motion-reduce:hidden", old.up ? "animate-slot-out-up" : "animate-slot-out-down")}
        >
          {old.n.toLocaleString("en-IN")}
        </span>
      )}
    </span>
  );
}
