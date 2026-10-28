"use client";

import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";

// an amount whose digits roll into place like a slot machine: each digit is a reel of 0–9 that spins down to its
// number, the reels from the right settling a little later than the ones before. Commas, ₹ and signs stay put.
// Reduced motion: it just shows the amount (the global rule shortens the transition)
export function SlotAmount({ text, className }: { text: string; className?: string }) {
  const [rolled, setRolled] = useState(false);

  // start at 0 on every reel, then roll on the next frame so the transition runs
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRolled(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const chars = [...text];
  let seen = 0;

  return (
    <span className={cn("tabular inline-flex items-baseline overflow-hidden leading-none", className)} aria-label={text}>
      {chars.map((c, i) => {
        if (!/\d/.test(c)) {
          return (
            <span key={i} aria-hidden className="whitespace-pre">
              {c}
            </span>
          );
        }
        const d = Number(c);
        // two turns of the reel before stopping, so even a 0 spins
        const stop = rolled ? 20 + d : 0;
        const order = seen++;
        return (
          <span key={i} aria-hidden className="relative inline-block h-[1em] overflow-hidden">
            {/* keeps the reel one digit wide */}
            <span className="invisible">0</span>
            <span
              className="absolute inset-x-0 top-0 flex flex-col transition-transform ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{ transform: `translateY(-${stop}em)`, transitionDuration: `${900 + order * 120}ms` }}
            >
              {Array.from({ length: 30 }, (_, n) => (
                <span key={n} className="h-[1em] text-center">
                  {n % 10}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
