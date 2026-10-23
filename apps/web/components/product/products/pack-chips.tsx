"use client";

import { useEffect, useRef, useState } from "react";

import { packLabel } from "~/lib/format";
import { cn } from "~/lib/utils";

// `name` stands in for the size, e.g. a pack size still being typed
type Pack = { productId: string; packSize: number; packSizeCode: "KGS" | "ML" | "BOX" | "PCS"; isActive: boolean; name?: string };

// the edges fade out where more chips are hidden, so it's clear the row scrolls
const FADE = "16px";
const mask = (left: boolean, right: boolean) =>
  `linear-gradient(to right, ${left ? "transparent" : "#000"}, #000 ${left ? FADE : "0"}, #000 calc(100% - ${right ? FADE : "0px"}), ${right ? "transparent" : "#000"})`;

// one chip per pack size, on one line that scrolls sideways (no scrollbar; swipe, or the mouse wheel);
// the selected one is filled with the surface's ink (chestnut on ivory, ivory on the chestnut page for an
// inactive product) and kept in view; an inactive pack size is dashed and faded
export function PackChips({
  packs,
  selected,
  onSelect,
  label,
  onChestnut = false,
}: {
  packs: Pack[];
  selected: string;
  onSelect: (productId: string) => void;
  label: string;
  onChestnut?: boolean;
}) {
  const filled = onChestnut ? "border-ivory bg-ivory text-chestnut" : "border-chestnut bg-chestnut text-ivory";
  const row = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState({ left: false, right: false });

  // which edges have chips scrolled out of sight
  const measure = () => {
    const el = row.current;
    if (!el) return;
    setHidden({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  };

  // measure on resize, and let a vertical mouse wheel scroll the row sideways while it has more to show
  useEffect(() => {
    const el = row.current;
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
  }, [packs.length]);

  // bring the selected chip into view
  useEffect(() => {
    const el = row.current;
    const chip = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !chip) return;
    const left = chip.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    if (left < el.scrollLeft || left + chip.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: left - (el.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [selected]);

  return (
    <div
      ref={row}
      role="group"
      aria-label={label}
      onScroll={measure}
      style={{ maskImage: mask(hidden.left, hidden.right), WebkitMaskImage: mask(hidden.left, hidden.right) }}
      className="-mx-1 flex min-w-0 touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {packs.map((pack) => (
        <button
          key={pack.productId}
          type="button"
          aria-pressed={pack.productId === selected}
          onClick={() => onSelect(pack.productId)}
          className={cn(
            "tabular min-h-8 shrink-0 rounded-control border px-2.5 text-xs transition-colors",
            pack.productId === selected ? `${filled} font-semibold` : "border-current/50 hover:border-current",
            !pack.isActive && "border-dashed opacity-60",
          )}
        >
          {pack.name ?? packLabel(pack.packSize, pack.packSizeCode)}
        </button>
      ))}
    </div>
  );
}
