"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";

// how long a part takes to open or close; the CSS (.reveal) uses the same
const DURATION = 420;

// a part of a card that comes and goes (a field once it's needed, a table once there's an amount): it opens the card
// up to make room, then fades and rises into place; going, it folds away the same way instead of vanishing. `gap` is
// the space its parent puts between parts (1rem, gap-4, unless given; a class can set --reveal-gap too), taken back while closed so nothing jumps. Shown when the
// card opens, it's simply there (the card itself rises in). With `follow`, on a phone the page scrolls just enough to
// bring it into view once it has opened (not at all when it's already in view)
export function Reveal({ show, children, gap, follow = false, className }: { show: boolean; children: ReactNode; gap?: string; follow?: boolean; className?: string }) {
  const [mounted, setMounted] = useState(show);
  const [open, setOpen] = useState(show);
  // open and done moving: only then may its shadows, lists and menus spill outside it
  const [settled, setSettled] = useState(show);
  // what it last showed, kept while it folds away
  const last = useRef(children);
  if (show) last.current = children;
  const box = useRef<HTMLDivElement>(null);
  // shown when the card opened: nothing to scroll to then
  const first = useRef(true);

  useEffect(() => {
    if (show) {
      setMounted(true);
      // a frame closed first, so the browser has something to open from
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
      const s = setTimeout(() => setSettled(true), DURATION + 40);
      // on a phone, scroll it into view as it opens (below the header, above the bottom bar)
      const opened = first.current;
      first.current = false;
      const scroll =
        follow && !opened && window.matchMedia("(max-width: 639px)").matches
          ? setTimeout(() => box.current && bringIntoView(box.current), 120)
          : undefined;
      return () => {
        cancelAnimationFrame(f);
        clearTimeout(s);
        clearTimeout(scroll);
      };
    }
    first.current = false;
    setSettled(false);
    setOpen(false);
    const t = setTimeout(() => setMounted(false), DURATION);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it comes or goes
  }, [show]);

  if (!mounted && !show) return null;
  return (
    <div
      ref={box}
      data-open={open || undefined}
      inert={!show || undefined}
      style={gap ? ({ "--reveal-gap": gap } as React.CSSProperties) : undefined}
      className={cn("reveal", className)}
    >
      {/* clipped only while it moves, with a little room so field shadows still show */}
      <div className={cn("-m-1 min-h-0 min-w-0 p-1", !settled && "overflow-hidden")}>
        {/* the inner part moves while the space opens around it */}
        <div className="reveal-inner">{show ? children : last.current}</div>
      </div>
    </div>
  );
}

// the room the phone's header and bottom bar take, kept clear when scrolling something into view
const ROOM_TOP = 80;
const ROOM_BOTTOM = 112;

// scrolls the page just enough to show a part whole once it has opened (its top first, when it's taller than the
// screen), easing out over a moment; nothing when it's already in view. It's measured at its full size, not as far
// as it has opened so far
function bringIntoView(el: HTMLElement) {
  const box = el.getBoundingClientRect();
  const full = el.querySelector<HTMLElement>(".reveal-inner")?.offsetHeight ?? box.height;
  const r = { top: box.top, bottom: box.top + full };
  const view = window.innerHeight;
  let by = 0;
  if (r.bottom > view - ROOM_BOTTOM) by = r.bottom - (view - ROOM_BOTTOM);
  if (r.top - by < ROOM_TOP) by = r.top - ROOM_TOP;
  if (Math.abs(by) < 2) return;
  const from = window.scrollY;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return window.scrollTo(0, from + by);
  const start = performance.now();
  const span = 420;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / span);
    window.scrollTo(0, from + by * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
