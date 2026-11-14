"use client";

import { useEffect } from "react";

import { useSideScroll } from "~/components/ui/use-side-scroll";
import { packLabel } from "~/lib/format";
import { cn } from "~/lib/utils";

// `name` stands in for the size, e.g. a pack size still being typed
type Pack = { productId: string; packSize: number; packSizeCode: "KGS" | "LTR" | "BOX" | "PCS"; isActive: boolean; name?: string };

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
  const side = useSideScroll<HTMLDivElement>(packs.length);
  const row = side.ref;

  // bring the selected chip into view
  useEffect(() => {
    const el = row.current;
    const chip = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !chip) return;
    const left = chip.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    if (left < el.scrollLeft || left + chip.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: left - (el.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [row, selected]);

  return (
    <div
      ref={row}
      role="group"
      aria-label={label}
      onScroll={side.onScroll}
      style={side.style}
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
