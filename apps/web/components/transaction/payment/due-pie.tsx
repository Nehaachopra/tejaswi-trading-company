"use client";

import { Fragment, useEffect, useState } from "react";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

// one part of the pie: the see-through one (what's due) or the chestnut one (an advance, or what the payment settles)
export type PiePart = { key: string; name: string; amount: number; filled: boolean };

// the pie's middle and how far out it reaches, in its drawing's own units
const PIE = { cx: 56, cy: 78, r: 54 };
// the chestnut slice is drawn as a thick ring's stroke (half the pie's reach out, as thick as the reach), so its
// length can grow and shrink smoothly: this is the ring's whole way round
const ROUND = Math.PI * PIE.r;

// a point on the pie: degrees clockwise from the top, and how far out from the middle
const at = (deg: number, out: number) => {
  const rad = (deg * Math.PI) / 180;
  return {
    x: Math.round((PIE.cx + PIE.r * out * Math.sin(rad)) * 100) / 100,
    y: Math.round((PIE.cy - PIE.r * out * Math.cos(rad)) * 100) / 100,
  };
};

// a payment's due as a pie, on wider screens: the chestnut slice (an advance, or what the payment settles) and the
// see-through rest (what's due). The two meet pointing right (3 o'clock); the see-through part runs up and round from
// there, the chestnut one down and round, so the first is always the upper slice and the second the lower. No legend:
// an L-shaped line leaves each slice's edge (a dot marks where) for its name and figure, both to the pie's right, the upper's
// straight up past the pie's top then across, the lower's straight down past its bottom then across (one part alone:
// its line straight across). All one drawing, so nothing in it can run into anything else.
// The chestnut slice sweeps in when the pie first shows and sweeps to its new size when the amounts change; the lines
// and words fade in once it's there. All of the due settled, with nothing over: the whole pie is green
export function DuePie({ parts }: { parts: PiePart[] }) {
  const filled = parts.find((part) => part.filled)?.amount ?? 0;
  const both = parts.reduce((sum, part) => sum + part.amount, 0);
  const filledTurn = both > 0 ? (filled / both) * 360 : 0;
  const alone = parts.length === 1;
  // all of the due settled, nothing left and no advance: the whole pie turns green
  const allSettled = alone && parts[0]?.key === "settled";

  // first drawn with no slice, then at its size, so it sweeps in
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const leaders = parts.map((part) => {
    // where its line leaves the pie, on the pie's edge: the very top (the upper slice) or the very bottom (the lower),
    // where the line's turn runs level with the edge; a slice too thin to reach there, the middle of its own edge.
    // One part alone: the edge's rightmost point
    const turn = part.filled ? filledTurn : 360 - filledTurn;
    const from = alone
      ? at(90, 1)
      : turn >= 90
        ? at(part.filled ? 180 : 0, 1)
        : at(part.filled ? 90 + turn / 2 : 90 - turn / 2, 1);
    return {
      ...part,
      ...from,
      figure: rupees(part.amount),
      lineY: alone ? PIE.cy : part.filled ? PIE.cy + PIE.r + 10 : PIE.cy - PIE.r - 10,
    };
  });
  const lineEnd = PIE.cx + PIE.r + 14;
  const textX = PIE.cx + PIE.r + 20;

  return (
    <svg
      viewBox="0 0 230 172"
      role="img"
      aria-label={leaders.map((l) => `${l.name}: ${l.figure}`).join(", ")}
      className="w-full max-w-[14.375rem] overflow-visible"
    >
      {/* the chestnut slice: from 3 o'clock, clockwise, as long as its share */}
      <circle
        cx={PIE.cx}
        cy={PIE.cy}
        r={PIE.r / 2}
        fill="none"
        className={cn(
          "transition-[stroke-dasharray,stroke] duration-700 ease-out motion-reduce:transition-none",
          allSettled ? "stroke-success" : "stroke-chestnut",
        )}
        strokeWidth={PIE.r}
        strokeDasharray={`${drawn ? (filledTurn / 360) * ROUND : 0} ${ROUND}`}
      />
      {/* the pie's edge */}
      <circle
        cx={PIE.cx}
        cy={PIE.cy}
        r={PIE.r}
        fill="none"
        className={allSettled ? "stroke-success" : "stroke-chestnut/50"}
        strokeWidth={1.5}
      />
      {/* the lines and words: drawn again (and so faded in again) whenever the slices change */}
      <g key={`${filledTurn}|${parts.map((part) => part.key).join()}`} className="pie-words">
        {leaders.map((l) => (
          <Fragment key={l.key}>
            <path
              d={`M${l.x} ${l.y} V${l.lineY} H${lineEnd}`}
              fill="none"
              className="stroke-chestnut/40"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* where the line starts, on the pie's edge */}
            <circle
              cx={l.x}
              cy={l.y}
              r={3}
              className={cn("fill-ivory", allSettled ? "stroke-success" : "stroke-chestnut")}
              strokeWidth={1.5}
            />
            {/* its name right where the line ends, level with it, and its figure under the name */}
            <text x={textX} y={l.lineY + 4} className="fill-chestnut/60 text-xs font-semibold">
              {l.name}
            </text>
            <text
              x={textX}
              y={l.lineY + 26}
              className="tabular fill-chestnut text-base font-semibold"
            >
              {l.figure}
            </text>
          </Fragment>
        ))}
      </g>
    </svg>
  );
}
