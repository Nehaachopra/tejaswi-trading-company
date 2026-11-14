"use client";

import { useEffect, useRef, useState } from "react";

// the edges fade out where more is hidden, so it's clear the row scrolls
const FADE = "16px";
const mask = (left: boolean, right: boolean) =>
  `linear-gradient(to right, ${left ? "transparent" : "#000"}, #000 ${left ? FADE : "0"}, #000 calc(100% - ${right ? FADE : "0px"}), ${right ? "transparent" : "#000"})`;

// a row that scrolls sideways (pack size chips, an order's item cards): fades the edge where more is hidden, and lets a
// vertical mouse wheel scroll it sideways while it has more to show. `count`: how many things are in it, to measure again
export function useSideScroll<T extends HTMLElement>(count: number) {
  const ref = useRef<T>(null);
  const [hidden, setHidden] = useState({ left: false, right: false });

  // which edges have things scrolled out of sight
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setHidden({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  };

  // measure on resize, and turn a vertical wheel into a sideways scroll
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [count]);

  const m = mask(hidden.left, hidden.right);
  return { ref, onScroll: measure, style: { maskImage: m, WebkitMaskImage: m } };
}
