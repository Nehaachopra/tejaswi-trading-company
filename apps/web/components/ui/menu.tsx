"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "~/lib/utils";

// a button that opens a small ivory panel below it, on an ivory surface (the header) or the chestnut page;
// a tap outside, Escape or picking an item closes it
export function Menu({
  label,
  trigger,
  triggerClassName,
  surface = "ivory",
  align = "right",
  plain = false,
  boxed = false,
  matchWidth = false,
  inFlow = false,
  floating = false,
  panelClassName,
  asksFirst = false,
  disabled,
  openSignal = 0,
  onOpenChange,
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  surface?: "ivory" | "chestnut";
  align?: "left" | "right";
  // an icon button with no edge (the ⋯ menus); a dropdown field has only a line under it
  plain?: boolean;
  // a small button with a full edge (the header's language and profile)
  boxed?: boolean;
  // the panel is exactly as wide as the trigger
  matchWidth?: boolean;
  // the panel opens in the page's flow, pushing what's below it down, instead of over it
  inFlow?: boolean;
  // the panel is pinned to the screen under the trigger, so a row that scrolls sideways doesn't cut it off
  floating?: boolean;
  panelClassName?: string;
  // a half-filled form asks before it opens (see useLeaveGuard)
  asksFirst?: boolean;
  disabled?: boolean;
  // each new number opens the panel from outside (a question answered No: pick again)
  openSignal?: number;
  // told each time the panel opens or closes
  onOpenChange?: (open: boolean) => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);
  useEffect(() => {
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens or closes
  }, [open]);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = () => setOpen(false);

  // a floating panel: placed under the trigger's left or right edge, and kept there while the page or row scrolls
  const [spot, setSpot] = useState<{ top: number; left?: number; right?: number } | null>(null);
  useEffect(() => {
    if (!open || !floating) return;
    const place = () => {
      const r = root.current?.getBoundingClientRect();
      if (!r) return;
      setSpot(align === "right" ? { top: r.bottom, right: window.innerWidth - r.right } : { top: r.bottom, left: r.left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, floating, align]);

  // closing: a tap anywhere else, or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      {/* the trigger */}
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        data-asks-first={asksFirst || undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 items-center justify-center gap-1.5 transition-colors disabled:opacity-40",
          plain || boxed ? "rounded-control border" : "rounded-none border-b",
          plain
            ? cn("border-transparent", surface === "ivory" ? "text-chestnut hover:bg-chestnut/[0.08]" : "text-ivory hover:bg-ivory/10", open && (surface === "ivory" ? "bg-chestnut/[0.08]" : "bg-ivory/10"))
            : surface === "ivory"
              ? cn("border-chestnut/60 text-chestnut hover:border-chestnut", open && "border-chestnut")
              : cn("border-ivory/40 text-ivory hover:border-ivory/70", open && "border-ivory"),
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {/* the panel: an ivory card under the trigger, lined up with its left or right edge */}
      {open && (
        <div
          id={panelId}
          className={cn(
            "on-ivory mt-2 max-h-80 min-w-56 overflow-y-auto rounded-control border border-chestnut/25 bg-ivory p-1.5 text-chestnut",
            inFlow ? "min-w-0" : floating ? "fixed z-40" : "absolute top-full z-40",
            !inFlow && !floating && (matchWidth ? "inset-x-0 min-w-0" : align === "right" ? "right-0" : "left-0"),
            panelClassName,
          )}
          style={floating ? { top: spot?.top, left: spot?.left, right: spot?.right, visibility: spot ? undefined : "hidden" } : undefined}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

// one choice inside a Menu panel
export function MenuItem({
  selected,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm hover:bg-chestnut/[0.06] disabled:opacity-40",
        selected && "bg-chestnut font-medium text-ivory hover:bg-chestnut",
        className,
      )}
    />
  );
}
